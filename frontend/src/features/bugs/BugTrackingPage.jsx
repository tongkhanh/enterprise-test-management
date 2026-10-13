import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bug, Check, Filter, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { bugApi, workspaceApi } from '@/api/client'
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui'
import { EmptyState, MetricCard, PageHeader } from '@/components/common/PageKit'
import { formatDate } from '@/lib/utils'

const statusTone = { New: 'blue', Open: 'amber', InProgress: 'purple', Resolved: 'green', Verified: 'green', Closed: 'slate', Reopened: 'red' }
const severityTone = { Critical: 'red', Major: 'amber', Minor: 'blue', Trivial: 'slate' }

export default function BugTrackingPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const query = useQuery({ queryKey: ['bugs'], queryFn: () => bugApi.list() })
  const projects = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const roles = new Map((projects.data || []).map((item) => [item._id, item.currentRole]))
  const decide = useMutation({ mutationFn: ({ id, ...body }) => bugApi.decide(id, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bugs'] }); toast.success('Đã cập nhật quyết định Bug') }, onError: (error) => toast.error(error.message) })
  const bugs = useMemo(() => (query.data || []).filter((bug) => {
    const keyword = search.trim().toLowerCase()
    return (!status || bug.status === status) && (!keyword || `${bug.title} ${bug.project?.name || ''}`.toLowerCase().includes(keyword))
  }), [query.data, search, status])
  const all = query.data || []
  const open = all.filter((bug) => !['Closed', 'Verified'].includes(bug.status)).length
  const critical = all.filter((bug) => bug.severity === 'Critical' && !['Closed', 'Verified'].includes(bug.status)).length

  return <div className="space-y-5"><PageHeader eyebrow="Quality" title="Bug Tracking" description="Theo dõi lỗi sản phẩm, mức độ ưu tiên và trạng thái xử lý trên các Project bạn tham gia." />
    <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Tổng số Bug" value={all.length} icon={Bug} /><MetricCard label="Đang mở" value={open} icon={Filter} tone="amber" /><MetricCard label="Critical chưa xử lý" value={critical} icon={AlertTriangle} tone="rose" /></div>
    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm Bug…" /></div><Select className="sm:w-48" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{['New', 'Open', 'InProgress', 'Resolved', 'Verified', 'Closed', 'Reopened'].map((item) => <option key={item}>{item}</option>)}</Select></div>
    {query.isLoading ? <Skeleton className="h-96" /> : bugs.length ? <Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900"><tr><th className="px-4 py-3 font-semibold">Bug</th><th className="px-4 py-3 font-semibold">Project</th><th className="px-4 py-3 font-semibold">Severity</th><th className="px-4 py-3 font-semibold">Priority</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Phê duyệt</th><th className="px-4 py-3 font-semibold">Cập nhật</th></tr></thead><tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">{bugs.map((bug) => { const projectId = bug.project?._id || bug.project; const canManage = ['Owner', 'QA_Manager'].includes(roles.get(projectId)); return <tr key={bug._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40"><td className="max-w-sm px-4 py-3"><p className="truncate font-semibold">{bug.title}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{bug.rootCause?.summary || 'Chưa có phân tích root cause'}</p></td><td className="px-4 py-3"><span className="font-medium">{bug.project?.key}</span> <span className="text-slate-400">{bug.project?.name}</span></td><td className="px-4 py-3"><Badge tone={severityTone[bug.severity]}>{bug.severity}</Badge></td><td className="px-4 py-3">{bug.priority}</td><td className="px-4 py-3"><Badge tone={statusTone[bug.status] || 'slate'}>{bug.status}</Badge></td><td className="px-4 py-3">{canManage && bug.approvalStatus === 'PendingApproval' ? <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { const reviewNote = window.prompt('Lý do từ chối Bug:'); if (reviewNote?.trim()) decide.mutate({ id: bug._id, decision: 'Rejected', reviewNote }) }}><X className="h-3.5 w-3.5" /></Button><Button size="sm" onClick={() => decide.mutate({ id: bug._id, decision: 'Approved', createJira: bug.jiraRequested })}><Check className="h-3.5 w-3.5" />Duyệt</Button></div> : <Badge tone={bug.approvalStatus === 'Rejected' ? 'red' : bug.approvalStatus === 'PendingApproval' ? 'amber' : 'green'}>{bug.approvalStatus || 'Approved'}</Badge>}</td><td className="px-4 py-3 text-slate-400">{formatDate(bug.updatedAt || bug.createdAt)}</td></tr> })}</tbody></table></div></Card> : <EmptyState title="Không tìm thấy Bug" description="Bug được tạo từ Tester hoặc kết quả automation thất bại sẽ xuất hiện ở đây." />}
  </div>
}
