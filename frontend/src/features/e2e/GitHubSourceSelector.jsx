import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, Search, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'

const MAX_SELECTION = 40

// Suggestions are based on file names only, not file contents or AI analysis.
function filePriority(path) {
  if (/(^|\/)(readme|requirements?|specs?|openapi|swagger)([./_-]|$)/i.test(path)) return 0
  if (/(^|\/)(docs?|routes?|controllers?|api)(\/|[._-])/i.test(path)) return 1
  if (/(^|\/)package\.json$/i.test(path)) return 2
  return 3
}

function makeTree(items) {
  const root = { name: '', path: '', folders: new Map(), files: [] }
  items.forEach((file) => {
    const parts = file.path.split('/').filter(Boolean)
    const filename = parts.pop()
    let node = root
    parts.forEach((part) => {
      const nextPath = node.path ? `${node.path}/${part}` : part
      if (!node.folders.has(part)) node.folders.set(part, { name: part, path: nextPath, folders: new Map(), files: [] })
      node = node.folders.get(part)
    })
    if (filename) node.files.push(file)
  })
  const sortNode = (node) => {
    node.files.sort((a, b) => filePriority(a.path) - filePriority(b.path) || a.path.localeCompare(b.path))
    node.folders.forEach(sortNode)
    return node
  }
  return sortNode(root)
}

function filterTree(node, term) {
  if (!term) return node
  const files = node.files.filter((file) => file.path.toLowerCase().includes(term))
  const folders = new Map()
  node.folders.forEach((folder, name) => {
    const match = filterTree(folder, term)
    if (match) folders.set(name, match)
  })
  return files.length || folders.size ? { ...node, folders, files } : null
}

function countFiles(node) {
  return node.files.length + [...node.folders.values()].reduce((total, folder) => total + countFiles(folder), 0)
}

function filePaths(node) {
  return [...node.files.map((file) => file.path), ...[...node.folders.values()].flatMap(filePaths)]
}

function SelectionCheckbox({ indeterminate = false, ...props }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return <input ref={ref} type="checkbox" {...props} />
}

