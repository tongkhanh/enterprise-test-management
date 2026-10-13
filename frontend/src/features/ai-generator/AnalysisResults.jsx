import { useEffect, useMemo, useState } from 'react'
import { Braces, CheckCircle2, ExternalLink, FileInput, FormInput, Link2, MousePointerClick, Network, TerminalSquare } from 'lucide-react'
import { aiApi } from '@/api/client'
import { Badge, Card, Skeleton } from '@/components/ui'
import { cn, formatDate } from '@/lib/utils'

const tabs = [['forms', 'Forms', FormInput], ['inputs', 'Inputs', FileInput], ['buttons', 'Buttons', MousePointerClick], ['links', 'Links', Link2]]
function ProtectedScreenshot({ url, title }) {
  const [source, setSource] = useState(null); const [error, setError] = useState(false)
  useEffect(() => { let objectUrl; let mounted = true; if (!url) return; aiApi.artifact(url).then((blob) => { objectUrl = URL.createObjectURL(blob); if (mounted) setSource(objectUrl) }).catch(() => mounted && setError(true)); return () => { mounted = false; if (objectUrl) URL.revokeObjectURL(objectUrl) } }, [url])
  if (error) return <div className="grid min-h-64 place-items-center bg-slate-100 text-sm text-muted-foreground">Không tải được screenshot.</div>
  if (!source) return <Skeleton className="min-h-64 w-full rounded-none" />
  return <img src={source} alt={`Screenshot ${title || 'website'}`} className="max-h-[420px] w-full bg-slate-100 object-contain" />
}
const itemTitle = (type, item) => type === 'forms' ? `${item.method || 'GET'} ${item.action || '/'}` : item.label || item.name || item.text || item.placeholder || item.href || item.type || 'Unnamed element'
const itemDetail = (type, item) => type === 'links' ? item.href : item.selector || item.testId || item.role || item.type || `${item.inputs?.length || 0} fields`
export default function AnalysisResults({ result }) {
  const analysis = result?.webContext || result; const page = analysis?.page || {}; const [active, setActive] = useState('forms'); const items = page[active] || []
  const diagnostics = useMemo(() => Object.values(analysis?.diagnostics || {}).reduce((sum, list) => sum + (list?.length || 0), 0), [analysis])
  if (!analysis) return null
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['HTTP status', analysis.pageStatus || '—', CheckCircle2, 'text-emerald-600 bg-emerald-50'],
      ['Forms', page.counts?.forms ?? page.forms?.length ?? 0, FormInput, 'text-blue-600 bg-blue-50'],
      ['Inputs', page.counts?.inputs ?? page.inputs?.length ?? 0, FileInput, 'text-violet-600 bg-violet-50'],
      ['Diagnostics', diagnostics, Network, diagnostics ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-100'],
    ].map(([label, value, Icon, tone]) => <Card key={label} className="flex items-center gap-3 p-4"><span className={cn('grid h-10 w-10 place-items-center rounded-xl', tone)}><Icon className="h-5 w-5" /></span><div><b className="block text-xl">{value}</b><span className="text-xs text-muted-foreground">{label}</span></div></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b bg-slate-100 px-4 py-3"><i className="h-2.5 w-2.5 rounded-full bg-red-400" /><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><div className="ml-2 min-w-0 flex-1 truncate rounded-lg border bg-white px-3 py-1.5 text-xs text-muted-foreground">{analysis.finalUrl}</div><a href={analysis.finalUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-primary"><ExternalLink className="h-4 w-4" /></a></div><ProtectedScreenshot url={analysis.screenshotUrl} title={page.title} /></Card>
      <Card className="min-w-0 overflow-hidden"><div className="border-b p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Element inventory</p><h3 className="mt-1 truncate text-lg font-bold">{page.title || 'Analyzed website'}</h3><p className="mt-1 text-xs text-muted-foreground">{formatDate(analysis.analyzedAt)}</p></div><Badge tone="green">Analyzed</Badge></div></div><div className="flex overflow-x-auto border-b px-3">{tabs.map(([key, label, Icon]) => <button key={key} onClick={() => setActive(key)} className={cn('flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold', active === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}><Icon className="h-3.5 w-3.5" />{label}<span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">{page[key]?.length || 0}</span></button>)}</div><div className="scrollbar-thin max-h-[350px] overflow-auto p-3">{items.length ? <div className="space-y-2">{items.slice(0, 100).map((item, index) => <div key={`${active}-${index}`} className="rounded-xl border bg-slate-50/60 p-3"><b className="block truncate text-xs">{itemTitle(active, item)}</b><code className="mt-1 block truncate text-[10px] text-muted-foreground">{itemDetail(active, item)}</code></div>)}</div> : <div className="grid min-h-40 place-items-center text-center"><div><Braces className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs text-muted-foreground">Không phát hiện {active}.</p></div></div>}</div><div className="flex gap-4 border-t bg-slate-50 px-5 py-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><TerminalSquare className="h-3.5 w-3.5" /> Console {analysis.diagnostics?.consoleMessages?.length || 0}</span><span className="flex items-center gap-1"><Network className="h-3.5 w-3.5" /> HTTP {analysis.diagnostics?.httpErrors?.length || 0}</span></div></Card>
    </div>
  </div>
}
