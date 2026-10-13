import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react'
import {
  Check, CheckSquare2, Clock3, GripVertical, Loader2, PlayCircle, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { agileApi, boardApi, catalogApi, workspaceApi } from '@/api/client'
import { Avatar, EmptyState, PageHeader } from '@/components/common/PageKit'
import { Badge, Button, Card, Dialog, Input, Select, Textarea } from '@/components/ui'
import { cn, idOf } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const columns = [
  { id: 'Backlog', label: 'Backlog', color: 'bg-slate-400', tone: 'slate' },
  { id: 'Todo', label: 'Todo', color: 'bg-blue-500', tone: 'blue' },
  { id: 'InProgress', label: 'In Progress', color: 'bg-amber-500', tone: 'amber' },
  { id: 'InReview', label: 'In Review', color: 'bg-violet-500', tone: 'purple' },
  { id: 'Done', label: 'Done', color: 'bg-emerald-500', tone: 'green' },
]
const priorityTone = { Critical: 'red', High: 'amber', Medium: 'blue', Low: 'slate' }
const allowedNext = { Backlog: ['Todo'], Todo: ['Backlog', 'InProgress'], InProgress: ['Todo', 'InReview'], InReview: ['InProgress', 'Done'], Done: ['InReview'] }

function BoardColumn({ column, items, selected, onSelect, onOpen, onMove }) {
  const { ref, isDropTarget } = useDroppable({ id: `column:${column.id}` })
  return <section ref={ref} className={cn('flex min-h-[520px] w-[310px] shrink-0 flex-col rounded-xl border bg-slate-50/70 transition dark:border-slate-800 dark:bg-[#141519]', isDropTarget && 'border-violet-400 bg-violet-50/60 ring-2 ring-violet-200 dark:bg-violet-950/20')}>
    <div className="flex h-12 items-center gap-2 border-b px-3 dark:border-slate-800"><span className={cn('h-2.5 w-2.5 rounded-full', column.color)} /><h2 className="text-xs font-semibold">{column.label}</h2><span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm dark:bg-slate-800">{items.length}</span></div>
    <div className="flex-1 space-y-2 p-2.5">{items.map((item) => <BoardCard key={item._id} item={item} selected={selected.includes(item._id)} onSelect={onSelect} onOpen={onOpen} onMove={onMove} />)}{!items.length && <div className="grid min-h-28 place-items-center rounded-lg border border-dashed text-center text-[11px] text-slate-400 dark:border-slate-700">Kéo thẻ vào {column.label}</div>}</div>
  </section>
}

function BoardCard({ item, selected, onSelect, onOpen, onMove }) {
  const testCase = item.testCase || {}
  const { ref, isDragging } = useDraggable({ id: item._id })
  return <article ref={ref} className={cn('group rounded-lg border bg-white p-3 shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-slate-800 dark:bg-[#1b1c21]', isDragging && 'opacity-40 ring-2 ring-violet-400')}>
    <div className="flex items-start gap-2"><button type="button" aria-label="Chọn thẻ" className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border', selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300')} onClick={(event) => { event.stopPropagation(); onSelect(item._id) }}>{selected && <Check className="h-3 w-3" />}</button><button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)}><p className="text-[10px] text-slate-400">TC-{idOf(testCase).slice(-6).toUpperCase()}</p><h3 className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-900 dark:text-slate-100">{testCase.title}</h3></button><GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300 group-hover:text-slate-500" /></div>
    <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone={priorityTone[testCase.priority] || 'slate'}>{testCase.priority}</Badge>{item.reviewState !== 'Approved' && <Badge tone="red">Cần duyệt lại</Badge>}{item.labels?.slice(0, 2).map((label) => <span key={label._id} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px]"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: label.color }} />{label.name}</span>)}</div>
    <div className="mt-3 flex items-center gap-3 border-t pt-2.5 text-[10px] text-slate-400 dark:border-slate-800"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{item.estimate || testCase.estimatedTime || 0}m</span><span className="flex items-center gap-1"><CheckSquare2 className="h-3 w-3" />{testCase.testSteps?.length || 0}</span>{item.assignee ? <Avatar user={item.assignee} className="ml-auto h-5 w-5 text-[7px]" /> : <UserRound className="ml-auto h-3.5 w-3.5" />}</div>
    <label className="mt-2 block"><span className="sr-only">Chuyển trạng thái</span><select className="h-7 w-full rounded-md border bg-transparent px-2 text-[10px] outline-none dark:border-slate-700" value={item.status} onChange={(event) => onMove(item, event.target.value)}><option value={item.status}>{columns.find((column) => column.id === item.status)?.label}</option>{(allowedNext[item.status] || []).map((status) => <option key={status} value={status}>{columns.find((column) => column.id === status)?.label}</option>)}</select></label>
  </article>
}