function TreeBranch({ node, depth, expandedFolders, setExpandedFolders, searching, selected, selectedPaths, toggle, toggleFolder, blocked }) {
  return <>
    {[...node.folders.values()].map((folder) => {
      const open = searching || expandedFolders.has(folder.path)
      const fileCount = countFiles(folder)
      const paths = filePaths(folder)
      const selectedCount = paths.filter((path) => selected.has(path)).length
      const allSelected = selectedCount === paths.length
      const canComplete = paths.length - selectedCount <= MAX_SELECTION - selectedPaths.length
      return <div key={folder.path}>
        <div className="flex min-w-0 items-center" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
          <SelectionCheckbox aria-label={`Chọn tất cả tệp trong thư mục ${folder.path}`} className="ml-1 mr-2 accent-violet-700" checked={allSelected} indeterminate={selectedCount > 0 && !allSelected} disabled={blocked || (!allSelected && !canComplete)} title={!allSelected && !canComplete ? `Không thể chọn đủ ${fileCount} tệp vì giới hạn ${MAX_SELECTION} tệp.` : `Chọn toàn bộ ${fileCount} tệp trong thư mục`} onChange={() => toggleFolder(paths, folder.path)} />
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:hover:bg-slate-800" aria-expanded={open} onClick={() => setExpandedFolders((current) => { const next = new Set(current); if (next.has(folder.path)) next.delete(folder.path); else next.add(folder.path); return next })}>
            {open ? <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />}
            {open ? <FolderOpen aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-500" /> : <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-500" />}
            <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{folder.name}</span>
            <span className="shrink-0 text-xs text-slate-500">{fileCount} tệp</span>
          </button>
        </div>
        {open && <TreeBranch node={folder} depth={depth + 1} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} searching={searching} selected={selected} selectedPaths={selectedPaths} toggle={toggle} toggleFolder={toggleFolder} blocked={blocked} />}
      </div>
    })}
    {node.files.map((file) => <label key={file.path} className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${selected.has(file.path) ? 'border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/40' : 'border-slate-200 hover:border-violet-300 dark:border-slate-700 dark:hover:border-violet-500'}`} style={{ marginLeft: `${depth * 16 + 8}px` }}>
      <input type="checkbox" className="mt-1 accent-violet-700" checked={selected.has(file.path)} disabled={blocked || (!selected.has(file.path) && selectedPaths.length >= MAX_SELECTION)} onChange={() => toggle(file.path)} />
      <FileCode2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
      <span className="min-w-0 break-all text-slate-900 dark:text-slate-100">{file.path.split('/').pop()}<span className="ml-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">{Math.ceil((file.size || 0) / 1024)} KB</span></span>
    </label>)}
  </>
}

export default function GitHubSourceSelector({ query, ready, selectedPaths, onChange }) {
  const [search, setSearch] = useState('')
  const [expandedFolders, setExpandedFolders] = useState(() => new Set())
  const [bulkMessage, setBulkMessage] = useState('')
  const items = useMemo(() => Array.isArray(query.data?.items) ? query.data.items : [], [query.data])
  const ordered = useMemo(() => [...items].sort((a, b) => filePriority(a.path) - filePriority(b.path) || a.path.localeCompare(b.path)), [items])
  const searchTerm = search.trim().toLowerCase()
  const tree = useMemo(() => filterTree(makeTree(ordered), searchTerm), [ordered, searchTerm])
  const selected = new Set(selectedPaths)
  const truncated = Boolean(query.data?.truncated)
  const invalidResponse = query.isSuccess && !Array.isArray(query.data?.items)
  const toggle = (path) => onChange(selected.has(path) ? selectedPaths.filter((item) => item !== path) : [...selectedPaths, path])
  const suggest = () => onChange([...new Set([...selectedPaths, ...ordered.filter((item) => filePriority(item.path) < 3).slice(0, 10).map((item) => item.path)])].slice(0, MAX_SELECTION))
  const toggleFolder = (paths, label) => {
    const selectedInFolder = paths.filter((path) => selected.has(path))
    if (selectedInFolder.length === paths.length) {
      onChange(selectedPaths.filter((path) => !paths.includes(path)))
      setBulkMessage(`Đã bỏ chọn ${paths.length} tệp trong ${label}.`)
      return
    }
    const missing = paths.filter((path) => !selected.has(path))
    if (missing.length > MAX_SELECTION - selectedPaths.length) {
      setBulkMessage(`Không thể chọn ${label}: cần thêm ${missing.length} tệp nhưng chỉ còn ${MAX_SELECTION - selectedPaths.length} chỗ.`)
      return
    }
    onChange([...selectedPaths, ...missing])
    setBulkMessage(`Đã chọn ${paths.length} tệp trong ${label}.`)
  }
  const selectAll = () => toggleFolder(ordered.map((file) => file.path), 'repository')
  const matchedCount = tree ? countFiles(tree) : 0
  const canSelectAll = ordered.filter((file) => !selected.has(file.path)).length <= MAX_SELECTION - selectedPaths.length

  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60" aria-label="Chọn tệp phân tích">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">4. Chọn tệp để phân tích</h3><p className="mt-1 text-sm leading-5 text-slate-700 dark:text-slate-300">Duyệt theo cây thư mục hoặc tìm theo tên; chọn tối đa {MAX_SELECTION} tệp. Chỉ tệp bạn chọn mới được đọc.</p></div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-900 dark:bg-violet-950 dark:text-violet-200">{selectedPaths.length} / {MAX_SELECTION} tệp</span></div>
    {!ready ? <p className="text-sm text-slate-700 dark:text-slate-300">Chọn repository và branch trước để xem danh sách tệp.</p> : query.isLoading ? <p role="status" className="text-sm text-slate-700 dark:text-slate-300">Đang tải danh sách tệp từ GitHub…</p> : query.isError || invalidResponse ? <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"><p>{invalidResponse ? 'Máy chủ chưa hỗ trợ danh sách tệp mới. Hãy khởi động lại máy chủ và thử lại.' : `Không tải được danh sách tệp: ${query.error?.message || 'Vui lòng thử lại.'}`}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => query.refetch()}>Thử lại</Button></div> : <>
      {truncated && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">GitHub chỉ trả về một phần cây tệp của repository rất lớn. Chưa thể xác minh đầy đủ lựa chọn; hãy dùng repository hoặc commit nhỏ hơn.</p>}
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input aria-label="Tìm tệp theo tên hoặc đường dẫn" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm README, route, login…" /></div><Button type="button" variant="outline" disabled={truncated || !ordered.some((item) => filePriority(item.path) < 3) || selectedPaths.length >= MAX_SELECTION} onClick={suggest}>Chọn tệp gợi ý</Button><Button type="button" variant="outline" disabled={truncated || !ordered.length || !canSelectAll} title={!canSelectAll ? `Không thể chọn hết vì giới hạn ${MAX_SELECTION} tệp.` : 'Chọn mọi tệp đủ điều kiện trong repository'} onClick={selectAll}>Chọn tất cả</Button></div>
      <p className="text-xs leading-5 text-slate-700 dark:text-slate-300">Bấm checkbox bên cạnh thư mục để chọn toàn bộ tệp bên trong, hoặc dùng “Chọn tất cả”. Hệ thống chỉ chọn khi toàn bộ tập tệp còn nằm trong giới hạn {MAX_SELECTION}; không tự chọn một phần. Danh sách chỉ gồm tệp phù hợp không quá 250 KB; các tệp build và tên bí mật thường gặp được ẩn.</p>
      {bulkMessage && <p role="status" className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{bulkMessage}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-300"><span>{searchTerm ? `${matchedCount} tệp khớp / ${items.length} tệp có thể chọn` : <>{items.length} tệp phù hợp</>}</span><span>{searchTerm ? 'Đã mở các thư mục có kết quả' : 'Mở thư mục để xem tệp'}</span></div>
      {tree && matchedCount ? <div role="tree" aria-label="Cây thư mục và tệp" tabIndex={0} className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-slate-700"><TreeBranch node={tree} depth={0} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} searching={Boolean(searchTerm)} selected={selected} selectedPaths={selectedPaths} toggle={toggle} toggleFolder={toggleFolder} blocked={truncated} /></div> : <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">{items.length ? 'Không có tệp khớp. Thử từ khóa khác.' : 'Không tìm thấy tệp phù hợp tại phiên bản này.'}</p>}
    </>}
    {selectedPaths.length > 0 && <div className="border-t border-slate-200 pt-3 dark:border-slate-700"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Tệp đã chọn</p><button type="button" className="text-sm font-semibold text-violet-700 underline dark:text-violet-300" onClick={() => onChange([])}>Bỏ chọn tất cả</button></div><ul className="mt-2 flex flex-wrap gap-2">{selectedPaths.map((path) => <li key={path} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100"><span className="break-all">{path}</span><button type="button" aria-label={`Bỏ chọn ${path}`} className="rounded p-1 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:hover:bg-slate-700" onClick={() => onChange(selectedPaths.filter((item) => item !== path))}><X className="h-3 w-3" /></button></li>)}</ul></div>}
  </section>
}
