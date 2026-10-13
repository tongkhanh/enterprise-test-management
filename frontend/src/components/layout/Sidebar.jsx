import { NavLink } from 'react-router-dom'
import {
  Bug, CheckSquare2, ChevronLeft, FlaskConical, FolderKanban, Gauge,
  Building2, Columns3, Repeat2, Settings, Sparkles, Trophy, UsersRound, X, TerminalSquare, ListTodo, Mail, FileBarChart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const groups = [
  {
    label: 'Workspace',
    items: [
      { label: 'Tổng quan', to: '/dashboard', icon: Gauge },
      { label: 'Projects', to: '/projects', icon: FolderKanban },
      { label: 'Quản lý Workspace', to: '/workspace-management', icon: Building2 },
      { label: 'Lời mời', to: '/invitations', icon: Mail },
      { label: 'Teams & Members', to: '/teams', icon: UsersRound },
      { label: 'Cycles & Planning', to: '/cycles', icon: Repeat2 },
      { label: 'Agile Issues', to: '/issues', icon: ListTodo },
    ],
  },
  {
    label: 'E2E workflow',
    items: [
      { label: 'E2E Workflow', to: '/ai-generator', icon: Sparkles },
    ],
  },
  {
    label: 'Công cụ nâng cao',
    items: [
      { label: 'Approval Inbox', to: '/approvals', icon: CheckSquare2 },
      { label: 'Test Board', to: '/board', icon: Columns3 },
      { label: 'Automation Lab', to: '/automation', icon: TerminalSquare },
      { label: 'Automation Operations', to: '/automation-operations', icon: Repeat2 },
      { label: 'Bug Tracking', to: '/bugs', icon: Bug },
      { label: 'Test Reports', to: '/reports', icon: FileBarChart },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Gamification', to: '/gamification', icon: Trophy },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ open, onClose, collapsed, onCollapse }) {
  const user = useAuthStore((state) => state.user)
  const roleName = user?.role?.name || user?.role
  // System Admin chỉ quản trị hệ thống, không tham gia nghiệp vụ
  const isSystemAdmin = roleName === 'System_Admin'
  return <>
    {open && <button aria-label="Đóng menu" className="fixed inset-0 z-30 bg-slate-950/45 lg:hidden" onClick={onClose} />}
    <aside className={cn(
      'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-[#f8f8fa] text-slate-950 transition-all duration-200 dark:border-slate-800 dark:bg-[#141519] dark:text-slate-100 lg:translate-x-0',
      open ? 'translate-x-0' : '-translate-x-full', collapsed ? 'w-[68px]' : 'w-[236px]',
    )}>
      <div className="flex h-14 items-center gap-2.5 px-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"><FlaskConical className="h-4 w-4" /></div>
        {!collapsed && <div className="min-w-0"><div className="truncate text-sm font-bold tracking-tight">ETMS Quality</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Enterprise workspace</div></div>}
        <button className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 lg:hidden" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-2 py-3">
        {isSystemAdmin
          ? <div className="px-2 py-8 text-center text-xs text-slate-400">System Admin chỉ quản trị hệ thống.<br/>Sử dụng API admin panel.</div>
          : groups.map((group) => {
          const items = group.items
          if (!items.length) return null
          return <div key={group.label}>
            {!collapsed && <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400 dark:text-slate-500">{group.label}</p>}
            <div className="space-y-0.5">
              {items.map(({ label, to, icon: Icon }) => <NavLink
                key={to}
                to={to}
                end
                onClick={onClose}
                title={collapsed ? label : undefined}
                className={({ isActive }) => cn(
                  'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
                  isActive && 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700',
                  collapsed && 'justify-center px-0',
                )}
              ><Icon className="h-4 w-4 shrink-0" />{!collapsed && <span className="truncate">{label}</span>}</NavLink>)}
            </div>
          </div>
        })}
      </nav>

      {!collapsed && <div className="mx-2 mb-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-[#191a20]">
        <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-md bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{(user?.fullName || 'U').slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{user?.fullName}</p><p className="truncate text-[10px] text-slate-400">{roleName}</p></div></div>
      </div>}
      <div className="border-t border-slate-200 p-2 dark:border-slate-800"><button className={cn('hidden h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 lg:flex', collapsed && 'justify-center')} onClick={onCollapse}><ChevronLeft className={cn('h-4 w-4 transition', collapsed && 'rotate-180')} />{!collapsed && 'Thu gọn sidebar'}</button></div>
    </aside>
  </>
}
