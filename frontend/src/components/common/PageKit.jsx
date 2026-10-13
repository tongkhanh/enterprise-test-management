import { ArrowUpRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({ eyebrow, title, description, actions }) {
  return <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
    <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-600 dark:text-violet-400">{eyebrow}</p><h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
}

export function MetricCard({ label, value, hint, icon: Icon, tone = 'violet' }) {
  const tones = {
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
  }
  return <div className="panel p-4"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>{hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}</div>{Icon && <span className={cn('grid h-8 w-8 place-items-center rounded-lg', tones[tone])}><Icon className="h-4 w-4" /></span>}</div></div>
}

export function EmptyState({ title, description, action }) {
  return <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><Inbox className="h-5 w-5" /></span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>{action && <div className="mt-4">{action}</div>}</div></div>
}

export function Avatar({ user, className }) {
  const name = user?.fullName || user?.email || 'User'
  return <span title={name} className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-white bg-gradient-to-br from-violet-400 to-indigo-600 text-[9px] font-bold text-white dark:border-[#17181d]', className)}>{name.split(/\s+/).slice(-2).map((word) => word[0]).join('').toUpperCase()}</span>
}

export function SectionTitle({ title, description, action }) {
  return <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}</div>{action && <div>{action}</div>}</div>
}

export function TextLink({ children }) { return <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400">{children}<ArrowUpRight className="h-3 w-3" /></span> }