export default function KanbanBoardPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [projectId, setProjectId] = useState('')
  const [cycleId, setCycleId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState('')
  const [selected, setSelected] = useState([])
  const [detail, setDetail] = useState(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planForm, setPlanForm] = useState({ name: '', runName: '', environment: 'Staging' })
  const [editForm, setEditForm] = useState(null)
  const canExecute = user?.role?.permissions?.some((permission) => ['execution:execute', 'execution:manage'].includes(permission))

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const activeProject = projectId || projectsQuery.data?.[0]?._id || ''
  const cyclesQuery = useQuery({ queryKey: ['cycles', activeProject], queryFn: () => agileApi.cycles(activeProject), enabled: Boolean(activeProject) })
  const activeCycle = cycleId || cyclesQuery.data?.find((cycle) => cycle.status === 'Active')?._id || cyclesQuery.data?.[0]?._id || 'backlog'
  const boardQuery = useQuery({ queryKey: ['kanban-board', activeProject, activeCycle, assignee, priority], queryFn: () => boardApi.get({ project: activeProject, cycle: activeCycle, assignee, priority }), enabled: Boolean(activeProject) })
  const membersQuery = useQuery({ queryKey: ['members', activeProject], queryFn: () => catalogApi.members(activeProject), enabled: Boolean(activeProject) })
  const labelsQuery = useQuery({ queryKey: ['labels', activeProject], queryFn: () => agileApi.labels(activeProject), enabled: Boolean(activeProject) })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['kanban-board'] })
  const moveMutation = useMutation({
    mutationFn: ({ item, status }) => boardApi.move(item._id, { status, cycle: status === 'Backlog' ? null : activeCycle === 'backlog' ? null : activeCycle }),
    onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ['project-activity'] }) },
    onError: (error) => { refresh(); toast.error('Không thể chuyển thẻ', { description: error.message }) },
  })
  const updateMutation = useMutation({ mutationFn: ({ id, body }) => boardApi.update(id, body), onSuccess: (updated) => { setDetail(updated); setEditForm(toEditForm(updated)); refresh(); toast.success('Đã cập nhật thẻ.') }, onError: (error) => toast.error(error.message) })
  const planMutation = useMutation({ mutationFn: () => boardApi.createPlan({ project: activeProject, cycle: activeCycle === 'backlog' ? null : activeCycle, boardItemIds: selected, ...planForm }), onSuccess: (result) => { setPlanOpen(false); setSelected([]); refresh(); toast.success(`Đã tạo ${result.plan.name}`, { description: `Test Run “${result.run.name}” đang ở trạng thái Not Started.` }) }, onError: (error) => toast.error('Không thể tạo Test Plan', { description: error.message }) })

  const board = boardQuery.data?.columns || Object.fromEntries(columns.map((column) => [column.id, []]))
  const selectedItems = useMemo(() => (boardQuery.data?.items || []).filter((item) => selected.includes(item._id)), [boardQuery.data, selected])
  const toggleSelect = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const openDetail = (item) => { setDetail(item); setEditForm(toEditForm(item)) }
  const requestMove = (item, status) => {
    if (status !== 'Backlog' && activeCycle === 'backlog') return toast.error('Hãy chọn một Cycle trước khi đưa thẻ vào luồng thực hiện.')
    moveMutation.mutate({ item, status })
  }
  const onDragEnd = (event) => {
    if (event.canceled) return
    const itemId = String(event.operation.source?.id || '')
    const targetId = String(event.operation.target?.id || '')
    if (!targetId.startsWith('column:')) return
    const item = boardQuery.data?.items?.find((candidate) => candidate._id === itemId)
    const status = targetId.replace('column:', '')
    if (item && item.status !== status) requestMove(item, status)
  }
  const saveDetail = () => updateMutation.mutate({ id: detail._id, body: { cycle: editForm.cycle || null, assignee: editForm.assignee || null, labels: editForm.labels, estimate: Number(editForm.estimate) || 0, dueDate: editForm.dueDate || null } })

  return <div className="space-y-5">
    <PageHeader eyebrow="Execution workflow" title="Test Board" description="Test Case được QA duyệt tự động vào Backlog. Kéo thẻ qua từng trạng thái và tạo Test Plan/Test Run theo Cycle." actions={canExecute && <Button disabled={!selected.length} onClick={() => setPlanOpen(true)}><PlayCircle className="h-4 w-4" />Tạo Test Plan ({selected.length})</Button>} />
    <Card className="flex flex-wrap items-end gap-3 p-3"><label className="min-w-52 flex-1"><span className="label">Project</span><Select value={activeProject} onChange={(event) => { setProjectId(event.target.value); setCycleId(''); setSelected([]) }}><option value="">Chọn Project</option>{projectsQuery.data?.map((project) => <option key={project._id} value={project._id}>{project.key} · {project.name}</option>)}</Select></label><label className="min-w-48"><span className="label">Cycle</span><Select value={activeCycle} onChange={(event) => { setCycleId(event.target.value); setSelected([]) }}><option value="backlog">Backlog chưa gán Cycle</option>{cyclesQuery.data?.map((cycle) => <option key={cycle._id} value={cycle._id}>{cycle.name} · {cycle.status}</option>)}</Select></label><label className="min-w-44"><span className="label">Assignee</span><Select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Tất cả</option>{membersQuery.data?.map((member) => <option key={member._id} value={member._id}>{member.fullName}</option>)}</Select></label><label className="min-w-36"><span className="label">Priority</span><Select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Tất cả</option>{['Critical', 'High', 'Medium', 'Low'].map((item) => <option key={item}>{item}</option>)}</Select></label></Card>
    {selectedItems.length > 0 && <div className="flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-950/30"><span><strong>{selectedItems.length}</strong> thẻ đã chọn</span><button className="font-semibold hover:underline" onClick={() => setSelected([])}>Bỏ chọn</button></div>}
    {boardQuery.isLoading ? <div className="grid min-h-[520px] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-violet-600" /></div> : boardQuery.isError ? <Card className="p-8 text-center text-rose-600">{boardQuery.error.message}</Card> : !(boardQuery.data?.items?.length) ? <EmptyState title="Board chưa có Test Case" description="Sau khi QA Manager duyệt, Test Case sẽ tự động xuất hiện trong Backlog của Project." /> : <DragDropProvider onDragEnd={onDragEnd}><div className="flex gap-3 overflow-x-auto pb-4">{columns.map((column) => <BoardColumn key={column.id} column={column} items={board[column.id] || []} selected={selected} onSelect={toggleSelect} onOpen={openDetail} onMove={requestMove} />)}</div></DragDropProvider>}

    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)} title={detail?.testCase?.title || 'Chi tiết Test Case'} description={detail ? `TC-${idOf(detail.testCase).slice(-6).toUpperCase()} · ${detail.status}` : ''} className="max-w-4xl">{detail && editForm && <div className="grid gap-6 lg:grid-cols-[1.3fr_.8fr]"><section><div className="flex flex-wrap gap-2"><Badge tone={priorityTone[detail.testCase.priority]}>{detail.testCase.priority}</Badge><Badge tone={detail.reviewState === 'Approved' ? 'green' : 'red'}>{detail.reviewState}</Badge>{detail.testPlan && <Badge tone="blue">{detail.testPlan.name}</Badge>}</div><p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail.testCase.description || 'Không có mô tả.'}</p><h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">Test Steps</h3><div className="mt-2 max-h-80 space-y-2 overflow-auto">{detail.testCase.testSteps?.map((step, index) => <div key={index} className="rounded-lg border p-3 dark:border-slate-700"><div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{index + 1}</span><div><p className="text-xs font-medium">{step.action}</p><p className="mt-1 text-[11px] text-slate-500"><strong>Expected:</strong> {step.expectedResult}</p></div></div></div>)}</div></section><aside className="space-y-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><label><span className="label">Cycle</span><Select value={editForm.cycle} onChange={(event) => setEditForm({ ...editForm, cycle: event.target.value })}><option value="">Chưa gán Cycle</option>{cyclesQuery.data?.map((cycle) => <option key={cycle._id} value={cycle._id}>{cycle.name}</option>)}</Select></label><label><span className="label">Assignee</span><Select value={editForm.assignee} onChange={(event) => setEditForm({ ...editForm, assignee: event.target.value })}><option value="">Chưa phân công</option>{membersQuery.data?.map((member) => <option key={member._id} value={member._id}>{member.fullName}</option>)}</Select></label><label><span className="label">Estimate (phút)</span><Input type="number" min="0" value={editForm.estimate} onChange={(event) => setEditForm({ ...editForm, estimate: event.target.value })} /></label><label><span className="label">Due date</span><Input type="date" value={editForm.dueDate} onChange={(event) => setEditForm({ ...editForm, dueDate: event.target.value })} /></label><div><span className="label">Labels</span><div className="space-y-2">{labelsQuery.data?.map((label) => <label key={label._id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editForm.labels.includes(label._id)} onChange={() => setEditForm({ ...editForm, labels: editForm.labels.includes(label._id) ? editForm.labels.filter((id) => id !== label._id) : [...editForm.labels, label._id] })} /><span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />{label.name}</label>)}</div></div><Button className="w-full" disabled={updateMutation.isPending} onClick={saveDetail}>{updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Lưu thuộc tính</Button></aside></div>}</Dialog>

    <Dialog open={planOpen} onOpenChange={setPlanOpen} title="Tạo Test Plan & Test Run" description={`Gom ${selected.length} Test Case Approved từ Board.`}><div className="space-y-4"><label><span className="label">Tên Test Plan</span><Input value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} placeholder="Cycle regression plan" /></label><label><span className="label">Tên Test Run</span><Input value={planForm.runName} onChange={(event) => setPlanForm({ ...planForm, runName: event.target.value })} placeholder="Chrome staging run" /></label><label><span className="label">Môi trường</span><Textarea rows={3} value={planForm.environment} onChange={(event) => setPlanForm({ ...planForm, environment: event.target.value })} /></label><div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900"><p className="font-semibold">Phạm vi được chọn</p><ul className="mt-2 space-y-1 text-slate-500">{selectedItems.map((item) => <li key={item._id}>• {item.testCase.title}</li>)}</ul></div><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button variant="outline" onClick={() => setPlanOpen(false)}>Hủy</Button><Button disabled={planMutation.isPending || !selected.length} onClick={() => planMutation.mutate()}>{planMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Tạo Plan & Run</Button></div></div></Dialog>
  </div>
}

function toEditForm(item) { return { cycle: idOf(item.cycle), assignee: idOf(item.assignee), labels: (item.labels || []).map(idOf), estimate: item.estimate || item.testCase?.estimatedTime || 0, dueDate: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '' } }
