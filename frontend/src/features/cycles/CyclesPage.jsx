import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, CalendarDays, Clock3, Flag, Gauge, Loader2, Pencil, Plus, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { agileApi, workspaceApi } from '@/api/client'
import { Badge, Button, Card, Dialog, Input, Select, Textarea } from '@/components/ui'
import { EmptyState, MetricCard, PageHeader, SectionTitle } from '@/components/common/PageKit'
import { useAuthStore } from '@/store/authStore'

const emptyCycle = { name: '', goal: '', description: '', startDate: '', endDate: '', status: 'Planning', capacity: 0, color: '#6D5DFB' }
const emptyLabel = { name: '', description: '', color: '#6D5DFB' }
const statusTone = { Planning: 'slate', Active: 'blue', Completed: 'green', Cancelled: 'red' }

function Field({ label, required, children }) { return <label className="block"><span className="label">{label}{required && <b className="ml-1 text-rose-500">*</b>}</span>{children}</label> }
const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : ''
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '—'

export default function CyclesPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [projectId, setProjectId] = useState('')
  const [cycleOpen, setCycleOpen] = useState(false)
  const [cycleForm, setCycleForm] = useState(emptyCycle)
  const [editingCycle, setEditingCycle] = useState(null)
  const [labelOpen, setLabelOpen] = useState(false)
  const [labelForm, setLabelForm] = useState(emptyLabel)
  const roleName = user?.role?.name || user?.role
  const canManage = user?.role?.permissions?.includes('agile:manage') || false

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const activeProjectId = projectId || projectsQuery.data?.[0]?._id || ''
  const cyclesQuery = useQuery({ queryKey: ['cycles', activeProjectId], queryFn: () => agileApi.cycles(activeProjectId), enabled: Boolean(activeProjectId) })
  const labelsQuery = useQuery({ queryKey: ['labels', activeProjectId], queryFn: () => agileApi.labels(activeProjectId), enabled: Boolean(activeProjectId) })
  const activityQuery = useQuery({ queryKey: ['project-activity', activeProjectId], queryFn: () => agileApi.activity(activeProjectId), enabled: Boolean(activeProjectId) })

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['cycles', activeProjectId] }); queryClient.invalidateQueries({ queryKey: ['project-activity', activeProjectId] }) }
  const saveCycle = useMutation({
    mutationFn: (body) => editingCycle ? agileApi.updateCycle(editingCycle._id, body) : agileApi.createCycle({ ...body, project: activeProjectId }),
    onSuccess: () => { refresh(); setCycleOpen(false); setEditingCycle(null); setCycleForm(emptyCycle); toast.success(editingCycle ? 'Đã cập nhật Cycle.' : 'Đã tạo Cycle mới.') },
    onError: (error) => toast.error(error.message),
  })
  const changeStatus = useMutation({ mutationFn: ({ id, status }) => agileApi.updateCycle(id, { status }), onSuccess: () => { refresh(); toast.success('Đã cập nhật trạng thái Cycle.') }, onError: (error) => toast.error(error.message) })
  const createLabel = useMutation({ mutationFn: () => agileApi.createLabel({ ...labelForm, project: activeProjectId }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['labels', activeProjectId] }); queryClient.invalidateQueries({ queryKey: ['project-activity', activeProjectId] }); setLabelOpen(false); setLabelForm(emptyLabel); toast.success('Đã tạo Label.') }, onError: (error) => toast.error(error.message) })

  const metrics = useMemo(() => {
    const cycles = cyclesQuery.data || []
    return { total: cycles.length, active: cycles.filter((item) => item.status === 'Active').length, planning: cycles.filter((item) => item.status === 'Planning').length, completed: cycles.filter((item) => item.status === 'Completed').length }
  }, [cyclesQuery.data])
  const openCreate = () => { setEditingCycle(null); setCycleForm(emptyCycle); setCycleOpen(true) }
  const openEdit = (cycle) => { setEditingCycle(cycle); setCycleForm({ name: cycle.name, goal: cycle.goal || '', description: cycle.description || '', startDate: dateValue(cycle.startDate), endDate: dateValue(cycle.endDate), status: cycle.status, capacity: cycle.capacity || 0, color: cycle.color || '#6D5DFB' }); setCycleOpen(true) }
  const submitCycle = (event) => { event.preventDefault(); if (!cycleForm.name.trim() || !cycleForm.startDate || !cycleForm.endDate) return toast.error('Tên và thời gian Cycle là bắt buộc.'); saveCycle.mutate({ ...cycleForm, capacity: Number(cycleForm.capacity) || 0 }) }

  return <div className="space-y-6">
    <PageHeader eyebrow="Agile delivery" title="Cycles & Planning" description="Lập kế hoạch chu kỳ kiểm thử, chuẩn hóa Label và theo dõi mọi thay đổi theo Project." actions={<><Select className="min-w-56" value={activeProjectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Chọn Project</option>{projectsQuery.data?.map((project) => <option key={project._id} value={project._id}>{project.key} · {project.name}</option>)}</Select>{canManage && <Button onClick={openCreate}><Plus className="h-4 w-4" />Tạo Cycle</Button>}</>} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Tất cả Cycle" value={metrics.total} hint="Trong Project đang chọn" icon={CalendarDays} /><MetricCard label="Đang hoạt động" value={metrics.active} hint="Cycle đang chạy" icon={Gauge} tone="emerald" /><MetricCard label="Đang lên kế hoạch" value={metrics.planning} hint="Chưa bắt đầu" icon={Clock3} tone="amber" /><MetricCard label="Đã hoàn thành" value={metrics.completed} hint="Đã đóng chu kỳ" icon={Flag} tone="violet" /></div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.8fr)]">
      <Card className="p-5"><SectionTitle title="Cycle timeline" description="Sprint được hiển thị dưới tên Cycle để đồng nhất với luồng Linear-style." action={canManage && <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5" />Thêm</Button>} /><div className="mt-4 space-y-3">{cyclesQuery.data?.map((cycle) => <div key={cycle._id} className="rounded-xl border border-slate-200 p-4 transition hover:border-violet-300 dark:border-slate-800 dark:hover:border-violet-700"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cycle.color || '#6D5DFB' }} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{cycle.name}</h3><Badge tone={statusTone[cycle.status]}>{cycle.status}</Badge><span className="text-[10px] text-slate-400">Cycle #{cycle.sequence}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{cycle.goal || 'Chưa đặt mục tiêu cho Cycle.'}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{dateLabel(cycle.startDate)} → {dateLabel(cycle.endDate)}</span><span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Capacity {cycle.capacity || 0}</span><span>Velocity {cycle.velocity || 0}</span></div></div>{canManage && <div className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" onClick={() => openEdit(cycle)}><Pencil className="h-3.5 w-3.5" /></Button>{cycle.status === 'Planning' && <Button size="sm" variant="outline" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: cycle._id, status: 'Active' })}>Bắt đầu</Button>}{cycle.status === 'Active' && <Button size="sm" variant="outline" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: cycle._id, status: 'Completed' })}>Hoàn tất</Button>}</div>}</div></div>)}{!cyclesQuery.isLoading && !cyclesQuery.data?.length && <EmptyState title="Chưa có Cycle" description="Tạo Cycle đầu tiên để lên kế hoạch các đợt kiểm thử theo Sprint." action={canManage && <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />Tạo Cycle</Button>} />}</div></Card>

      <div className="space-y-5">
        <Card className="p-5"><SectionTitle title="Project Labels" description="Nhãn dùng chung cho User Story và Test Case." action={canManage && <Button size="sm" variant="ghost" onClick={() => setLabelOpen(true)}><Plus className="h-3.5 w-3.5" /></Button>} /><div className="mt-4 flex flex-wrap gap-2">{labelsQuery.data?.map((label) => <span key={label._id} title={label.description} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium dark:border-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />{label.name}</span>)}{!labelsQuery.isLoading && !labelsQuery.data?.length && <p className="py-4 text-xs text-slate-400">Chưa có Label trong Project.</p>}</div></Card>
        <Card className="p-5"><SectionTitle title="Project Activity" description="Lịch sử Cycle, Label và tài liệu User Story." /><div className="mt-4 max-h-[460px] space-y-4 overflow-auto pr-1">{activityQuery.data?.map((item) => <div key={item._id} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-950"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0"><p className="text-xs font-medium">{item.title}</p><p className="mt-0.5 text-[10px] text-slate-400">{item.actor?.fullName || 'Hệ thống'} · {new Date(item.createdAt).toLocaleString('vi-VN')}</p>{item.description && <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.description}</p>}</div></div>)}{!activityQuery.isLoading && !activityQuery.data?.length && <p className="py-8 text-center text-xs text-slate-400">Chưa có hoạt động.</p>}</div></Card>
      </div>
    </div>

    <Dialog open={cycleOpen} onOpenChange={setCycleOpen} title={editingCycle ? 'Cập nhật Cycle' : 'Tạo Cycle mới'} description="Cycle là Sprint kiểm thử có thời gian, mục tiêu và capacity rõ ràng."><form className="space-y-4" onSubmit={submitCycle}><div className="grid gap-4 sm:grid-cols-[1fr_100px]"><Field label="Tên Cycle" required><Input value={cycleForm.name} onChange={(event) => setCycleForm({ ...cycleForm, name: event.target.value })} placeholder="Cycle 1 · Authentication" /></Field><Field label="Màu"><Input type="color" className="p-1" value={cycleForm.color} onChange={(event) => setCycleForm({ ...cycleForm, color: event.target.value.toUpperCase() })} /></Field></div><Field label="Mục tiêu"><Input value={cycleForm.goal} onChange={(event) => setCycleForm({ ...cycleForm, goal: event.target.value })} placeholder="Hoàn thành regression cho luồng đăng nhập" /></Field><Field label="Mô tả"><Textarea rows={3} value={cycleForm.description} onChange={(event) => setCycleForm({ ...cycleForm, description: event.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Ngày bắt đầu" required><Input type="date" value={cycleForm.startDate} onChange={(event) => setCycleForm({ ...cycleForm, startDate: event.target.value })} /></Field><Field label="Ngày kết thúc" required><Input type="date" value={cycleForm.endDate} onChange={(event) => setCycleForm({ ...cycleForm, endDate: event.target.value })} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Trạng thái"><Select value={cycleForm.status} onChange={(event) => setCycleForm({ ...cycleForm, status: event.target.value })}>{['Planning', 'Active', 'Completed', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</Select></Field><Field label="Capacity"><Input type="number" min="0" value={cycleForm.capacity} onChange={(event) => setCycleForm({ ...cycleForm, capacity: event.target.value })} /></Field></div><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setCycleOpen(false)}>Hủy</Button><Button disabled={saveCycle.isPending}>{saveCycle.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu Cycle</Button></div></form></Dialog>

    <Dialog open={labelOpen} onOpenChange={setLabelOpen} title="Tạo Project Label" description="Label giúp phân loại yêu cầu và phạm vi kiểm thử thống nhất."><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-[1fr_100px]"><Field label="Tên Label" required><Input value={labelForm.name} onChange={(event) => setLabelForm({ ...labelForm, name: event.target.value })} placeholder="Regression" /></Field><Field label="Màu"><Input type="color" className="p-1" value={labelForm.color} onChange={(event) => setLabelForm({ ...labelForm, color: event.target.value.toUpperCase() })} /></Field></div><Field label="Mô tả"><Textarea rows={3} value={labelForm.description} onChange={(event) => setLabelForm({ ...labelForm, description: event.target.value })} /></Field><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button variant="outline" onClick={() => setLabelOpen(false)}>Hủy</Button><Button disabled={createLabel.isPending || !labelForm.name.trim()} onClick={() => createLabel.mutate()}>{createLabel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}Tạo Label</Button></div></div></Dialog>
  </div>
}
