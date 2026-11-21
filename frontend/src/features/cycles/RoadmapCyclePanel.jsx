import { useState } from 'react'
import { CalendarDays, ChevronDown, Clock3, ListChecks, Pencil, X } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'

const cycleTypes = ['Smoke', 'Functional', 'Regression', 'ReleaseValidation', 'Exploratory', 'Custom']

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export default function RoadmapCyclePanel({ group, groupIndex, items, onChange, defaultOpen = false }) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(defaultOpen)
  const capacityPercent = group.capacityMinutes > 0 ? Math.min(100, Math.round((group.estimatedMinutes / group.capacityMinutes) * 100)) : 0

  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="roadmap-cycle group border-b border-slate-700/70 last:border-b-0">
    <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 transition hover:bg-slate-800/55">
      <span className="text-xs font-semibold tabular-nums text-violet-300">{String(groupIndex + 1).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-base text-slate-100">{group.name}</strong><span className="text-xs text-slate-400">{group.cycleType}</span>{!group.assignments.length && <span className="text-xs text-amber-300">Chưa có Test Case</span>}</div><p className="mt-1 text-sm text-slate-400">{formatDate(group.startDate)} – {formatDate(group.endDate)}</p></div>
      <div className="hidden min-w-40 sm:block"><div className="flex justify-between text-xs"><span className="text-slate-400">Capacity</span><strong className="text-slate-200">{group.estimatedMinutes}/{group.capacityMinutes} phút</strong></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-700"><span className="block h-full rounded-full bg-violet-400" style={{ width: `${capacityPercent}%` }} /></div></div>
      <span className="min-w-20 text-right text-sm font-semibold text-slate-200">{group.assignments.length}{group.maxCases > 0 ? `/${group.maxCases}` : ''} case</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
    </summary>

    <div className="border-t border-slate-700/70 px-5 pb-5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mục tiêu kiểm thử</p><p className="mt-1 text-sm leading-6 text-slate-200">{group.goal || 'Chưa khai báo mục tiêu cho Cycle này.'}</p></div>
        <Button type="button" size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => setEditing((value) => !value)}>{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}{editing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa Cycle'}</Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-y border-slate-700/60 py-3 text-sm text-slate-300">
        <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-violet-300" />{formatDate(group.startDate)} – {formatDate(group.endDate)}</span>
        <span className="inline-flex items-center gap-2"><ListChecks className="h-4 w-4 text-sky-300" />{group.assignments.length} Test Case</span>
        <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald-300" />{group.estimatedMinutes} phút · {capacityPercent}% capacity</span>
      </div>

      {editing && <div className="mt-4 rounded-xl bg-slate-800/65 p-4"><div className="grid gap-3 lg:grid-cols-4"><label className="lg:col-span-2"><span className="mb-1.5 block text-sm font-medium text-slate-300">Tên Cycle</span><Input value={group.name} onChange={(event) => onChange({ name: event.target.value })} /></label><label><span className="mb-1.5 block text-sm font-medium text-slate-300">Loại Cycle</span><Select value={group.cycleType} onChange={(event) => onChange({ cycleType: event.target.value })}>{cycleTypes.map((type) => <option key={type}>{type}</option>)}</Select></label><div><span className="mb-1.5 block text-sm font-medium text-slate-300">Thời gian</span><div className="grid grid-cols-2 gap-2"><Input aria-label={`Ngày bắt đầu Cycle ${groupIndex + 1}`} type="date" value={group.startDate} onChange={(event) => onChange({ startDate: event.target.value })} /><Input aria-label={`Ngày kết thúc Cycle ${groupIndex + 1}`} type="date" value={group.endDate} onChange={(event) => onChange({ endDate: event.target.value })} /></div></div></div><label className="mt-3 block"><span className="mb-1.5 block text-sm font-medium text-slate-300">Mục tiêu</span><Input value={group.goal} onChange={(event) => onChange({ goal: event.target.value })} /></label></div>}

      <div className="mt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-200">Test Case trong Cycle</h3><span className="text-xs text-slate-500">Sắp xếp theo ưu tiên đề xuất</span></div>{group.assignments.length ? <div className="mt-2 divide-y divide-slate-700/60">{group.assignments.map((assignment, index) => { const item = items.find((row) => row._id === assignment.boardItemId); return <div key={assignment.boardItemId} className="grid gap-1 py-3 sm:grid-cols-[2rem_minmax(0,1fr)]"><span className="text-xs tabular-nums text-slate-600">{String(index + 1).padStart(2, '0')}</span><div><p className="text-sm font-medium text-slate-200">{item?.testCase?.testCaseId} · {item?.testCase?.title}</p><p className="mt-1 text-sm leading-5 text-slate-500">{assignment.reason}</p></div></div> })}</div> : <p className="mt-3 text-sm text-slate-500">Chưa có Test Case nào được xếp vào Cycle này.</p>}</div>
    </div>
  </details>
}
