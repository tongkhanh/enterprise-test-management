import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive, Building2, CalendarDays, Check, Clipboard, Loader2,
  MailPlus, MoreHorizontal, Plus, RotateCw, Search, UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { workspaceApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Avatar, EmptyState, PageHeader } from '@/components/common/PageKit'
import WorkspaceContextBar from '@/components/workspace/WorkspaceContextBar'
import { Badge, Button, Card, Dialog, Input, Select, Skeleton, Textarea } from '@/components/ui'
import { formatDate, roleLabel } from '@/lib/utils'

const initialProject = { name: '', key: '', description: '', workspace: '', startDate: '', endDate: '' }
const initialWorkspace = { name: '', slug: '', description: '', plan: 'Free' }
function toSlug(text) { return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
const initialInvite = { email: '', role: 'Tester', team: '' }

function Field({ label, required, children }) { return <label className="block"><span className="label">{label}{required && <span className="text-rose-500"> *</span>}</span>{children}</label> }

export default function ProjectsPage() {
  const user = useAuthStore((state) => state.user)
  const roleName = user?.role?.name || user?.role
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setSelectedProjectId = useWorkspaceStore((state) => state.setSelectedProjectId)
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId)
  const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)
  const [search, setSearch] = useState('')
  const [projectOpen, setProjectOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceManageOpen, setWorkspaceManageOpen] = useState(false)
  const [workspaceEdit, setWorkspaceEdit] = useState(null)
  const [editProject, setEditProject] = useState(null)
  const [inviteProject, setInviteProject] = useState(null)
  const [projectForm, setProjectForm] = useState(initialProject)
  const [workspaceForm, setWorkspaceForm] = useState(initialWorkspace)
  const [inviteForm, setInviteForm] = useState(initialInvite)
  const [inviteUrl, setInviteUrl] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  // Scope cached lists by account so a new account never sees the previous
  // account's empty Project/Workspace cache after accepting an invitation.
  const projectsQuery = useQuery({ queryKey: ['projects', user?._id], queryFn: workspaceApi.projects, enabled: Boolean(user) })
  const workspacesQuery = useQuery({ queryKey: ['workspaces', user?._id], queryFn: workspaceApi.workspaces, enabled: Boolean(user) })
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: () => workspaceApi.teams() })
  const invitationsQuery = useQuery({
    queryKey: ['project-invitations', inviteProject?._id],
    queryFn: () => workspaceApi.invitations(inviteProject._id),
    enabled: Boolean(inviteProject?._id),
  })

  const canCreateWorkspace = roleName === 'User'
  const canManage = (workspacesQuery.data || []).some((workspace) => ['Owner', 'QA_Manager'].includes(workspace.currentRole))
  const activeWorkspace = (workspacesQuery.data || []).find((workspace) => workspace._id === selectedWorkspaceId) || workspacesQuery.data?.[0]
  useEffect(() => { if (activeWorkspace && activeWorkspace._id !== selectedWorkspaceId) setSelectedWorkspaceId(activeWorkspace._id) }, [activeWorkspace, selectedWorkspaceId, setSelectedWorkspaceId])

  const projects = useMemo(() => (projectsQuery.data || []).filter((project) => {
    if (activeWorkspace && String(project.workspace?._id || project.workspace) !== String(activeWorkspace._id)) return false
    const keyword = search.trim().toLowerCase()
    return !keyword || `${project.name} ${project.key} ${project.description || ''}`.toLowerCase().includes(keyword)
  }), [projectsQuery.data, search, activeWorkspace])

  const createWorkspace = useMutation({
    mutationFn: workspaceApi.createWorkspace,
    onSuccess: (workspace) => {
      toast.success('Đã tạo Workspace')
      setSelectedWorkspaceId(workspace._id)
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setWorkspaceOpen(false)
      setWorkspaceForm(initialWorkspace)
      setProjectForm((form) => ({ ...form, workspace: workspace._id }))
      setProjectOpen(true)
    },
    onError: (error) => toast.error(error.message),
  })

  const createProject = useMutation({
    mutationFn: workspaceApi.createProject,
    onSuccess: (project) => {
      toast.success(`Đã tạo Project ${project.key}`)
      setSelectedWorkspaceId(project.workspace?._id || project.workspace || projectForm.workspace)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      setSelectedProjectId(project._id)
      setProjectOpen(false)
      setProjectForm(initialProject)
    },
    onError: (error) => toast.error(error.message),
  })
  const updateWorkspace = useMutation({
    mutationFn: ({ id, body }) => workspaceApi.updateWorkspace(id, body),
    onSuccess: (workspace) => { toast.success('Đã cập nhật Workspace'); setWorkspaceEdit(workspace); queryClient.invalidateQueries({ queryKey: ['workspaces'] }) },
    onError: (error) => toast.error(error.message),
  })
  const updateProject = useMutation({
    mutationFn: ({ id, body }) => workspaceApi.updateProject(id, body),
    onSuccess: () => { toast.success('Đã cập nhật Project'); setEditProject(null); queryClient.invalidateQueries({ queryKey: ['projects'] }); queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] }) },
    onError: (error) => toast.error(error.message),
  })

  const sendInvite = useMutation({
    mutationFn: () => workspaceApi.invite(inviteProject._id, { ...inviteForm, team: inviteForm.team || null }),
    onSuccess: (result) => {
      toast.success(result.invitation.emailDelivery === 'Sent' ? 'Đã gửi lời mời qua email' : 'Đã tạo lời mời; bạn có thể sao chép liên kết')
      setInviteUrl(result.inviteUrl)
      queryClient.invalidateQueries({ queryKey: ['project-invitations', inviteProject._id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
    onError: (error) => toast.error(error.message),
  })

  const resendInvite = useMutation({
    mutationFn: workspaceApi.resendInvitation,
    onSuccess: (result) => {
      toast.success(result.invitation.emailDelivery === 'Sent' ? 'Đã gửi lại email mời' : 'Đã tạo liên kết mời mới')
      setInviteUrl(result.inviteUrl)
      queryClient.invalidateQueries({ queryKey: ['project-invitations', inviteProject._id] })
    },
    onError: (error) => toast.error(error.message),
  })

  const openProjectDialog = () => {
    const workspace = activeWorkspace
    if (!workspace) { setWorkspaceOpen(true); return }
    setProjectForm({ ...initialProject, workspace: workspace._id })
    setProjectOpen(true)
  }
  const openWorkspaceManager = () => {
    const workspace = activeWorkspace
    if (!workspace) { setSlugTouched(false); setWorkspaceForm(initialWorkspace); setWorkspaceOpen(true); return }
    setWorkspaceEdit({ ...workspace })
    setWorkspaceManageOpen(true)
  }

  const submitProject = (event) => {
    event.preventDefault()
    if (!projectForm.name.trim() || !projectForm.key.trim() || !projectForm.workspace) { toast.error('Tên, mã Project và Workspace là bắt buộc'); return }
    createProject.mutate({ ...projectForm, key: projectForm.key.toUpperCase(), endDate: projectForm.endDate || null, startDate: projectForm.startDate || null })
  }

  const submitWorkspace = (event) => {
    event.preventDefault()
    if (!workspaceForm.name.trim() || !workspaceForm.slug.trim()) { toast.error('Tên và slug Workspace là bắt buộc'); return }
    createWorkspace.mutate(workspaceForm)
  }

  const openInvite = (project) => {
    setInviteProject(project)
    setSelectedProjectId(project._id)
    setInviteForm(initialInvite)
    setInviteUrl('')
  }

  return <div className="space-y-5">
    <PageHeader eyebrow={`${activeWorkspace?.name || 'Workspace'} / Delivery`} title="Projects" description="Mỗi Project là một không gian làm việc hoàn chỉnh: thành viên, Team, User Story, Test Case, Cycle, Automation và Bug." actions={<>{canCreateWorkspace && <Button variant="outline" onClick={openWorkspaceManager}><Building2 className="h-4 w-4" />Quản lý Workspace</Button>}{canManage && <Button onClick={openProjectDialog}><Plus className="h-4 w-4" />Tạo Project</Button>}</>} />
    <WorkspaceContextBar />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder={`Tìm trong ${activeWorkspace?.name || 'Workspace'}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></div><p className="text-xs text-slate-400">{projects.length} Project có quyền truy cập</p></div>

    {projectsQuery.isLoading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-64" />)}</div> : projects.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => { const canManageProject = ['Owner', 'QA_Manager'].includes(project.currentRole); return <Card key={project._id} role="button" tabIndex={0} onClick={() => navigate(`/projects/${project._id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/projects/${project._id}`) }} className="group cursor-pointer p-4 transition hover:-translate-y-0.5 hover:shadow-lg dark:hover:border-slate-700">
      <div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-950">{project.key?.slice(0, 2)}</span>{canManageProject && <button aria-label="Cài đặt Project" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={(event) => { event.stopPropagation(); setEditProject({ ...project, startDate: project.startDate?.slice(0, 10) || '', endDate: project.endDate?.slice(0, 10) || '' }) }}><MoreHorizontal className="h-4 w-4" /></button>}</div>
      <div className="mt-4 flex items-center gap-2"><h2 className="truncate text-sm font-semibold">{project.name}</h2><Badge tone={project.status === 'Active' ? 'green' : 'slate'}>{project.status}</Badge></div>
      <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500 dark:text-slate-400">{project.description || 'Chưa có mô tả cho Project này.'}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-[11px] dark:bg-slate-900"><div className="flex items-center gap-1.5 text-slate-500"><UsersRound className="h-3.5 w-3.5" /><strong className="text-slate-800 dark:text-slate-200">{project.members?.length || 0}</strong> thành viên</div><div className="flex items-center gap-1.5 text-slate-500"><Building2 className="h-3.5 w-3.5" /><strong className="text-slate-800 dark:text-slate-200">{project.teams?.length || 0}</strong> Team</div><div className="flex items-center gap-1.5 text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{project.startDate ? new Date(project.startDate).toLocaleDateString('vi-VN') : 'Chưa đặt ngày'}</div></div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800"><div className="flex -space-x-2">{project.members?.slice(0, 4).map((member) => <Avatar key={member._id} user={member} />)}{!project.members?.length && <span className="text-[11px] text-slate-400">Chưa có thành viên</span>}</div>{canManageProject && <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); openInvite(project) }}><MailPlus className="h-3.5 w-3.5" />Mời</Button>}</div>
    </Card> })}</div> : <EmptyState title="Chưa có Project phù hợp" description="Tạo Workspace trước, sau đó tạo Project để gom User Story, Test Case, Team và kết quả kiểm thử." action={<div className="flex flex-wrap justify-center gap-2">{canCreateWorkspace && <Button size="sm" variant="outline" onClick={openWorkspaceManager}><Building2 className="h-4 w-4" />{workspacesQuery.data?.length ? 'Quản lý Workspace' : 'Tạo Workspace'}</Button>}{canManage && <Button size="sm" onClick={openProjectDialog}><Plus className="h-4 w-4" />Tạo Project</Button>}</div>} />}

    <Dialog open={workspaceOpen} onOpenChange={setWorkspaceOpen} title="Tạo Workspace" description="Workspace là không gian cấp cao nhất chứa các Project.">
      <form className="space-y-4" onSubmit={submitWorkspace}><div className="grid gap-4 sm:grid-cols-2"><Field label="Tên Workspace" required><Input value={workspaceForm.name} onChange={(event) => { const name = event.target.value; setWorkspaceForm((prev) => ({ ...prev, name, ...(slugTouched ? {} : { slug: toSlug(name) }) })) }} placeholder="QA Engineering" /></Field><Field label="Slug" required><Input value={workspaceForm.slug} onChange={(event) => { setSlugTouched(true); setWorkspaceForm({ ...workspaceForm, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }) }} placeholder="qa-engineering" /></Field></div><Field label="Mô tả"><Textarea rows={3} value={workspaceForm.description} onChange={(event) => setWorkspaceForm({ ...workspaceForm, description: event.target.value })} /></Field><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setWorkspaceOpen(false)}>Hủy</Button><Button disabled={createWorkspace.isPending}>{createWorkspace.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Tạo Workspace</Button></div></form>
    </Dialog>

    <Dialog open={projectOpen} onOpenChange={setProjectOpen} title="Tạo Project mới" description="Thiết lập không gian làm việc cho một sản phẩm hoặc phạm vi kiểm thử.">
      <form className="space-y-4" onSubmit={submitProject}><Field label="Workspace" required><Select value={projectForm.workspace} onChange={(event) => setProjectForm({ ...projectForm, workspace: event.target.value })}><option value="">Chọn Workspace</option>{workspacesQuery.data?.map((workspace) => <option key={workspace._id} value={workspace._id}>{workspace.name}</option>)}</Select></Field><div className="grid gap-4 sm:grid-cols-[1fr_140px]"><Field label="Tên Project" required><Input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="Web Commerce Platform" /></Field><Field label="Project Key" required><Input value={projectForm.key} maxLength={10} onChange={(event) => setProjectForm({ ...projectForm, key: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="WCP" /></Field></div><Field label="Mô tả"><Textarea rows={3} value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} placeholder="Mục tiêu và phạm vi của Project…" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Ngày bắt đầu"><Input type="date" value={projectForm.startDate} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} /></Field><Field label="Ngày mục tiêu"><Input type="date" value={projectForm.endDate} onChange={(event) => setProjectForm({ ...projectForm, endDate: event.target.value })} /></Field></div><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setProjectOpen(false)}>Hủy</Button><Button disabled={createProject.isPending}>{createProject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Tạo Project</Button></div></form>
    </Dialog>

    <Dialog open={workspaceManageOpen} onOpenChange={setWorkspaceManageOpen} title="Quản lý Workspace" description="Cập nhật tên, mô tả hoặc trạng thái hoạt động của Workspace.">{workspaceEdit && <div className="space-y-4"><Field label="Workspace"><Select value={workspaceEdit._id} onChange={(event) => setWorkspaceEdit({ ...workspacesQuery.data.find((item) => item._id === event.target.value) })}>{workspacesQuery.data?.map((workspace) => <option key={workspace._id} value={workspace._id}>{workspace.name}</option>)}</Select></Field><Field label="Tên Workspace" required><Input value={workspaceEdit.name || ''} onChange={(event) => setWorkspaceEdit({ ...workspaceEdit, name: event.target.value })} /></Field><Field label="Mô tả"><Textarea rows={3} value={workspaceEdit.description || ''} onChange={(event) => setWorkspaceEdit({ ...workspaceEdit, description: event.target.value })} /></Field><div className="flex flex-col-reverse justify-between gap-2 border-t pt-4 dark:border-slate-800 sm:flex-row"><Button variant="danger" disabled={updateWorkspace.isPending} onClick={() => updateWorkspace.mutate({ id: workspaceEdit._id, body: { isActive: !workspaceEdit.isActive } })}><Archive className="h-4 w-4" />{workspaceEdit.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}</Button><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setWorkspaceManageOpen(false)}>Đóng</Button><Button disabled={updateWorkspace.isPending || !workspaceEdit.name?.trim()} onClick={() => updateWorkspace.mutate({ id: workspaceEdit._id, body: { name: workspaceEdit.name, description: workspaceEdit.description } })}>{updateWorkspace.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu</Button></div></div></div>}</Dialog>

    <Dialog open={Boolean(editProject)} onOpenChange={(value) => !value && setEditProject(null)} title="Cài đặt Project" description={editProject ? `${editProject.key} · ${editProject.name}` : ''}>{editProject && <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-[1fr_140px]"><Field label="Tên Project" required><Input value={editProject.name || ''} onChange={(event) => setEditProject({ ...editProject, name: event.target.value })} /></Field><Field label="Trạng thái"><Select value={editProject.status || 'Active'} onChange={(event) => setEditProject({ ...editProject, status: event.target.value })}>{['Active', 'Completed', 'Archived'].map((status) => <option key={status}>{status}</option>)}</Select></Field></div><Field label="Mô tả"><Textarea rows={3} value={editProject.description || ''} onChange={(event) => setEditProject({ ...editProject, description: event.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Ngày bắt đầu"><Input type="date" value={editProject.startDate || ''} onChange={(event) => setEditProject({ ...editProject, startDate: event.target.value })} /></Field><Field label="Ngày mục tiêu"><Input type="date" value={editProject.endDate || ''} onChange={(event) => setEditProject({ ...editProject, endDate: event.target.value })} /></Field></div><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button variant="outline" onClick={() => setEditProject(null)}>Hủy</Button><Button disabled={updateProject.isPending || !editProject.name?.trim()} onClick={() => updateProject.mutate({ id: editProject._id, body: { name: editProject.name, description: editProject.description, status: editProject.status, startDate: editProject.startDate || null, endDate: editProject.endDate || null } })}>{updateProject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu thay đổi</Button></div></div>}</Dialog>

    <Dialog open={Boolean(inviteProject)} onOpenChange={(open) => !open && setInviteProject(null)} title={`Mời thành viên vào ${inviteProject?.name || ''}`} description="Thành viên nhận liên kết một lần và được gán đúng vai trò trong Project.">
      <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Email" required><Input type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder="tester@company.com" /></Field><Field label="Vai trò trong Project" required><Select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>{['QA_Manager', 'Tester', 'Guest'].map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select></Field></div><Field label="Team (không bắt buộc)"><Select value={inviteForm.team} onChange={(event) => setInviteForm({ ...inviteForm, team: event.target.value })}><option value="">Chưa gán Team</option>{teamsQuery.data?.filter((team) => team.project?._id === inviteProject?._id || team.projects?.some((project) => (project._id || project) === inviteProject?._id)).map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}</Select></Field>
        {inviteUrl && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />Lời mời đã sẵn sàng</div><div className="mt-2 flex gap-2"><Input readOnly value={inviteUrl} className="h-9 bg-white text-[11px]" /><Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success('Đã sao chép liên kết') }}><Clipboard className="h-3.5 w-3.5" /></Button></div></div>}
        <div className="flex justify-end"><Button disabled={sendInvite.isPending || !inviteForm.email} onClick={() => sendInvite.mutate()}>{sendInvite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}Gửi lời mời</Button></div>
        <div className="border-t pt-4 dark:border-slate-800"><h3 className="text-xs font-semibold">Lời mời gần đây</h3><div className="mt-2 max-h-48 space-y-2 overflow-auto">{invitationsQuery.data?.slice(0, 5).map((invitation) => <div key={invitation._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{invitation.email}</p><p className="mt-0.5 text-[10px] text-slate-400">{roleLabel(invitation.role)} · {formatDate(invitation.createdAt)}</p></div><Badge tone={invitation.status === 'Accepted' ? 'green' : invitation.status === 'Pending' ? 'amber' : 'slate'}>{invitation.status}</Badge>{['Pending', 'Expired'].includes(invitation.status) && <Button size="sm" variant="ghost" disabled={resendInvite.isPending} onClick={() => resendInvite.mutate(invitation._id)}><RotateCw className="h-3 w-3" />Gửi lại</Button>}</div>)}{!invitationsQuery.isLoading && !invitationsQuery.data?.length && <p className="py-3 text-center text-xs text-slate-400">Chưa có lời mời.</p>}</div></div>
      </div>
    </Dialog>
  </div>
}
