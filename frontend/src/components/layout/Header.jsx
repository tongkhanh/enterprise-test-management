import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronDown, LogOut, Mail, Menu, Moon, Search, ShieldCheck, Sun, UsersRound } from 'lucide-react'
import { authApi, invitationApi, workspaceApi, workspaceInvitationApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { roleLabel, formatDate } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspaceStore'

const routes = [
  ['/dashboard', 'Tổng quan'], ['/projects', 'Projects'], ['/teams', 'Teams & Members'], ['/cycles', 'Cycles & Planning'],
  ['/ai-generator', 'AI Test Generator'], ['/approvals', 'Approval Inbox'], ['/board', 'Test Board'],
  ['/bugs', 'Bug Tracking'], ['/gamification', 'Gamification'], ['/settings', 'Settings'],
]

export default function Header({ onMenu }) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const [open, setOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId)
  const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)
  const bellRef = useRef(null)
  const userRef = useRef(null)
  const title = routes.find(([path]) => location.pathname.startsWith(path))?.[1] || 'ETMS'
  const workspacesQuery = useQuery({ queryKey: ['workspaces', user?._id], queryFn: workspaceApi.workspaces, enabled: Boolean(user) })
  const workspaces = workspacesQuery.data || []
  const activeWorkspace = workspaces.find((item) => item._id === selectedWorkspaceId) || workspaces[0]
  useEffect(() => { if (activeWorkspace && activeWorkspace._id !== selectedWorkspaceId) setSelectedWorkspaceId(activeWorkspace._id) }, [activeWorkspace, selectedWorkspaceId, setSelectedWorkspaceId])
  const initials = (user?.fullName || 'QA').split(/\s+/).slice(-2).map((word) => word[0]).join('').toUpperCase()
  const logout = async () => { try { await authApi.logout() } catch { /* session may already be expired */ } clearSession(); location.assign('/studio/login') }

  const invitationsQuery = useQuery({
    queryKey: ['my-pending-invitations'],
    queryFn: async () => {
      const [projects, workspaces] = await Promise.all([invitationApi.myPending(), workspaceInvitationApi.myPending()])
      return [...(projects || []).map((item) => ({ ...item, kind: 'Project', target: item.project })), ...(workspaces || []).map((item) => ({ ...item, kind: 'Workspace', target: item.workspace }))]
    },
    refetchInterval: 30_000,
  })
  const pendingInvitations = invitationsQuery.data || []
  const pendingCount = pendingInvitations.length

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#101114]/90 sm:px-5">
    <button aria-label="Mở menu" className="rounded-md border p-2 text-slate-600 dark:border-slate-700 dark:text-slate-300 lg:hidden" onClick={onMenu}><Menu className="h-4 w-4" /></button>
    <div className="flex min-w-0 items-center gap-2"><div className="min-w-0"><p className="truncate text-[11px] text-slate-400">ETMS / Workspace</p><h1 className="truncate text-sm font-semibold">{title}</h1></div>{workspaces.length > 0 && <><span className="text-slate-300">/</span><select aria-label="Chọn Workspace" className="max-w-[190px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900" value={activeWorkspace?._id || ''} onChange={(event) => { setSelectedWorkspaceId(event.target.value); navigate('/projects') }}>{workspaces.map((workspace) => <option key={workspace._id} value={workspace._id}>{workspace.name}</option>)}</select></>}</div>
    <div className="relative ml-auto hidden w-full max-w-sm md:block"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-14 text-xs outline-none focus:border-violet-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" placeholder="Tìm kiếm trong workspace…" /><kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-white px-1.5 py-0.5 text-[9px] text-slate-400 dark:border-slate-700 dark:bg-slate-800">⌘ K</kbd></div>
    <button aria-label="Đổi giao diện" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>

    {/* Notification Bell with Invitations Dropdown */}
    <div ref={bellRef} className="relative">
      <button aria-label="Thông báo" className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => setBellOpen(!bellOpen)}>
        <Bell className="h-4 w-4" />
        {pendingCount > 0 && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[9px] font-bold text-white">{pendingCount > 9 ? '9+' : pendingCount}</span>}
      </button>
      {bellOpen && <div className="absolute right-0 top-11 w-80 rounded-xl border bg-white shadow-2xl dark:border-slate-700 dark:bg-[#1b1c21]">
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-700">
          <h3 className="text-xs font-bold">Lời mời đang chờ</h3>
          {pendingCount > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{pendingCount}</span>}
        </div>
        <div className="max-h-72 overflow-auto">
          {pendingCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Mail className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-400">Không có lời mời nào đang chờ.</p>
            </div>
          ) : pendingInvitations.map((inv) => (
            <Link
              key={inv._id}
              to="/invitations"
              onClick={() => setBellOpen(false)}
              className="flex gap-3 border-b border-slate-50 px-4 py-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                <UsersRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{inv.target?.name || inv.kind}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="flex items-center gap-0.5"><ShieldCheck className="h-3 w-3" />{roleLabel(inv.role)}</span>
                  <span>· {inv.kind}</span>
                  {inv.team && <span>· Team {inv.team.name}</span>}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Từ {inv.invitedBy?.fullName || inv.invitedBy?.email} · {formatDate(inv.createdAt)}</p>
              </div>
              <span className="mt-1 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">Pending</span>
            </Link>
          ))}
        </div>
      </div>}
    </div>

    {/* User Menu */}
    <div ref={userRef} className="relative"><button className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setOpen(!open)}><span className="grid h-7 w-7 place-items-center rounded-md bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{initials}</span><ChevronDown className="h-3.5 w-3.5 text-slate-400" /></button>{open && <div className="absolute right-0 top-10 w-56 rounded-lg border bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#1b1c21]"><div className="border-b px-2 py-2 dark:border-slate-700"><p className="truncate text-xs font-semibold">{user?.fullName}</p><p className="mt-0.5 text-[10px] text-slate-400">{roleLabel(activeWorkspace?.currentRole || user?.currentWorkspaceRole || user?.role?.name || user?.role)}</p></div><button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"><LogOut className="h-3.5 w-3.5" /> Đăng xuất</button></div>}</div>
  </header>
}
