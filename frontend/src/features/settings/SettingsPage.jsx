import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, CheckCircle2, Clipboard, Github, KeyRound, Layers3, Link2, Loader2,
  Moon, Plus, RefreshCw, Settings2, ShieldCheck, Sun, Trash2, Webhook,
} from 'lucide-react'
import { toast } from 'sonner'
import { workspaceApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { EmptyState, PageHeader, SectionTitle } from '@/components/common/PageKit'
import { Badge, Button, Card, Dialog, Input, Select } from '@/components/ui'
import { cn, formatDate } from '@/lib/utils'

const providers = {
  Jira: { icon: Layers3, color: 'bg-blue-600', hint: 'Đồng bộ Bug và trạng thái issue', baseUrl: 'https://your-domain.atlassian.net' },
  GitHub: { icon: Github, color: 'bg-slate-950 dark:bg-white dark:text-slate-950', hint: 'Liên kết Issue, Pull Request và commit', baseUrl: 'https://api.github.com' },
  Linear: { icon: Webhook, color: 'bg-violet-600', hint: 'Đồng bộ Project và Issue workflow', baseUrl: 'https://api.linear.app' },
}

const initialForm = { provider: 'Jira', displayName: '', project: '', baseUrl: '', externalProjectKey: '', accessToken: '', accountEmail: '' }
function Field({ label, required, children }) { return <label className="block"><span className="label">{label}{required && <span className="text-rose-500"> *</span>}</span>{children}</label> }

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user)
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId)
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [secretState, setSecretState] = useState(null)
  const [logsFor, setLogsFor] = useState(null)

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const workspacesQuery = useQuery({ queryKey: ['workspaces'], queryFn: workspaceApi.workspaces })
  const activeWorkspace = (workspacesQuery.data || []).find((workspace) => workspace._id === selectedWorkspaceId) || workspacesQuery.data?.[0]
  const workspaceMembershipsQuery = useQuery({ queryKey: ['workspace-memberships', activeWorkspace?._id], queryFn: () => workspaceApi.workspaceMemberships(activeWorkspace._id), enabled: Boolean(activeWorkspace?._id) })
  const currentMembership = (workspaceMembershipsQuery.data || []).find((membership) => String(membership.user?._id || membership.user) === String(user?._id))
  const canManage = user?.role?.permissions?.includes('integration:manage') || String(activeWorkspace?.owner?._id || activeWorkspace?.owner) === String(user?._id) || ['Owner', 'QA_Manager'].includes(currentMembership?.role)
  const integrationsQuery = useQuery({ queryKey: ['integrations'], queryFn: () => workspaceApi.integrations() })
  const logsQuery = useQuery({ queryKey: ['integration-logs', logsFor?._id], queryFn: () => workspaceApi.integrationLogs(logsFor._id), enabled: Boolean(logsFor?._id) })

  const createMutation = useMutation({
    mutationFn: workspaceApi.createIntegration,
    onSuccess: (result) => {
      toast.success('Đã lưu cấu hình tích hợp')
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setOpen(false)
      setForm(initialForm)
      setSecretState({ provider: result.integration.provider, id: result.integration._id, value: result.webhookSecret })
    },
    onError: (error) => toast.error(error.message),
  })
  const testMutation = useMutation({
    mutationFn: workspaceApi.testIntegration,
    onSuccess: (result) => {
      toast.success(`Kết nối thành công với tài khoản ${result.result.identity || result.result.provider}`)
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      queryClient.invalidateQueries({ queryKey: ['integration-logs'] })
    },
    onError: (error) => { toast.error(error.message); queryClient.invalidateQueries({ queryKey: ['integrations'] }); queryClient.invalidateQueries({ queryKey: ['integration-logs'] }) },
  })
  const rotateMutation = useMutation({
    mutationFn: workspaceApi.rotateIntegrationWebhook,
    onSuccess: (result) => { setSecretState({ provider: result.integration.provider, id: result.integration._id, value: result.webhookSecret }); toast.success('Đã tạo webhook secret mới'); queryClient.invalidateQueries({ queryKey: ['integrations'] }) },
    onError: (error) => toast.error(error.message),
  })
  const deleteMutation = useMutation({
    mutationFn: workspaceApi.deleteIntegration,
    onSuccess: () => { toast.success('Đã xóa cấu hình tích hợp'); queryClient.invalidateQueries({ queryKey: ['integrations'] }) },
    onError: (error) => toast.error(error.message),
  })

  const startIntegration = (provider = 'Jira') => {
    setForm({ ...initialForm, provider, displayName: `${provider} connection`, project: projectsQuery.data?.[0]?._id || '', baseUrl: providers[provider].baseUrl })
    setOpen(true)
  }
  const changeProvider = (provider) => setForm({ ...form, provider, displayName: `${provider} connection`, baseUrl: providers[provider].baseUrl })
  const submit = (event) => {
    event.preventDefault()
    if (!form.project || !form.displayName.trim() || !form.accessToken) { toast.error('Project, tên kết nối và Access Token là bắt buộc'); return }
    createMutation.mutate({
      provider: form.provider,
      displayName: form.displayName,
      project: form.project,
      baseUrl: form.baseUrl,
      externalProjectKey: form.externalProjectKey,
      accessToken: form.accessToken,
      settings: form.provider === 'Jira' ? { accountEmail: form.accountEmail } : {},
    })
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Workspace settings" title="Settings" description="Quản lý giao diện, bảo mật và các kết nối ngoài của ETMS." />
    <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
      <nav className="space-y-1"><a href="#appearance" className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"><Sun className="h-4 w-4" />Giao diện</a><a href="#integrations" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-white dark:hover:bg-slate-800"><Link2 className="h-4 w-4" />Integrations</a><a href="#security" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-white dark:hover:bg-slate-800"><ShieldCheck className="h-4 w-4" />Bảo mật</a></nav>
      <div className="space-y-5">
        <Card id="appearance" className="p-5"><SectionTitle title="Giao diện" description="Theme được lưu riêng trên thiết bị này." /><div className="mt-4 grid gap-3 sm:grid-cols-2">{[{ value: 'light', label: 'Light mode', icon: Sun }, { value: 'dark', label: 'Dark mode', icon: Moon }].map(({ value, label, icon: Icon }) => <button key={value} onClick={() => setTheme(value)} className={cn('flex items-center gap-3 rounded-lg border p-4 text-left transition', theme === value ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-950' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')}><span className="grid h-9 w-9 place-items-center rounded-lg bg-white shadow-sm dark:bg-slate-900"><Icon className="h-4 w-4" /></span><div><p className="text-xs font-semibold">{label}</p><p className="mt-0.5 text-[10px] text-slate-400">{value === 'light' ? 'Sáng, rõ ràng và tối giản' : 'Giảm mỏi mắt khi làm việc ban đêm'}</p></div>{theme === value && <CheckCircle2 className="ml-auto h-4 w-4 text-violet-500" />}</button>)}</div></Card>

        <Card id="integrations" className="p-5"><SectionTitle title="Ứng dụng tích hợp" description="Adapter thật cho Jira, GitHub và Linear; credential được mã hóa ở backend." action={canManage && <Button size="sm" onClick={() => startIntegration()}><Plus className="h-3.5 w-3.5" />Thêm kết nối</Button>} />
          <div className="mt-4">{integrationsQuery.data?.length ? <div className="space-y-2">{integrationsQuery.data.map((integration) => {
            const ProviderIcon = providers[integration.provider]?.icon || Link2
            const testing = testMutation.isPending && testMutation.variables === integration._id
            return <div key={integration._id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center"><span className={cn('grid h-9 w-9 place-items-center rounded-lg text-white', providers[integration.provider]?.color)}><ProviderIcon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold">{integration.displayName}</p><Badge tone={integration.status === 'Connected' ? 'green' : integration.status === 'Error' ? 'red' : 'amber'}>{integration.status}</Badge>{integration.hasCredentials && <Badge tone="slate"><KeyRound className="mr-1 h-3 w-3" />Credential saved</Badge>}</div><p className="mt-1 truncate text-[10px] text-slate-400">{integration.project?.key} · {integration.baseUrl || 'Chưa có Base URL'} · kiểm tra {formatDate(integration.lastTestedAt)}</p>{integration.lastError && <p className="mt-1 truncate text-[10px] text-rose-500">{integration.lastError}</p>}</div>{canManage && <div className="flex items-center gap-1"><Button variant="outline" size="sm" disabled={testing} onClick={() => testMutation.mutate(integration._id)}>{testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Kiểm tra</Button><Button variant="ghost" size="sm" onClick={() => setLogsFor(integration)}><Activity className="h-3.5 w-3.5" />Logs</Button><Button variant="ghost" size="sm" aria-label="Xóa tích hợp" onClick={() => deleteMutation.mutate(integration._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button></div>}</div>
          })}</div> : <EmptyState title="Chưa có ứng dụng tích hợp" description="Thêm kết nối để ETMS đồng bộ Bug và công việc với hệ thống bên ngoài." action={canManage && <div className="flex flex-wrap justify-center gap-2">{Object.keys(providers).map((provider) => <Button key={provider} size="sm" variant="outline" onClick={() => startIntegration(provider)}>{provider}</Button>)}</div>} />}</div>
        </Card>

        <Card id="security" className="p-5"><SectionTitle title="Bảo mật Workspace" description="Phiên đăng nhập và phân quyền được kiểm soát tại backend." /><div className="mt-4 grid gap-3 sm:grid-cols-3">{[{ icon: ShieldCheck, title: 'RBAC', hint: 'Tester và QA tách quyền' }, { icon: KeyRound, title: 'Encrypted secrets', hint: 'AES-256-GCM' }, { icon: Settings2, title: 'Audit trail', hint: 'Ghi nhận hành động quan trọng' }].map(({ icon: Icon, title, hint }) => <div key={title} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><Icon className="h-4 w-4 text-emerald-500" /><p className="mt-2 text-xs font-semibold">{title}</p><p className="mt-0.5 text-[10px] text-slate-400">{hint}</p></div>)}</div></Card>
      </div>
    </div>

    <Dialog open={open} onOpenChange={setOpen} title="Thêm ứng dụng tích hợp" description="Access Token chỉ được gửi một chiều và mã hóa trước khi lưu."><form className="space-y-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Field label="Provider" required><Select value={form.provider} onChange={(event) => changeProvider(event.target.value)}>{Object.keys(providers).map((provider) => <option key={provider}>{provider}</option>)}</Select></Field><Field label="Project" required><Select value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })}><option value="">Chọn Project</option>{projectsQuery.data?.map((project) => <option key={project._id} value={project._id}>{project.key} · {project.name}</option>)}</Select></Field></div><Field label="Tên kết nối" required><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Base URL" required><Input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://…" /></Field><Field label="Project/Repository Key"><Input value={form.externalProjectKey} onChange={(event) => setForm({ ...form, externalProjectKey: event.target.value })} placeholder="QA / org/repo" /></Field></div>{form.provider === 'Jira' && <Field label="Jira account email" required><Input type="email" value={form.accountEmail} onChange={(event) => setForm({ ...form, accountEmail: event.target.value })} placeholder="admin@company.com" /></Field>}<Field label="Access Token" required><Input type="password" value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} placeholder="Được mã hóa trước khi lưu" /></Field><div className="flex justify-end gap-2 border-t pt-4 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button disabled={createMutation.isPending}>{createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu cấu hình</Button></div></form></Dialog>

    <Dialog open={Boolean(secretState)} onOpenChange={(value) => !value && setSecretState(null)} title="Webhook secret" description="Secret chỉ hiển thị một lần. Hãy lưu vào hệ thống gửi webhook."><div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"><div><p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Webhook URL</p><Input readOnly value={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'}/webhooks/${secretState?.provider?.toLowerCase()}/${secretState?.id || ''}`} className="mt-2 font-mono text-[11px]" /></div><div><p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{secretState?.provider} webhook secret</p><div className="mt-2 flex gap-2"><Input readOnly value={secretState?.value || ''} className="font-mono text-[11px]" /><Button variant="outline" onClick={() => { navigator.clipboard.writeText(secretState?.value || ''); toast.success('Đã sao chép webhook secret') }}><Clipboard className="h-4 w-4" /></Button></div></div></div><div className="mt-4 flex justify-end"><Button onClick={() => setSecretState(null)}>Tôi đã lưu secret</Button></div></Dialog>

    <Dialog open={Boolean(logsFor)} onOpenChange={(value) => !value && setLogsFor(null)} title={`Integration logs · ${logsFor?.displayName || ''}`} description="Lịch sử kiểm tra và đồng bộ, không chứa credential."><div className="space-y-2">{logsQuery.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : logsQuery.data?.length ? logsQuery.data.map((log) => <div key={log._id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div><div className="flex items-center gap-2"><p className="text-xs font-semibold">{log.action}</p><Badge tone={log.status === 'Success' ? 'green' : log.status === 'Failed' ? 'red' : 'amber'}>{log.status}</Badge></div><p className="mt-1 text-[10px] text-slate-400">{log.message || log.error || 'Không có thông tin bổ sung'} · {log.durationMs} ms</p></div><span className="text-[10px] text-slate-400">{formatDate(log.createdAt)}</span></div>) : <p className="py-8 text-center text-xs text-slate-400">Chưa có log.</p>}<div className="mt-4 flex justify-between border-t pt-4 dark:border-slate-800"><Button variant="outline" disabled={rotateMutation.isPending} onClick={() => rotateMutation.mutate(logsFor._id)}><KeyRound className="h-4 w-4" />Đổi webhook secret</Button><Button onClick={() => setLogsFor(null)}>Đóng</Button></div></div></Dialog>
  </div>
}
