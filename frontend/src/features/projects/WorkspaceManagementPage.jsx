import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Building2, Check, Clipboard, Loader2, MailPlus, Save, UserMinus, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { workspaceApi } from '@/api/client'
import { Avatar, EmptyState, PageHeader, SectionTitle } from '@/components/common/PageKit'
import WorkspaceContextBar from '@/components/workspace/WorkspaceContextBar'
import { Badge, Button, Card, Dialog, Input, Select, Skeleton, Textarea } from '@/components/ui'
import { roleLabel } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspaceStore'

const emptyInvite = { email: '', role: 'Tester' }
const emptyWorkspace = { name: '', slug: '', description: '', plan: 'Free' }
const toSlug = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function Field({ label, children }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}

export default function WorkspaceManagementPage() {
  const queryClient = useQueryClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [draft, setDraft] = useState(null)
  const [invite, setInvite] = useState(emptyInvite)
  const [inviteUrl, setInviteUrl] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newWorkspace, setNewWorkspace] = useState(emptyWorkspace)
  const inviteRef = useRef(null)
  const membersRef = useRef(null)
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId)
  const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)
  const workspacesQuery = useQuery({ queryKey: ['workspaces'], queryFn: workspaceApi.workspaces })
  const workspaces = workspacesQuery.data || []
  const workspace = useMemo(() => workspaces.find((item) => item._id === (workspaceId || selectedWorkspaceId)) || workspaces[0], [workspaces, workspaceId, selectedWorkspaceId])
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const teamsQuery = useQuery({ queryKey: ['workspace-teams', workspace?._id], queryFn: () => workspaceApi.teams('', workspace._id), enabled: Boolean(workspace?._id) })
  const canManage = ['Owner', 'QA_Manager'].includes(workspace?.currentRole)
  const membersQuery = useQuery({ queryKey: ['workspace-memberships', workspace?._id], queryFn: () => workspaceApi.workspaceMemberships(workspace._id), enabled: Boolean(workspace?._id) })
  const invitationsQuery = useQuery({ queryKey: ['workspace-invitations', workspace?._id], queryFn: () => workspaceApi.workspaceInvitations(workspace._id), enabled: Boolean(workspace?._id) && canManage })

  useEffect(() => {
    if (workspace && workspace._id !== draft?._id) setDraft({ ...workspace })
    if (workspace && workspace._id !== selectedWorkspaceId) setSelectedWorkspaceId(workspace._id)
  }, [workspace, draft?._id, selectedWorkspaceId, setSelectedWorkspaceId])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    queryClient.invalidateQueries({ queryKey: ['workspace-memberships', workspace?._id] })
    queryClient.invalidateQueries({ queryKey: ['workspace-invitations', workspace?._id] })
  }
  const saveWorkspace = useMutation({
    mutationFn: () => workspaceApi.updateWorkspace(workspace._id, { name: draft.name, description: draft.description, isActive: draft.isActive }),
    onSuccess: (result) => { toast.success('Đã cập nhật Workspace'); setDraft(result); refresh() },
    onError: (error) => toast.error(error.message),
  })
  const createWorkspace = useMutation({
    mutationFn: () => workspaceApi.createWorkspace(newWorkspace),
    onSuccess: (result) => { toast.success('Đã tạo Workspace mới'); setSelectedWorkspaceId(result._id); setWorkspaceId(result._id); setNewWorkspace(emptyWorkspace); setCreateOpen(false); refresh() },
    onError: (error) => toast.error(error.message),
  })
  const inviteMember = useMutation({
    mutationFn: () => workspaceApi.inviteToWorkspace(workspace._id, invite),
    onSuccess: (result) => { toast.success(result.invitation.emailDelivery === 'Sent' ? 'Đã gửi lời mời' : 'Đã tạo liên kết mời'); setInvite(emptyInvite); setInviteUrl(result.inviteUrl); refresh() },
    onError: (error) => toast.error(error.message),
  })
  const changeRole = useMutation({
    mutationFn: ({ membership, role }) => workspaceApi.updateWorkspaceMembership(workspace._id, membership, { role }),
    onSuccess: () => { toast.success('Đã cập nhật vai trò'); refresh() },
    onError: (error) => toast.error(error.message),
  })
  const removeMember = useMutation({
    mutationFn: (membership) => workspaceApi.removeWorkspaceMembership(workspace._id, membership),
    onSuccess: () => { toast.success('Đã xóa thành viên khỏi Workspace'); refresh() },
    onError: (error) => toast.error(error.message),
  })

  return <div className="space-y-6">
    <PageHeader eyebrow="Workspace" title="Quản lý Workspace" description="Cập nhật thông tin Workspace, quản lý thành viên và gửi lời mời cộng tác." actions={<><Button variant="outline" onClick={() => setCreateOpen(true)}><Building2 className="h-4 w-4" />Tạo Workspace</Button>{canManage && <Button variant="outline" onClick={() => inviteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><MailPlus className="h-4 w-4" />Mời thành viên</Button>}{canManage && <Button onClick={() => membersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><UsersRound className="h-4 w-4" />Quản lý thành viên</Button>}</>} />
    <WorkspaceContextBar />
    {workspacesQuery.isLoading ? <Skeleton className="h-96" /> : !workspaces.length ? <EmptyState title="Chưa có Workspace" description="Tạo Workspace đầu tiên từ trang Projects để bắt đầu quản lý đội ngũ." /> : <>
      <Card className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><Field label="Workspace đang quản lý"><Select value={workspace?._id || ''} onChange={(event) => { setWorkspaceId(event.target.value); setSelectedWorkspaceId(event.target.value) }}>{workspaces.map((item) => <option key={item._id} value={item._id}>{item.name} · {roleLabel(item.currentRole)}</option>)}</Select></Field></div><Badge tone={workspace?.isActive ? 'green' : 'slate'}>{workspace?.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 dark:border-slate-800 sm:grid-cols-4"><div><p className="text-[11px] text-slate-400">Projects</p><p className="mt-1 text-xl font-semibold">{projectsQuery.data?.filter((p) => String(p.workspace?._id || p.workspace) === String(workspace?._id)).length || 0}</p></div><div><p className="text-[11px] text-slate-400">Teams</p><p className="mt-1 text-xl font-semibold">{teamsQuery.data?.length || 0}</p></div><div><p className="text-[11px] text-slate-400">Members</p><p className="mt-1 text-xl font-semibold">{membersQuery.data?.length || 0}</p></div><div><p className="text-[11px] text-slate-400">Pending invites</p><p className="mt-1 text-xl font-semibold">{invitationsQuery.data?.filter((item) => item.status === 'Pending').length || 0}</p></div></div></Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5"><SectionTitle title="Thông tin Workspace" description={canManage ? 'Owner hoặc QA Manager có thể cập nhật thông tin và tổ chức Workspace.' : 'Bạn đang có quyền xem trong Workspace này.'} />
          <div className="mt-5 space-y-4"><Field label="Tên Workspace"><Input disabled={!canManage} value={draft?.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field><Field label="Mô tả"><Textarea disabled={!canManage} rows={4} value={draft?.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Mô tả mục tiêu và phạm vi sử dụng Workspace…" /></Field><div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 dark:border-slate-800"><p className="text-xs text-slate-400">Slug: <span className="font-mono">{workspace?.slug}</span> · Gói {workspace?.plan}</p>{canManage && <div className="flex gap-2"><Button variant="outline" disabled={saveWorkspace.isPending} onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}><Archive className="h-4 w-4" />{draft?.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}</Button><Button disabled={saveWorkspace.isPending || !draft?.name?.trim()} onClick={() => saveWorkspace.mutate()}>{saveWorkspace.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu</Button></div>}</div></div>
        </Card>
        <Card ref={inviteRef} className="p-5"><SectionTitle title="Mời thành viên" description={canManage ? 'Vai trò áp dụng trên toàn bộ Workspace.' : 'Owner hoặc QA Manager có thể gửi lời mời.'} />
          {canManage && <div className="mt-4 space-y-3"><Field label="Email"><Input type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="tester@company.com" /></Field><Field label="Vai trò"><Select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>{['QA_Manager', 'Tester', 'Guest'].map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select></Field><Button className="w-full" disabled={inviteMember.isPending || !invite.email} onClick={() => inviteMember.mutate()}>{inviteMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}Gửi lời mời</Button>{inviteUrl && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Liên kết mời đã sẵn sàng</p><div className="mt-2 flex gap-2"><Input readOnly value={inviteUrl} className="bg-white text-[10px]" /><Button size="sm" variant="outline" aria-label="Sao chép liên kết mời" onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success('Đã sao chép liên kết') }}><Clipboard className="h-3.5 w-3.5" /></Button></div></div>}</div>}
        </Card>
      </div>

      <Card ref={membersRef} className="overflow-hidden p-0"><div className="border-b border-slate-100 p-5 dark:border-slate-800"><SectionTitle title="Thành viên Workspace" description="Quyền này áp dụng cho các Project thuộc Workspace." /></div>{membersQuery.isLoading ? <div className="space-y-2 p-5">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-14" />)}</div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{membersQuery.data?.map((membership) => { const isOwner = membership.role === 'Owner'; return <div key={membership._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><Avatar user={membership.user} className="h-9 w-9" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{membership.user?.fullName}</p><p className="truncate text-[10px] text-slate-400">{membership.user?.email}</p></div>{canManage && !isOwner ? <Select className="sm:w-36" value={membership.role} disabled={changeRole.isPending} onChange={(event) => changeRole.mutate({ membership: membership._id, role: event.target.value })}>{['QA_Manager', 'Tester', 'Guest'].map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select> : <Badge tone={isOwner ? 'purple' : 'slate'}>{roleLabel(membership.role)}</Badge>}{canManage && !isOwner && <Button variant="ghost" size="sm" aria-label="Xóa thành viên" disabled={removeMember.isPending} onClick={() => removeMember.mutate(membership._id)}><UserMinus className="h-4 w-4 text-rose-500" /></Button>}</div>})}</div>}</Card>
      {canManage && <Card className="p-5"><SectionTitle title="Lời mời gần đây" description="Theo dõi các lời mời được gửi từ Workspace." />{invitationsQuery.isLoading ? <Skeleton className="mt-4 h-20" /> : invitationsQuery.data?.length ? <div className="mt-4 space-y-2">{invitationsQuery.data.slice(0, 5).map((item) => <div key={item._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900"><div><p className="font-medium">{item.email}</p><p className="mt-0.5 text-[10px] text-slate-400">{roleLabel(item.role)}</p></div><Badge tone={item.status === 'Accepted' ? 'green' : item.status === 'Pending' ? 'amber' : 'slate'}>{item.status}</Badge></div>)}</div> : <p className="mt-4 text-xs text-slate-400">Chưa có lời mời nào.</p>}</Card>}
    </>}
    <Dialog open={createOpen} onOpenChange={setCreateOpen} title="Tạo Workspace mới" description="Workspace là ranh giới dữ liệu, thành viên, Team và Project độc lập."><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!newWorkspace.name.trim() || !newWorkspace.slug.trim()) return toast.error('Tên và slug Workspace là bắt buộc.'); createWorkspace.mutate() }}><Field label="Tên Workspace"><Input required value={newWorkspace.name} onChange={(event) => { const name = event.target.value; setNewWorkspace((current) => ({ ...current, name, slug: current.slug || toSlug(name) })) }} placeholder="QA Engineering" /></Field><Field label="Slug"><Input required value={newWorkspace.slug} onChange={(event) => setNewWorkspace({ ...newWorkspace, slug: toSlug(event.target.value) })} placeholder="qa-engineering" /></Field><Field label="Mô tả"><Textarea rows={3} value={newWorkspace.description} onChange={(event) => setNewWorkspace({ ...newWorkspace, description: event.target.value })} placeholder="Mục tiêu và phạm vi Workspace…" /></Field><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button><Button disabled={createWorkspace.isPending}>{createWorkspace.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Tạo Workspace</Button></div></form></Dialog>
  </div>
}
