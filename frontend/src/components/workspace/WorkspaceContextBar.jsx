import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, FolderKanban, UsersRound } from 'lucide-react'
import { workspaceApi } from '@/api/client'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Badge, Select } from '@/components/ui'
import { cn, roleLabel } from '@/lib/utils'

const destinations = [
  ['/workspace-management', 'Workspace', Building2],
  ['/projects', 'Projects', FolderKanban],
  ['/teams', 'Teams', UsersRound],
]

export default function WorkspaceContextBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId)
  const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)
  const workspacesQuery = useQuery({ queryKey: ['workspaces'], queryFn: workspaceApi.workspaces })
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: workspaceApi.projects })
  const workspaces = workspacesQuery.data || []
  const workspace = workspaces.find((item) => item._id === selectedWorkspaceId) || workspaces[0]
  const projectCount = (projectsQuery.data || []).filter((project) => String(project.workspace?._id || project.workspace) === String(workspace?._id)).length

  if (!workspace) return null
  return <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#17181d]">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"><Building2 className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Current workspace</p><Select className="mt-0.5 h-7 max-w-[280px] border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus:ring-0" value={workspace._id} onChange={(event) => { setSelectedWorkspaceId(event.target.value); navigate('/projects') }}>{workspaces.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></div><Badge tone="purple">{roleLabel(workspace.currentRole)}</Badge></div>
      <div className="flex flex-wrap items-center gap-1.5">{destinations.map(([to, label, Icon]) => <Link key={to} to={to} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition', location.pathname === to ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}><Icon className="h-3.5 w-3.5" />{label}</Link>)}<span className="ml-1 hidden border-l pl-3 text-xs text-slate-400 sm:inline">{projectCount} Project</span></div>
    </div>
  </section>
}
