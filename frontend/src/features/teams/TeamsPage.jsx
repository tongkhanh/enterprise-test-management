import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Loader2, Plus, Search, ShieldCheck, UserMinus, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { workspaceApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { Avatar, EmptyState, PageHeader } from '@/components/common/PageKit'
import { Badge, Button, Card, Dialog, Input, Select, Skeleton, Textarea } from '@/components/ui'

const colors = ['#5B4EF2', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E']
const initialForm = { project: '', name: '', key: '', description: '', color: colors[0] }
function Field({ label, required, children }) { return <label className="block"><span className="label">{label}{required && <span className="text-rose-500"> *</span>}</span>{children}</label> }

export default function TeamsPage() {
  const user = useAuthStore((state) => state.user)
  const canManage = user?.role?.permissions?.includes('team:manage') || false
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [form, setForm] = useState(initialForm)
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const teamsQuery = useQuery({ queryKey: ['teams', projectFilter], queryFn: () => workspaceApi.teams(projectFilter) })
  const membershipsQuery = useQuery({ queryKey: ['project-memberships', projectFilter], queryFn: () => workspaceApi.memberships(projectFilter), enabled: Boolean(projectFilter) })
  const teams = useMemo(() => (teamsQuery.data || []).filter((team) => {
    const keyword = search.trim().toLowerCase()
    return !keyword || `${team.name} ${team.key} ${team.description || ''}`.toLowerCase().includes(keyword)
  }), [teamsQuery.data, search])

  const mutation = useMutation({
    mutationFn: workspaceApi.createTeam,
    onSuccess: () => {
      toast.success('Đã tạo Team')
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      setOpen(false)
      setForm(initialForm)
    },
    onError: (error) => toast.error(error.message),
  })
  const roleMutation = useMutation({
    mutationFn: ({ membership, role }) => workspaceApi.updateMembership(projectFilter, membership, { role }),
    onSuccess: () => { toast.success('Đã cập nhật quyền trong Project'); queryClient.invalidateQueries({ queryKey: ['project-memberships', projectFilter] }); queryClient.invalidateQueries({ queryKey: ['projects'] }) },
    onError: (error) => toast.error(error.message),
  })
  const removeMutation = useMutation({
    mutationFn: (membership) => workspaceApi.removeMembership(projectFilter, membership),
    onSuccess: () => { toast.success('Đã xóa thành viên khỏi Project'); queryClient.invalidateQueries({ queryKey: ['project-memberships', projectFilter] }); queryClient.invalidateQueries({ queryKey: ['teams'] }); queryClient.invalidateQueries({ queryKey: ['projects'] }) },
    onError: (error) => toast.error(error.message),
  })

  const startCreate = () => {
    setForm({ ...initialForm, project: projectFilter || projectsQuery.data?.[0]?._id || '' })
    setOpen(true)
  }
  const submit = (event) => {
    event.preventDefault()
    if (!form.project || !form.name.trim() || !form.key.trim()) { toast.error('Project, tên Team và mã Team là bắt buộc'); return }
    mutation.mutate({ ...form, key: form.key.toUpperCase() })
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Collaboration" title="Teams & Members" description="QA Manager tổ chức Team; Tester thực hiện kiểm thử và Guest theo dõi." actions={canManage && <Button onClick={startCreate}><Plus className="h-4 w-4" />Tạo Team</Button>} />
    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm Team…" /></div><Select className="sm:w-64" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">Tất cả Projects</option>{projectsQuery.data?.map((project) => <option key={project._id} value={project._id}>{project.key} · {project.name}</option>)}</Select></div>

    {teamsQuery.isLoading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-56" />)}</div> : teams.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{teams.map((team) => <Card key={team._id} className="p-4"><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ backgroundColor: team.color }}><FlaskConical className="h-4 w-4" /></span><Badge tone={team.isArchived ? 'slate' : 'green'}>{team.isArchived ? 'Archived' : 'Active'}</Badge></div><div className="mt-4"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{team.name}</h2><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800">{team.key}</span></div><p className="mt-1 text-[11px] text-violet-600 dark:text-violet-400">{team.project?.key} · {team.project?.name}</p><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500 dark:text-slate-400">{team.description || 'Chưa có mô tả trách nhiệm của Team.'}</p></div><div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><div><p className="flex items-center gap-1.5 text-[11px] font-medium"><UsersRound className="h-3.5 w-3.5" />{team.members?.length || 0} thành viên</p>{team.lead && <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><ShieldCheck className="h-3 w-3" />Lead: {team.lead.fullName}</p>}</div><div className="flex -space-x-2">{team.members?.slice(0, 5).map((member) => <Avatar key={member._id} user={member} />)}</div></div></Card>)}</div> : <EmptyState title="Chưa có Team" description="Tạo Team đầu tiên và phân chia trách nhiệm giữa QA Manager, Tester và Guest." action={canManage && <Button size="sm" onClick={startCreate}><Plus className="h-4 w-4" />Tạo Team</Button>} />}

    <Card className="overflow-hidden p-0"><div className="border-b border-slate-100 p-4 dark:border-slate-800"><h2 className="text-sm font-semibold">Project Members</h2><p className="mt-1 text-xs text-slate-400">Chọn một Project ở bộ lọc phía trên để xem và thay đổi quyền thành viên.</p></div>{!projectFilter ? <div className="p-5"><EmptyState title="Chưa chọn Project" description="Quyền QA Manager, Tester và Guest được quản lý độc lập trong từng Project." /></div> : membershipsQuery.isLoading ? <div className="space-y-2 p-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-14" />)}</div> : membershipsQuery.data?.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{membershipsQuery.data.map((membership) => <div key={membership._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><Avatar user={membership.user} className="h-9 w-9" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{membership.user?.fullName}</p><p className="truncate text-[10px] text-slate-400">{membership.user?.email} · {membership.teams?.map((team) => team.name).join(', ') || 'Chưa gán Team'}</p></div>{canManage ? <Select className="sm:w-40" value={membership.role} disabled={roleMutation.isPending} onChange={(event) => roleMutation.mutate({ membership: membership._id, role: event.target.value })}>{['QA_Manager', 'Tester', 'Guest'].map((role) => <option key={role}>{role}</option>)}</Select> : <Badge tone="purple">{membership.role}</Badge>}{canManage && <Button variant="ghost" size="sm" aria-label="Xóa thành viên" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(membership._id)}><UserMinus className="h-4 w-4 text-rose-500" /></Button>}</div>)}</div> : <div className="p-5"><EmptyState title="Project chưa có thành viên" description="Mời thành viên từ trang Projects để bắt đầu cộng tác." /></div>}</Card>

    <Dialog open={open} onOpenChange={setOpen} title="Tạo Team" description="Team thuộc một Project và có thể nhận thành viên qua lời mời."><form className="space-y-4" onSubmit={submit}><Field label="Project" required><Select value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })}><option value="">Chọn Project</option>{projectsQuery.data?.map((project) => <option key={project._id} value={project._id}>{project.key} · {project.name}</option>)}</Select></Field><div className="grid gap-4 sm:grid-cols-[1fr_140px]"><Field label="Tên Team" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Automation QA" /></Field><Field label="Team Key" required><Input value={form.key} maxLength={12} onChange={(event) => setForm({ ...form, key: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="AUTO" /></Field></div><Field label="Mô tả"><Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Phạm vi và trách nhiệm của Team…" /></Field><Field label="Màu nhận diện"><div className="flex gap-2">{colors.map((color) => <button key={color} type="button" aria-label={`Chọn màu ${color}`} className={`h-8 w-8 rounded-lg transition ${form.color === color ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900' : ''}`} style={{ backgroundColor: color }} onClick={() => setForm({ ...form, color })} />)}</div></Field><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Tạo Team</Button></div></form></Dialog>
  </div>
}
