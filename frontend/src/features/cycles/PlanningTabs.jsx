import { Link, useLocation } from 'react-router-dom'
import { Columns3, Layers3, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'cycles', label: 'Cycles', description: 'Mục tiêu, thời gian và capacity', icon: Layers3 },
  { id: 'board', label: 'Backlog & Board', description: 'Phân công, kéo thả và Test Run', icon: Columns3 },
  { id: 'issues', label: 'Kế hoạch tuần', description: 'Từ Test Plan đến Test Case trong Cycle', icon: ListTodo },
]

export default function PlanningTabs({ project = '', current = 'cycles' }) {
  const location = useLocation()
  return <nav aria-label="Không gian Agile & Scrum" className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
    {tabs.map((tab) => {
      const Icon = tab.icon
      const active = current === tab.id
      const params = new URLSearchParams(location.search)
      params.set('tab', tab.id)
      if (project) params.set('project', project)
      if (tab.id === 'board') params.delete('tab')
      return <Link key={tab.id} to={`${tab.id === 'board' ? '/board' : '/cycles'}?${params.toString()}`} className={cn('flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600', active ? 'bg-violet-600 text-white shadow-md shadow-violet-200 dark:shadow-none' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800')}>
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-white/15' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300')}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0"><span className="block text-sm font-semibold">{tab.label}</span><span className={cn('mt-0.5 block truncate text-[11px]', active ? 'text-violet-100' : 'text-slate-500 dark:text-slate-400')}>{tab.description}</span></span>
      </Link>
    })}
  </nav>
}
