import { Link, useLocation } from 'react-router-dom'
import { Columns3, FlaskConical, Layers3, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'delivery', label: 'Delivery Cycles', description: 'Nhịp giao hàng của đội sản phẩm', icon: Layers3 },
  { id: 'test-cycles', label: 'Test Cycles', description: 'Đợt kiểm thử độc lập hoặc liên kết Delivery Cycle', icon: FlaskConical },
  { id: 'board', label: 'Test Board', description: 'Phân công, kéo thả và Test Run', icon: Columns3 },
  { id: 'issues', label: 'AI Test Planning', description: 'Gợi ý Test Case cho từng Test Cycle', icon: ListTodo },
]

export default function PlanningTabs({ project = '', current = 'delivery' }) {
  const location = useLocation()
  return <nav aria-label="Không gian Agile & Scrum" className="flex items-center gap-1 border-b border-slate-200 px-1 dark:border-slate-800">
    {tabs.map((tab) => {
      const Icon = tab.icon
      const active = current === tab.id
      const params = new URLSearchParams(location.search)
      params.set('tab', tab.id)
      if (project) params.set('project', project)
      if (tab.id === 'board') params.delete('tab')
      return <Link key={tab.id} title={tab.description} to={`${tab.id === 'board' ? '/board' : '/cycles'}?${params.toString()}`} className={cn('relative flex h-11 min-w-0 items-center gap-2 px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-600', active ? 'font-semibold text-violet-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-violet-600 dark:text-violet-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{tab.label}</span>
      </Link>
    })}
  </nav>
}
