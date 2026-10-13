import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Mail, ShieldCheck, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { invitationApi, workspaceInvitationApi } from '@/api/client'
import { EmptyState, PageHeader } from '@/components/common/PageKit'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { formatDate, roleLabel } from '@/lib/utils'

export default function InvitationsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['my-invitations-inbox'],
    queryFn: async () => {
      const [projects, workspaces] = await Promise.all([invitationApi.myPending(), workspaceInvitationApi.myPending()])
      return [
        ...(projects || []).map((item) => ({ ...item, kind: 'Project', target: item.project })),
        ...(workspaces || []).map((item) => ({ ...item, kind: 'Workspace', target: item.workspace })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },
  })
  const accept = useMutation({
    mutationFn: (invite) => invite.kind === 'Workspace' ? workspaceInvitationApi.acceptMine(invite._id) : invitationApi.acceptMine(invite._id),
    onSuccess: (result) => {
      toast.success(`Bạn đã tham gia ${result.workspace?.name || result.project?.name || 'không gian làm việc'}`)
      queryClient.invalidateQueries({ queryKey: ['my-invitations-inbox'] })
      queryClient.invalidateQueries({ queryKey: ['my-pending-invitations'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
    onError: (error) => toast.error(error.message),
  })
  const invitations = query.data || []

  return <div className="space-y-5">
    <PageHeader eyebrow="Your inbox" title="Lời mời" description="Các Workspace và Project đang chờ bạn tham gia." actions={<Button variant="outline" asChild><Link to="/projects">Mở Projects</Link></Button>} />
    {query.isLoading ? <div className="space-y-3">{[1, 2].map((item) => <Skeleton key={item} className="h-28" />)}</div>
      : invitations.length ? <div className="grid gap-3 lg:grid-cols-2">{invitations.map((invite) => <Card key={`${invite.kind}-${invite._id}`} className="p-5">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"><UsersRound className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{invite.target?.name || invite.kind}</p><Badge tone="amber">Đang chờ</Badge></div><p className="mt-1 text-xs text-slate-500">Bạn được mời vào {invite.kind} với vai trò <strong>{roleLabel(invite.role)}</strong>.</p></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800"><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{roleLabel(invite.role)}</span><span>Từ {invite.invitedBy?.fullName || invite.invitedBy?.email || 'Workspace owner'}</span><span>{formatDate(invite.createdAt)}</span></div>
        <div className="mt-4 flex justify-end"><Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate(invite)}><Check className="h-4 w-4" />Chấp nhận lời mời</Button></div>
      </Card>)}</div> : <EmptyState title="Không có lời mời đang chờ" description="Khi một Owner mời đúng email của bạn, lời mời sẽ xuất hiện tại đây và ở biểu tượng chuông." icon={Mail} />}
  </div>
}
