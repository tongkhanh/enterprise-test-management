import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Clock3, Loader2, Play, Plus, Settings2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { agileApi, workspaceApi } from '@/api/client'
import { Badge, Button, Dialog, Input, Select } from '@/components/ui'
import { EmptyState, PageHeader } from '@/components/common/PageKit'
import { useAuthStore } from '@/store/authStore'
import PlanningTabs from './PlanningTabs'

const initialConfig = { anchorDate: '', durationWeeks: 2, cooldownDays: 0, futureCount: 3, rolloverOpenIssues: true }
const tone = { Upcoming: 'slate', Active: 'blue', Completed: 'green', Cancelled: 'red' }
const label = { Upcoming: 'Sắp tới', Active: 'Đang chạy', Completed: 'Hoàn tất', Cancelled: 'Đã hủy' }
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '—'

export default function DeliveryCyclesPage({ requestedProject = '' }) {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [project, setProject] = useState(requestedProject)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialConfig)
  const projects = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const active = project || projects.data?.[0]?._id || ''
  const currentProject = projects.data?.find((item) => item._id === active)
  const canManage = user?.role?.permissions?.includes('agile:manage') || ['Owner', 'QA_Manager'].includes(currentProject?.currentRole)
  const query = useQuery({ queryKey: ['delivery-cycles', active], queryFn: () => agileApi.deliveryCycles(active), enabled: Boolean(active), refetchInterval: 15000 })
  const cycles = useMemo(() => query.data?.cycles || [], [query.data?.cycles])
  const grouped = useMemo(() => ({
    current: cycles.find((item) => item.status === 'Active'),
    upcoming: cycles.filter((item) => item.status === 'Upcoming'),
    completed: cycles.filter((item) => item.status === 'Completed').reverse(),
  }), [cycles])
  const configure = useMutation({
    mutationFn: () => agileApi.configureDeliveryCycles({ ...form, project: active, durationWeeks: Number(form.durationWeeks), cooldownDays: Number(form.cooldownDays), futureCount: Number(form.futureCount) }),
    onSuccess: (result) => { qc.invalidateQueries({ queryKey: ['delivery-cycles', active] }); setOpen(false); toast.success(`Đã tạo ${result.created.length} Delivery Cycle.`) },
    onError: (error) => toast.error(error.message),
  })
  const update = useMutation({
    mutationFn: ({ id, status }) => agileApi.updateDeliveryCycle(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-cycles', active] }); toast.success('Đã cập nhật Delivery Cycle.') },
    onError: (error) => toast.error(error.message),
  })
  const changeProject = (value) => { setProject(value); const next = new URLSearchParams(params); if (value) next.set('project', value); else next.delete('project'); setParams(next) }

  return <div className="space-y-5">
    <PageHeader eyebrow="Agile delivery" title="Delivery Cycles" description="Nhịp làm việc lặp lại của đội sản phẩm. Trong Scrum, mỗi Delivery Cycle có thể tương ứng một Sprint." actions={<><Select className="min-w-56" value={active} onChange={(event) => changeProject(event.target.value)}><option value="">Chọn Project</option>{projects.data?.map((item) => <option key={item._id} value={item._id}>{item.key} · {item.name}</option>)}</Select>{canManage && <Button onClick={() => { setForm({ ...initialConfig, anchorDate: new Date().toISOString().slice(0, 10) }); setOpen(true) }}><Settings2 className="h-4 w-4" />Thiết lập nhịp Cycle</Button>}</>} />
    <PlanningTabs project={active} current="delivery" />

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/30">
      <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_120px] items-center gap-3 border-b border-slate-200 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800"><span>Delivery Cycle</span><span>Thời gian</span><span>Công việc</span><span>Trạng thái</span></div>
      {query.isLoading && <div className="grid min-h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>}
      {!query.isLoading && !cycles.length && <div className="m-5"><EmptyState title="Chưa thiết lập Delivery Cycle" description="Chọn thời lượng và ngày bắt đầu; hệ thống sẽ tạo chuỗi Cycle liên tiếp như Linear." action={canManage && <Button size="sm" onClick={() => { setForm({ ...initialConfig, anchorDate: new Date().toISOString().slice(0, 10) }); setOpen(true) }}><Plus className="h-4 w-4" />Thiết lập</Button>} /></div>}
      {cycles.map((cycle) => <div key={cycle._id} className={`grid grid-cols-[minmax(0,1fr)_110px_110px_120px] items-center gap-3 border-b border-slate-200 px-5 py-4 last:border-0 dark:border-slate-800 ${cycle.status === 'Active' ? 'bg-violet-50/70 dark:bg-violet-950/20' : 'bg-white/70 dark:bg-slate-950/30'}`}>
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cycle.color }} /><strong className="truncate text-sm">{cycle.name}</strong>{cycle.status === 'Active' && <span className="text-xs font-medium text-violet-700">Hiện tại</span>}</div><p className="mt-1 truncate pl-[18px] text-sm text-slate-500">{cycle.goal || 'Chưa đặt mục tiêu giao hàng.'}</p></div>
        <span className="text-xs text-slate-500">{dateLabel(cycle.startDate)}<br />{dateLabel(cycle.endDate)}</span>
        <span className="text-sm">{cycle.issueSummary?.done || 0}/{cycle.issueSummary?.total || 0}</span>
        <div className="flex items-center justify-between gap-1"><Badge tone={tone[cycle.status]}>{label[cycle.status]}</Badge>{canManage && cycle.status === 'Upcoming' && <button type="button" title="Bắt đầu Cycle" className="rounded p-1 text-slate-400 hover:bg-white hover:text-violet-700" onClick={() => update.mutate({ id: cycle._id, status: 'Active' })}><Play className="h-4 w-4" /></button>}{canManage && cycle.status === 'Active' && <button type="button" title="Hoàn tất Cycle" className="rounded p-1 text-slate-400 hover:bg-white hover:text-emerald-700" onClick={() => update.mutate({ id: cycle._id, status: 'Completed' })}><CheckCircle2 className="h-4 w-4" /></button>}</div>
      </div>)}
    </section>

    {(grouped.current || grouped.upcoming.length > 0) && <p className="flex items-center gap-2 text-sm text-slate-500"><Clock3 className="h-4 w-4" />{grouped.current ? `${grouped.current.name} đang hoạt động` : 'Chưa bắt đầu Cycle nào'} · {grouped.upcoming.length} Cycle sắp tới · {grouped.completed.length} Cycle đã hoàn tất</p>}

    <Dialog open={open} onOpenChange={setOpen} title="Thiết lập Delivery Cycle" description="Tạo nhịp làm việc lặp lại cho đội sản phẩm. Test Cycle của QA được quản lý riêng.">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); configure.mutate() }}>
        <label className="block"><span className="label">Ngày bắt đầu Cycle đầu tiên *</span><Input required type="date" value={form.anchorDate} onChange={(event) => setForm({ ...form, anchorDate: event.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-3"><label><span className="label">Thời lượng</span><Select value={form.durationWeeks} onChange={(event) => setForm({ ...form, durationWeeks: event.target.value })}>{[1, 2, 3, 4, 6, 8].map((item) => <option key={item} value={item}>{item} tuần</option>)}</Select></label><label><span className="label">Nghỉ giữa Cycle</span><Input type="number" min="0" max="14" value={form.cooldownDays} onChange={(event) => setForm({ ...form, cooldownDays: event.target.value })} /></label><label><span className="label">Tạo trước</span><Input type="number" min="1" max="12" value={form.futureCount} onChange={(event) => setForm({ ...form, futureCount: event.target.value })} /></label></div>
        <label className="flex items-start gap-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-900"><input className="mt-1" type="checkbox" checked={form.rolloverOpenIssues} onChange={(event) => setForm({ ...form, rolloverOpenIssues: event.target.checked })} /><span><strong>Chuyển việc chưa xong sang Cycle kế tiếp</strong><small className="mt-1 block text-slate-500">Chỉ áp dụng Agile Issue; không tự di chuyển Test Case giữa các Test Cycle.</small></span></label>
        <p className="flex items-center gap-2 text-sm text-slate-500"><CalendarDays className="h-4 w-4" />Cycle mới được tạo ở trạng thái Sắp tới. Mỗi Project chỉ có một Cycle hoạt động tại một thời điểm.</p>
        <div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button disabled={configure.isPending}>{configure.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Tạo chuỗi Cycle</Button></div>
      </form>
    </Dialog>
  </div>
}
