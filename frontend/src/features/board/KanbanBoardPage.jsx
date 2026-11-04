import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Check, CheckSquare2, Clock3, GripVertical, Loader2, PlayCircle, Plus, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { agileApi, boardApi, catalogApi, workspaceApi } from '@/api/client'
import { Avatar, EmptyState } from '@/components/common/PageKit'
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

function BoardColumn({ column, items, selected, onSelect, onOpen, onMove, dragging, onDragStart, onDragEnd, onDrop }) {
  const isDropTarget = Boolean(dragging && allowedNext[dragging.status]?.includes(column.id))
  return <section data-column={column.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = isDropTarget ? 'move' : 'none' }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (id) onDrop(id, column.id) }} className={cn('flex h-full min-h-0 w-[260px] shrink-0 flex-col xl:w-0 xl:min-w-[200px] xl:flex-1 rounded-xl border bg-slate-50/70 transition dark:border-slate-800 dark:bg-[#141519]', isDropTarget && 'border-violet-400 bg-violet-50/60 ring-2 ring-violet-200 dark:bg-violet-950/20')}>
    <div className="flex h-12 items-center gap-2 border-b px-3 dark:border-slate-800"><span className={cn('h-2.5 w-2.5 rounded-full', column.color)} /><h2 className="text-xs font-semibold">{column.label}</h2><span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm dark:bg-slate-800">{items.length}</span></div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">{items.map((item) => <BoardCard key={item._id} item={item} selected={selected.includes(item._id)} onSelect={onSelect} onOpen={onOpen} onMove={onMove} onDragStart={onDragStart} onDragEnd={onDragEnd} />)}{!items.length && <div className="grid min-h-28 place-items-center rounded-lg border border-dashed text-center text-[11px] text-slate-400 dark:border-slate-700">Kéo thẻ vào {column.label}</div>}</div>
  </section>
}

function BoardCard({ item, selected, onSelect, onOpen, onMove, backlogOnly = false, onDragStart, onDragEnd }) {
  const testCase = item.testCase || {}

  return <article data-card={item._id} className={cn('group rounded-lg border bg-white p-3 shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-slate-800 dark:bg-[#1b1c21]')}>
    <div className="flex items-start gap-2"><button type="button" aria-label="Chọn thẻ" aria-pressed={selected} className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border', selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300')} onClick={(event) => { event.stopPropagation(); onSelect(item._id) }}>{selected && <Check className="h-3 w-3" />}</button><button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)}><p className="text-[10px] text-slate-400">TC-{idOf(testCase).slice(-6).toUpperCase()}</p><h3 className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-900 dark:text-slate-100">{testCase.title}</h3></button>{!backlogOnly && <button type="button" draggable aria-label={`Kéo thẻ ${testCase.title}`} title="Giữ biểu tượng này và kéo sang cột được viền tím" className="shrink-0 cursor-grab touch-none rounded border border-transparent p-1 text-slate-400 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600 active:cursor-grabbing" onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(item._id)); event.dataTransfer.setData('application/x-etms-board-item', String(item._id)); onDragStart(item) }} onDragEnd={onDragEnd}><GripVertical className="h-4 w-4" /></button>}</div>
    <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone={priorityTone[testCase.priority] || 'slate'}>{testCase.priority}</Badge>{item.reviewState !== 'Approved' && <Badge tone="red">Cần duyệt lại</Badge>}{item.labels?.slice(0, 2).map((label) => <span key={label._id} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px]"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: label.color }} />{label.name}</span>)}</div>
    <div className="mt-3 flex items-center gap-3 border-t pt-2.5 text-[10px] text-slate-400 dark:border-slate-800"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{item.estimate || testCase.estimatedTime || 0}m</span><span className="flex items-center gap-1"><CheckSquare2 className="h-3 w-3" />{testCase.testSteps?.length || 0}</span>{item.assignee ? <Avatar user={item.assignee} className="ml-auto h-5 w-5 text-[7px]" /> : <UserRound className="ml-auto h-3.5 w-3.5" />}</div>
    {!backlogOnly && <label className="mt-2 block"><span className="sr-only">Chuyển trạng thái</span><select className="h-7 w-full rounded-md border bg-transparent px-2 text-[10px] outline-none dark:border-slate-700" value={item.status} onChange={(event) => onMove(item, event.target.value)}><option value={item.status}>{columns.find((column) => column.id === item.status)?.label}</option>{(allowedNext[item.status] || []).map((status) => <option key={status} value={status}>{columns.find((column) => column.id === status)?.label}</option>)}</select></label>}
  </article>
}

