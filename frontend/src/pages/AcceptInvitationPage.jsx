import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, FlaskConical, Loader2, Mail, ShieldCheck, UsersRound } from 'lucide-react'
import { invitationApi, workspaceInvitationApi } from '@/api/client'
import { Button, Card, Input } from '@/components/ui'
import { roleLabel } from '@/lib/utils'

export default function AcceptInvitationPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const type = params.get('type') || 'project' // 'workspace' hoặc 'project'
  const isWorkspace = type === 'workspace'
  const api = isWorkspace ? workspaceInvitationApi : invitationApi
  const [form, setForm] = useState({ fullName: '', password: '' })
  const query = useQuery({ queryKey: ['public-invitation', type, token], queryFn: () => api.get(token), enabled: Boolean(token), retry: false })
  const mutation = useMutation({ mutationFn: () => api.accept(token, form) })
  const invitation = query.data
  // Workspace invitation trả workspace, project invitation trả project
  const targetName = isWorkspace ? (invitation?.workspace?.name || mutation.data?.workspace?.name) : (invitation?.project?.name || mutation.data?.project?.name)

  return <main className="grid min-h-screen place-items-center bg-[#f6f6f8] p-4 dark:bg-[#101114]"><Card className="w-full max-w-lg overflow-hidden p-0"><div className="border-b bg-slate-950 p-6 text-white dark:border-slate-800"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><FlaskConical className="h-4 w-4" /></span><p className="mt-5 text-[10px] font-bold uppercase tracking-[.16em] text-violet-300">ETMS invitation</p><h1 className="mt-1 text-2xl font-bold">{isWorkspace ? 'Tham gia Workspace' : 'Tham gia Project'}</h1></div>
    <div className="p-6">{query.isLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div> : query.isError || !token ? <div className="py-8 text-center"><h2 className="font-semibold">Lời mời không hợp lệ</h2><p className="mt-2 text-xs text-slate-400">Liên kết có thể đã hết hạn hoặc không tồn tại.</p></div> : mutation.isSuccess ? <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h2 className="mt-4 text-lg font-bold">Bạn đã tham gia {targetName || (isWorkspace ? 'Workspace' : 'Project')}</h2><p className="mt-2 text-xs text-slate-500">Đăng nhập để bắt đầu làm việc cùng Team.</p><Button className="mt-5" asChild><Link to="/login">Đi tới đăng nhập</Link></Button></div> : invitation.status !== 'Pending' ? <div className="py-8 text-center"><h2 className="font-semibold">Lời mời đã {invitation.status}</h2><p className="mt-2 text-xs text-slate-400">Hãy liên hệ Owner nếu bạn cần một lời mời mới.</p></div> : <div><div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30"><p className="text-xs text-slate-500 dark:text-slate-400">Bạn được mời vào {isWorkspace ? 'Workspace' : 'Project'}</p><h2 className="mt-1 text-lg font-bold">{targetName}</h2><div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500"><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{roleLabel(invitation.role)}</span>{invitation.team && <span className="flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" />{invitation.team.name}</span>}<span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{invitation.email}</span></div></div><div className="mt-5 space-y-4"><label className="block"><span className="label">Họ và tên</span><Input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Chỉ cần nếu đây là tài khoản mới" /></label><label className="block"><span className="label">Mật khẩu</span><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Tối thiểu 8 ký tự cho tài khoản mới" /></label>{mutation.isError && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{mutation.error.message}</p>}<Button className="w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Chấp nhận lời mời</Button></div></div>}</div>
  </Card></main>
}
