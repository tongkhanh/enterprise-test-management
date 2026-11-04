import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { agileApi, executionApi, workspaceApi } from '@/api/client'
import { Badge, Button, Card, Input, Select } from '@/components/ui'
import { PageHeader } from '@/components/common/PageKit'
import CycleCaseSummary, { statusLabel } from './CycleCaseSummary'

const estimate = (item) => Number(item.estimate || item.testCase?.estimatedTime) || 0
const available = (item) => !item.cycle && item.status === 'Backlog' && item.reviewState === 'Approved' && ['Approved', 'Active'].includes(item.testCase?.status)

export default function CyclePlanningPage({ embeddedProject = '' }) {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const [project, setProject] = useState(embeddedProject || params.get('project') || '')
  const [planId, setPlanId] = useState('')
  const [cycleId, setCycleId] = useState(params.get('cycle') || '')
  const [capacityMinutes, setCapacity] = useState(480)
  const [maxCases, setMaxCases] = useState(20)
  const [selected, setSelected] = useState([])
  const [proposal, setProposal] = useState(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const active = project || projects.data?.[0]?._id || ''
  const role = projects.data?.find((item) => item._id === active)?.currentRole
  const canApply = ['Owner', 'QA_Manager'].includes(role)
  const canSuggest = ['Owner', 'QA_Manager', 'Tester'].includes(role)
  const plans = useQuery({ queryKey: ['test-plans', active], queryFn: () => executionApi.plans(active), enabled: Boolean(active) })
  const cycles = useQuery({ queryKey: ['cycles', active], queryFn: () => agileApi.cycles(active), enabled: Boolean(active), refetchInterval: 10000 })
  const plan = plans.data?.find((item) => item._id === planId)
  const cycle = cycles.data?.find((item) => item._id === cycleId)
  const source = useQuery({ queryKey: ['cycle-planning-source', active, planId], queryFn: () => agileApi.planningSource(active, planId), enabled: Boolean(active && plan?.approvalStatus === 'Approved'), refetchInterval: 10000 })
  const items = source.data?.items || []
  const selectedItems = items.filter((item) => selected.includes(item._id))
  const selectedMinutes = selectedItems.reduce((sum, item) => sum + estimate(item), 0)
  const occupied = cycle?.planningSummary || { total: 0, estimatedMinutes: 0 }
  const totalMinutes = occupied.estimatedMinutes + selectedMinutes
  const totalCases = occupied.total + selectedItems.length
  const exceeds = totalMinutes > Number(capacityMinutes) || totalCases > Number(maxCases)
  const body = { project: active, testPlanId: planId, cycleId, capacityMinutes: Number(capacityMinutes), maxCases: Number(maxCases) }
  const clear = () => { setSelected([]); setProposal(null) }
  const suggest = useMutation({ mutationFn: () => agileApi.suggestCyclePlan(body), onSuccess: (result) => { setProposal(result); setSelected(result.recommendations.map((row) => row.boardItemId)); toast.success(result.generatedBy === 'AI' ? 'Đã đề xuất Test Case cho Cycle. Rà soát trước khi áp dụng.' : 'Đã tạo đề xuất theo ưu tiên và thời gian.') }, onError: (error) => toast.error(error.message) })
  const apply = useMutation({ mutationFn: () => agileApi.applyCyclePlan({ ...body, boardItemIds: selected }), onSuccess: (result) => { clear(); ['cycles', 'kanban-board', 'cycle-planning-source', 'project-activity'].forEach((key) => qc.invalidateQueries({ queryKey: [key] })); toast.success(`Đã đưa ${result.assignedCount} Test Case vào Todo của Cycle.`) }, onError: (error) => { toast.error(error.message); source.refetch(); cycles.refetch() } })
  const busy = suggest.isPending || apply.isPending
  const ready = plan?.approvalStatus === 'Approved' && ['Planning', 'Active'].includes(cycle?.status)
  const invalidSelection = selectedItems.length !== selected.length || selectedItems.some((item) => !available(item) || !estimate(item))
  const changeProject = (value) => { setProject(value); setPlanId(''); setCycleId(''); clear(); const next = new URLSearchParams(params); next.set('project', value); next.delete('cycle'); setParams(next) }
  return <div className="e2e-workflow space-y-5">
    <PageHeader eyebrow="Cycle planning" title="Kế hoạch kiểm thử theo tuần" description="Dùng Test Plan đã duyệt để chọn Test Case cho từng Cycle. Gemini đề xuất thứ tự và khối lượng; bạn rà soát trước khi áp dụng vào Board." />
    <Card className="space-y-4 p-5"><div className="grid gap-4 lg:grid-cols-3">
      <label><span className="label">Project</span><Select aria-label="Project" disabled={busy} value={active} onChange={(event) => changeProject(event.target.value)}><option value="">Chọn Project</option>{projects.data?.map((item) => <option key={item._id} value={item._id}>{item.key} · {item.name}</option>)}</Select></label>
      <label><span className="label">Test Plan có sẵn</span><Select aria-label="Test Plan có sẵn" disabled={busy} value={planId} onChange={(event) => { setPlanId(event.target.value); clear() }}><option value="">Chọn Test Plan nguồn</option>{plans.data?.filter((item) => (item.kind || 'TestPlan') === 'TestPlan').map((item) => <option key={item._id} value={item._id}>{item.name} · {item.approvalStatus}</option>)}</Select></label>
      <label><span className="label">Cycle / Sprint nhận việc</span><Select aria-label="Cycle / Sprint nhận việc" disabled={busy} value={cycleId} onChange={(event) => { const value = event.target.value; setCycleId(value); const target = cycles.data?.find((item) => item._id === value); setCapacity(target?.planningCapacityMinutes || 480); setMaxCases(target?.planningMaxCases || 20); clear() }}><option value="">Chọn Cycle</option>{cycles.data?.filter((item) => ['Planning', 'Active'].includes(item.status)).map((item) => <option key={item._id} value={item._id}>{item.name} · {item.status}</option>)}</Select></label>
    </div>
      {plan && <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><Badge tone={plan.approvalStatus === 'Approved' ? 'green' : 'amber'}>{plan.approvalStatus}</Badge><p className="mt-2">{plan.scope || plan.description}</p>{plan.approvalStatus !== 'Approved' && <p className="mt-2 text-amber-700">Test Plan này chưa được duyệt nên chưa thể lập lịch. <Link className="underline" to={`/ai-generator?project=${active}`}>Mở E2E Workflow để rà soát và gửi duyệt.</Link></p>}</div>}
      <div className="flex flex-wrap items-end gap-3"><label><span className="label">Ngân sách toàn Cycle (phút)</span><Input aria-label="Ngân sách toàn Cycle (phút)" disabled={busy} type="number" min="1" max="100000" value={capacityMinutes} onChange={(event) => { setCapacity(event.target.value); setProposal(null) }} /></label><label><span className="label">Tối đa Test Case trong Cycle</span><Input aria-label="Tối đa Test Case trong Cycle" disabled={busy} type="number" min="1" max="100" value={maxCases} onChange={(event) => { setMaxCases(event.target.value); setProposal(null) }} /></label><Button disabled={!ready || !canSuggest || busy || source.isPending || source.isError} onClick={() => suggest.mutate()}>{suggest.isPending ? 'Đang lập đề xuất…' : 'Gemini đề xuất kế hoạch tuần'}</Button><Button variant="outline" asChild><Link to={`/cycles?project=${active}`}>Tạo / quản lý Cycle</Link></Button></div>
      {cycle && <p className="text-xs text-slate-500">{new Date(cycle.startDate).toLocaleDateString('vi-VN')} – {new Date(cycle.endDate).toLocaleDateString('vi-VN')} · {occupied.total} Test Case đã xếp, {occupied.estimatedMinutes} phút đã phân bổ. Thời gian là ước tính thực thi, chưa bao gồm chuẩn bị môi trường và sửa lỗi.</p>}
    </Card>
    {occupied.unknownEstimates > 0 && <p role="alert" className="text-sm text-amber-700">Cycle có {occupied.unknownEstimates} Test Case chưa có ước tính. Bổ sung trên Board để tính đủ ngân sách trước khi áp dụng.</p>}
    {proposal && <Card className="p-4"><Badge tone={proposal.generatedBy === 'AI' ? 'purple' : 'amber'}>{proposal.generatedBy === 'AI' ? 'Đề xuất AI' : 'Đề xuất theo quy tắc'}</Badge><p className="mt-2 text-sm">{proposal.note}</p></Card>}
    {source.isError && <p role="alert" className="text-sm text-red-600">{source.error.message}</p>}
    {plan?.approvalStatus === 'Approved' && <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Test Case thuộc phạm vi Test Plan</h2><p className="mt-1 text-xs text-slate-500">Chỉ chọn case đã duyệt, có ước tính thời gian và chưa thuộc Cycle nào. Các case đã xếp vẫn hiển thị để đối chiếu.</p></div><span className={exceeds ? 'text-red-600' : 'text-violet-700'}>Chọn {selectedItems.length} case · {selectedMinutes} phút</span></div>
      {source.isPending ? <p className="mt-4">Đang tải Test Case…</p> : !items.length ? <p className="mt-4 text-sm">Chưa có Test Case đã duyệt trong phạm vi Test Plan. Hoàn tất thiết kế và duyệt Test Case trước.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Chọn</th><th className="p-2">Test Case / lý do</th><th className="p-2">Ưu tiên</th><th className="p-2">Phút</th><th className="p-2">Cycle</th><th className="p-2">Trạng thái</th><th className="p-2">Phụ trách</th></tr></thead><tbody>{items.map((item) => <tr key={item._id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="p-2"><input type="checkbox" aria-label={`Chọn ${item.testCase?.title}`} disabled={!available(item) || !estimate(item) || busy} checked={selected.includes(item._id)} onChange={() => setSelected((current) => current.includes(item._id) ? current.filter((id) => id !== item._id) : [...current, item._id])} /></td><td className="p-2 font-medium">{item.testCase?.testCaseId} · {item.testCase?.title}<p className="mt-1 text-xs font-normal text-slate-500">{proposal?.recommendations.find((row) => row.boardItemId === item._id)?.reason || (!estimate(item) ? 'Cần bổ sung thời gian ước tính trên Board.' : item.reviewState !== 'Approved' ? 'Cần duyệt lại.' : '')}</p></td><td className="p-2">{item.testCase?.priority}</td><td className="p-2">{estimate(item) || 'Chưa có'}</td><td className="p-2">{item.cycle?.name || 'Chưa xếp'}</td><td className="whitespace-nowrap p-2">{statusLabel[item.status]}</td><td className="p-2">{item.assignee?.fullName || 'Chưa phân công'}</td></tr>)}</tbody></table></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className={exceeds ? 'text-sm text-red-600' : 'text-sm'}>Sau khi áp dụng: {totalCases}/{maxCases} case · {totalMinutes}/{capacityMinutes} phút{exceeds && ' · Vượt giới hạn'}</p><Button disabled={!ready || !canApply || !selected.length || invalidSelection || exceeds || occupied.unknownEstimates > 0 || busy} onClick={() => apply.mutate()}>{apply.isPending ? 'Đang áp dụng…' : `Áp dụng ${selected.length} Test Case vào Todo`}</Button></div>{!canApply && <p className="mt-2 text-xs text-slate-500">Owner hoặc QA Manager áp dụng kế hoạch vào Cycle.</p>}
    </Card>}
    {cycle && <Card className="p-5"><h2 className="font-bold">Đã xếp trong {cycle.name}</h2><CycleCaseSummary cycle={cycle} project={active} /></Card>}
    {(plans.isError || cycles.isError) && <p role="alert" className="text-red-600">{plans.error?.message || cycles.error?.message}</p>}
  </div>
}