export default function KanbanBoardPage({ embeddedProject = '' }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projectId, setProjectId] = useState(embeddedProject || searchParams.get('project') || '')
  const [cycleId, updateCycleId] = useState(searchParams.get('cycle') || '')
  const setCycleId = (value) => { updateCycleId(value); setSearchParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set('cycle', value); else next.delete('cycle'); return next }, { replace: true }) }
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState('')
  const [selected, setSelected] = useState([])
  const [detail, setDetail] = useState(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planForm, setPlanForm] = useState({ name: '', runName: '', environment: 'Staging' })
  const [editForm, setEditForm] = useState(null)
  const [cycleOpen, setCycleOpen] = useState(false)
  const [cycleForm, setCycleForm] = useState({ name: '', goal: '', startDate: '', endDate: '' })
  const [destinationCycle, setDestinationCycle] = useState('')
  const [dragging, setDragging] = useState(null)

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const activeProject = projectId || projectsQuery.data?.[0]?._id || ''
  const projectRole = projectsQuery.data?.find((project) => project._id === activeProject)?.currentRole
  const canManage = ['Owner', 'QA_Manager'].includes(projectRole) || user?.role?.permissions?.includes('agile:manage')
  const canExecute = ['Owner', 'QA_Manager', 'Tester'].includes(projectRole) || user?.role?.permissions?.some((permission) => ['execution:execute', 'execution:manage'].includes(permission))
  const cyclesQuery = useQuery({ queryKey: ['cycles', activeProject], queryFn: () => agileApi.cycles(activeProject), enabled: Boolean(activeProject) })
  const activeCycle = cycleId || (cyclesQuery.data || []).find((cycle) => cycle.status === 'Active')?._id || (cyclesQuery.data || []).find((cycle) => cycle.status === 'Planning')?._id || 'backlog'
  const availableCycles = (cyclesQuery.data || []).filter((cycle) => ['Planning', 'Active'].includes(cycle.status))
  const boardQuery = useQuery({ queryKey: ['kanban-board', activeProject, activeCycle, assignee, priority], queryFn: () => boardApi.get({ project: activeProject, cycle: activeCycle, assignee, priority }), enabled: Boolean(activeProject), refetchInterval: 10000 })
  const membersQuery = useQuery({ queryKey: ['members', activeProject], queryFn: () => catalogApi.members(activeProject), enabled: Boolean(activeProject) })
  const labelsQuery = useQuery({ queryKey: ['labels', activeProject], queryFn: () => agileApi.labels(activeProject), enabled: Boolean(activeProject) })

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['cycles'] }); queryClient.invalidateQueries({ queryKey: ['cycle-planning-source'] }); return queryClient.invalidateQueries({ queryKey: ['kanban-board'] }) }
  const createCycle = useMutation({
    mutationFn: () => agileApi.createCycle({ ...cycleForm, project: activeProject, status: 'Planning' }),
    onSuccess: (cycle) => { queryClient.invalidateQueries({ queryKey: ['cycles', activeProject] }); setDestinationCycle(cycle._id); setCycleOpen(false); setCycleForm({ name: '', goal: '', startDate: '', endDate: '' }); toast.success('Đã tạo Cycle. Chọn Test Case rồi bấm Đưa vào Cycle.') },
    onError: (error) => toast.error(error.message),
  })
  const assignCycle = useMutation({
    mutationFn: async () => {
      const cycle = activeCycle === 'backlog' ? destinationCycle : activeCycle
      if (!cycle) throw new Error('Chọn Cycle nhận Test Case trước.')
      const ids = (boardQuery.data?.items || []).filter((item) => selected.includes(item._id)).map((item) => item._id)
      const results = await Promise.allSettled(ids.map((id) => boardApi.move(id, { status: 'Todo', cycle })))
      return { cycle, failed: ids.filter((_, index) => results[index].status === 'rejected') }
    },
    onSuccess: ({ cycle, failed }) => {
      refresh()
      queryClient.invalidateQueries({ queryKey: ['project-activity'] })
      setSelected(failed)
      if (failed.length) toast.error(`Còn ${failed.length} Test Case chưa chuyển được. Các thẻ này vẫn được chọn để thử lại.`)
      else { setCycleId(cycle); toast.success('Đã đưa Test Case vào Todo của Cycle.') }
    },
    onError: (error) => toast.error(error.message),
  })
  const moveMutation = useMutation({
    mutationFn: ({ item, status }) => boardApi.move(item._id, { status, cycle: status === 'Backlog' ? null : activeCycle === 'backlog' ? null : activeCycle }),
    onMutate: async ({ item, status }) => {
      const key = ['kanban-board', activeProject, activeCycle, assignee, priority]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (data) => {
        if (!data) return data
        const items = data.items.map((row) => row._id === item._id ? { ...row, status, cycle: status === 'Backlog' ? null : activeCycle } : row)
        return { ...data, items, columns: Object.fromEntries(columns.map((column) => [column.id, items.filter((row) => row.status === column.id)])) }
      })
      return { key, previous }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['project-activity'] }) },
    onError: (error, _variables, context) => { if (context?.previous) queryClient.setQueryData(context.key, context.previous); toast.error('Không thể chuyển thẻ', { description: error.message }) },
    onSettled: refresh,
  })
  const updateMutation = useMutation({ mutationFn: ({ id, body }) => boardApi.update(id, body), onSuccess: (updated) => { setDetail(updated); setEditForm(toEditForm(updated)); refresh(); toast.success('Đã cập nhật thẻ.') }, onError: (error) => toast.error(error.message) })
  const planMutation = useMutation({ mutationFn: () => boardApi.createPlan({ project: activeProject, cycle: activeCycle === 'backlog' ? null : activeCycle, boardItemIds: selected, ...planForm }), onSuccess: (result) => { setPlanOpen(false); setSelected([]); refresh(); const query = new URLSearchParams({ project: activeProject, step: 'run', run: result.run._id }); if (result.plan.systemProfile) query.set('profile', String(result.plan.systemProfile._id || result.plan.systemProfile)); toast.success(`Đã tạo ${result.plan.name}`, { description: `Đang mở Test Run “${result.run.name}”.` }); navigate(`/ai-generator?${query.toString()}`) }, onError: (error) => toast.error('Không thể tạo Test Plan', { description: error.message }) })

  const board = boardQuery.data?.columns || Object.fromEntries(columns.map((column) => [column.id, []]))
  const selectedItems = useMemo(() => (boardQuery.data?.items || []).filter((item) => selected.includes(item._id)), [boardQuery.data, selected])
  const selectedRunIds = [...new Set(selectedItems.map((item) => idOf(item.testRun)).filter(Boolean))]
  const existingRun = selectedRunIds.length === 1 && selectedItems.length && selectedItems.every((item) => idOf(item.testRun) === selectedRunIds[0]) ? selectedItems[0].testRun : null
  const hasExistingExecution = selectedItems.some((item) => item.testPlan || item.testRun)
  const openRun = (run, item = selectedItems[0]) => {
    const query = new URLSearchParams({ project: activeProject, step: 'execution', run: idOf(run) })
    const profile = item?.testPlan?.systemProfile || item?.testCase?.e2e?.systemProfile
    if (profile) query.set('profile', idOf(profile))
    navigate(`/ai-generator?${query.toString()}`)
  }
  const toggleSelect = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const openDetail = (item) => { setDetail(item); setEditForm(toEditForm(item)) }
  const requestMove = (item, status) => {
    if (status !== 'Backlog' && activeCycle === 'backlog') return toast.error('Hãy chọn một Cycle trước khi đưa thẻ vào luồng thực hiện.')
    if (moveMutation.isPending) return
    if (!allowedNext[item.status]?.includes(status)) return toast.error('Hãy chuyển thẻ lần lượt theo các bước của quy trình.')
    moveMutation.mutate({ item, status })
  }
  const dropCard = (id, status) => {
    const item = boardQuery.data?.items?.find((candidate) => candidate._id === id)
    setDragging(null)
    if (item && item.status !== status) requestMove(item, status)
  }
  const saveDetail = () => updateMutation.mutate({ id: detail._id, body: { cycle: editForm.cycle || null, assignee: editForm.assignee || null, labels: editForm.labels, estimate: Number(editForm.estimate) || 0, dueDate: editForm.dueDate || null } })

  return <main aria-busy={moveMutation.isPending} className="board-workspace flex h-dvh flex-col gap-3 overflow-hidden bg-slate-100 p-3 text-slate-900 sm:p-4 dark:bg-slate-950 dark:text-slate-100">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><Button variant="outline" size="sm" asChild><Link to={`/cycles?project=${activeProject}`}>← Cycles & Planning</Link></Button><h1 className="text-lg font-bold">Backlog & Test Board</h1></div><div className="flex gap-2"><Button size="sm" variant="outline" asChild><Link to={`/cycles?tab=issues&project=${activeProject}&cycle=${activeCycle === 'backlog' ? '' : activeCycle}`}>Kế hoạch tuần</Link></Button>{canManage && <Button size="sm" disabled={!activeProject} onClick={() => setCycleOpen(true)}><Plus className="h-4 w-4" />Tạo Cycle / Sprint</Button>}<Button size="sm" variant="outline" asChild><Link to={`/ai-generator?project=${activeProject}`}>E2E Workflow</Link></Button></div></header>
    <Card className="flex shrink-0 flex-wrap items-end gap-3 p-3"><label className="min-w-52 flex-1"><span className="label">Project</span><Select value={activeProject} onChange={(event) => { const value = event.target.value; setProjectId(value); setCycleId(''); setDestinationCycle(''); setSelected([]); setDetail(null); const next = new URLSearchParams(searchParams); if (value) next.set('project', value); else next.delete('project'); next.delete('cycle'); setSearchParams(next) }}><option value="">Chọn Project</option>{projectsQuery.data?.map((project) => <option key={project._id} value={project._id}>{project.key} · {project.name}</option>)}</Select></label><label className="min-w-48"><span className="label">Cycle</span><Select value={activeCycle} onChange={(event) => { setCycleId(event.target.value); setSelected([]) }}><option value="backlog">Backlog chưa gán Cycle</option>{cyclesQuery.data?.map((cycle) => <option key={cycle._id} value={cycle._id}>{cycle.name} · {cycle.status}</option>)}</Select></label><label className="min-w-44"><span className="label">Assignee</span><Select value={assignee} onChange={(event) => { setAssignee(event.target.value); setSelected([]) }}><option value="">Tất cả</option>{membersQuery.data?.map((member) => <option key={member._id} value={member._id}>{member.fullName}</option>)}</Select></label><label className="min-w-36"><span className="label">Priority</span><Select value={priority} onChange={(event) => { setPriority(event.target.value); setSelected([]) }}><option value="">Tất cả</option>{['Critical', 'High', 'Medium', 'Low'].map((item) => <option key={item}>{item}</option>)}</Select></label></Card>
    <Card className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-violet-200 px-3 py-2 dark:border-violet-900">
      <div><h2 className="text-sm font-bold">{activeCycle === 'backlog' ? 'Backlog · Test Case chưa lên lịch' : cyclesQuery.data?.find((cycle) => cycle._id === activeCycle)?.name}</h2><p className="mt-1 text-xs text-slate-500">{activeCycle === 'backlog' ? (canManage ? 'Chọn các thẻ bên dưới và Cycle nhận việc. Chưa có Cycle? Bấm Tạo Cycle / Sprint ở trên.' : 'Chọn các thẻ bên dưới và Cycle nhận việc. Nhờ Owner hoặc QA Manager tạo Cycle nếu chưa có.') : 'Kéo nút ⋮⋮ trên thẻ sang cột được tô sáng, hoặc chọn trạng thái ở cuối thẻ.'}</p></div>
      {canExecute && <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!boardQuery.data?.items?.length || assignCycle.isPending} onClick={() => setSelected((boardQuery.data?.items || []).filter((item) => item.status === 'Backlog' && !item.cycle).map((item) => item._id))}>Chọn Backlog</Button>
        {activeCycle === 'backlog' && <Select aria-label="Cycle nhận Test Case" className="w-56" value={destinationCycle} onChange={(event) => setDestinationCycle(event.target.value)}><option value="">Chọn Cycle nhận Test Case</option>{availableCycles.map((cycle) => <option key={cycle._id} value={cycle._id}>{cycle.name}</option>)}</Select>}
        <Button disabled={!selectedItems.length || selectedItems.some((item) => item.status !== 'Backlog') || (activeCycle === 'backlog' && !destinationCycle) || assignCycle.isPending} onClick={() => assignCycle.mutate()}>{assignCycle.isPending ? 'Đang đưa vào Cycle…' : `Đưa vào Cycle (${selectedItems.length})`}</Button>
        {selectedItems.length > 0 && <Button variant="ghost" disabled={assignCycle.isPending} onClick={() => setSelected([])}>Bỏ chọn</Button>}
        {activeCycle !== 'backlog' && <Button variant={existingRun ? 'default' : 'outline'} disabled={!selectedItems.length || (hasExistingExecution && !existingRun)} onClick={() => existingRun ? openRun(existingRun) : setPlanOpen(true)}><PlayCircle className="h-4 w-4" />{existingRun ? `Mở Test Run (${selectedItems.length})` : `Tạo kế hoạch chạy (${selectedItems.length})`}</Button>}
      </div>}
      {hasExistingExecution && !existingRun && <p className="text-xs text-amber-700 dark:text-amber-300">Bạn đang chọn cả Test Case đã có kế hoạch chạy và chưa có kế hoạch. Hãy chỉ chọn một nhóm để tiếp tục, tránh tạo trùng Test Run.</p>}
    </Card>
    {boardQuery.isLoading ? <div className="grid min-h-[520px] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-violet-600" /></div> : boardQuery.isError ? <Card className="p-8 text-center text-rose-600">{boardQuery.error.message}</Card> : !(boardQuery.data?.items?.length) ? <EmptyState title={activeCycle === 'backlog' ? 'Backlog chưa có Test Case' : 'Cycle chưa có Test Case'} description={activeCycle === 'backlog' ? 'Test Case sẽ xuất hiện ở đây sau khi QA Manager duyệt. Nếu đã lên lịch, chọn Cycle ở bộ lọc để xem.' : 'Quay về Backlog để chọn Test Case và đưa vào Cycle này.'} /> : activeCycle === 'backlog' ? <div className="min-h-0 flex-1 overflow-y-auto"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(boardQuery.data?.items || []).map((item) => <BoardCard key={item._id} item={item} selected={selected.includes(item._id)} onSelect={toggleSelect} onOpen={openDetail} onMove={requestMove} backlogOnly />)}</div></div> : <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">{columns.map((column) => <BoardColumn key={column.id} column={column} items={board[column.id] || []} selected={selected} onSelect={toggleSelect} onOpen={openDetail} onMove={requestMove} dragging={dragging} onDragStart={setDragging} onDragEnd={() => setDragging(null)} onDrop={dropCard} />)}</div>}

    <Dialog open={cycleOpen} onOpenChange={setCycleOpen} title="Tạo Cycle / Sprint" description="Tạo đợt kiểm thử cho Project đang chọn ngay tại Board.">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!cycleForm.name.trim() || !cycleForm.startDate || !cycleForm.endDate || cycleForm.endDate <= cycleForm.startDate) return toast.error('Nhập tên và ngày kết thúc sau ngày bắt đầu.'); createCycle.mutate() }}>
        <label className="block"><span className="label">Tên Cycle *</span><Input required maxLength={200} value={cycleForm.name} onChange={(event) => setCycleForm({ ...cycleForm, name: event.target.value })} placeholder="Sprint 1 · Nộp bài tập OOP" /></label>
        <label className="block"><span className="label">Mục tiêu kiểm thử</span><Textarea value={cycleForm.goal} onChange={(event) => setCycleForm({ ...cycleForm, goal: event.target.value })} placeholder="Hoàn thành kiểm thử hành trình nộp bài" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Ngày bắt đầu *</span><Input required type="date" value={cycleForm.startDate} onChange={(event) => setCycleForm({ ...cycleForm, startDate: event.target.value })} /></label><label><span className="label">Ngày kết thúc *</span><Input required type="date" min={cycleForm.startDate || undefined} value={cycleForm.endDate} onChange={(event) => setCycleForm({ ...cycleForm, endDate: event.target.value })} /></label></div>
        <p className="text-xs text-slate-500">Cycle được tạo ở trạng thái Planning. Sau khi tạo, chọn Test Case và bấm Đưa vào Cycle để xếp vào Todo.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCycleOpen(false)}>Hủy</Button><Button disabled={createCycle.isPending}>{createCycle.isPending ? 'Đang tạo…' : 'Tạo Cycle'}</Button></div>
      </form>
    </Dialog>
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)} title={detail?.testCase?.title || 'Chi tiết Test Case'} description={detail ? `TC-${idOf(detail.testCase).slice(-6).toUpperCase()} · ${detail.status}` : ''} className="max-w-4xl">{detail && editForm && <div className="grid gap-6 lg:grid-cols-[1.3fr_.8fr]"><section><div className="flex flex-wrap gap-2"><Badge tone={priorityTone[detail.testCase.priority]}>{detail.testCase.priority}</Badge><Badge tone={detail.reviewState === 'Approved' ? 'green' : 'red'}>{detail.reviewState}</Badge>{detail.testPlan && <Badge tone="blue">{detail.testPlan.name}</Badge>}</div><p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail.testCase.description || 'Không có mô tả.'}</p><h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">Test Steps</h3><div className="mt-2 max-h-80 space-y-2 overflow-auto">{detail.testCase.testSteps?.map((step, index) => <div key={index} className="rounded-lg border p-3 dark:border-slate-700"><div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{index + 1}</span><div><p className="text-xs font-medium">{step.action}</p><p className="mt-1 text-[11px] text-slate-500"><strong>Expected:</strong> {step.expectedResult}</p></div></div></div>)}</div></section><aside className="space-y-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><label><span className="label">Cycle</span><Select value={editForm.cycle} onChange={(event) => setEditForm({ ...editForm, cycle: event.target.value })}><option value="">Chưa gán Cycle</option>{cyclesQuery.data?.map((cycle) => <option key={cycle._id} value={cycle._id}>{cycle.name}</option>)}</Select></label><label><span className="label">Assignee</span><Select value={editForm.assignee} onChange={(event) => setEditForm({ ...editForm, assignee: event.target.value })}><option value="">Chưa phân công</option>{membersQuery.data?.map((member) => <option key={member._id} value={member._id}>{member.fullName}</option>)}</Select></label><label><span className="label">Estimate (phút)</span><Input type="number" min="0" value={editForm.estimate} onChange={(event) => setEditForm({ ...editForm, estimate: event.target.value })} /></label><label><span className="label">Due date</span><Input type="date" value={editForm.dueDate} onChange={(event) => setEditForm({ ...editForm, dueDate: event.target.value })} /></label><div><span className="label">Labels</span><div className="space-y-2">{labelsQuery.data?.map((label) => <label key={label._id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editForm.labels.includes(label._id)} onChange={() => setEditForm({ ...editForm, labels: editForm.labels.includes(label._id) ? editForm.labels.filter((id) => id !== label._id) : [...editForm.labels, label._id] })} /><span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />{label.name}</label>)}</div></div><Button className="w-full" disabled={updateMutation.isPending} onClick={saveDetail}>{updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Lưu thuộc tính</Button></aside></div>}</Dialog>

    <Dialog open={planOpen} onOpenChange={setPlanOpen} title="Tạo kế hoạch chạy & Test Run" description={`Gom ${selected.length} Test Case Approved từ Board.`}><div className="space-y-4"><label><span className="label">Tên kế hoạch chạy</span><Input value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} placeholder="Cycle regression plan" /></label><label><span className="label">Tên Test Run</span><Input value={planForm.runName} onChange={(event) => setPlanForm({ ...planForm, runName: event.target.value })} placeholder="Chrome staging run" /></label><label><span className="label">Môi trường</span><Textarea rows={3} value={planForm.environment} onChange={(event) => setPlanForm({ ...planForm, environment: event.target.value })} /></label><div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900"><p className="font-semibold">Phạm vi được chọn</p><ul className="mt-2 space-y-1 text-slate-500">{selectedItems.map((item) => <li key={item._id}>• {item.testCase.title}</li>)}</ul></div><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button variant="outline" onClick={() => setPlanOpen(false)}>Hủy</Button><Button disabled={planMutation.isPending || !selected.length} onClick={() => planMutation.mutate()}>{planMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Tạo Plan & Run</Button></div></div></Dialog>
  </main>
}

function toEditForm(item) { return { cycle: idOf(item.cycle), assignee: idOf(item.assignee), labels: (item.labels || []).map(idOf), estimate: item.estimate || item.testCase?.estimatedTime || 0, dueDate: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '' } }
