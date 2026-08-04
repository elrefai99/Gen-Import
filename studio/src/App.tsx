import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, BarChart3, Box, Boxes, Braces, Check, CircleOff,
  FileCode2, GitBranch, LoaderCircle, Moon, Network, RefreshCw, Search, Sun,
} from 'lucide-react'
import type { ExportKind, ProjectExport, Selection, Snapshot, View } from './types'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
import { Input } from './components/ui/input'
import { ProjectTree } from './components/ProjectTree'
import { GraphCanvas } from './components/GraphCanvas'
import { DetailsPanel } from './components/DetailsPanel'
import { VirtualExportList } from './components/VirtualExportList'
import { cn, compactNumber, shortPath } from './lib/utils'

const NAV: Array<{ id: View; label: string; icon: typeof BarChart3 }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'graph', label: 'Dependency graph', icon: Network },
  { id: 'exports', label: 'Export explorer', icon: Box },
  { id: 'unused', label: 'Unused exports', icon: CircleOff },
  { id: 'cycles', label: 'Circular dependencies', icon: RefreshCw },
]

const FILTERS: Array<{ id: ExportKind | 'all' | 'default' | 'named' | 'component' | 'controller' | 'service' | 'backend'; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'function', label: 'Functions' }, { id: 'class', label: 'Classes' },
  { id: 'interface', label: 'Interfaces' }, { id: 'enum', label: 'Enums' }, { id: 'default', label: 'Default' },
  { id: 'named', label: 'Named' }, { id: 'component', label: 'React components' }, { id: 'controller', label: 'Controllers' },
  { id: 'service', label: 'Services' }, { id: 'backend', label: 'Backend' },
]
type Filter = typeof FILTERS[number]['id']

function StatCard({ label, value, note, icon: Icon, tone = 'violet' }: { label: string; value: number; note: string; icon: typeof Box; tone?: 'violet' | 'amber' | 'red' | 'sky' }) {
  const colors = { violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', red: 'bg-red-500/10 text-red-600 dark:text-red-400', sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' }
  return <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{compactNumber(value)}</p></div><span className={cn('rounded-lg p-2', colors[tone])}><Icon className="h-4 w-4" /></span></div><p className="mt-3 truncate text-[10px] text-zinc-400">{note}</p></Card>
}

function Overview({ snapshot, onView, onSelectExport, onSelectFile }: { snapshot: Snapshot; onView(view: View): void; onSelectExport(item: ProjectExport): void; onSelectFile(path: string): void }) {
  const topExports = [...snapshot.exports].sort((a, b) => b.usages.length - a.usages.length).slice(0, 5)
  const topFiles = [...snapshot.files].sort((a, b) => b.dependents.length - a.dependents.length).slice(0, 5)
  return <div className="h-full overflow-auto p-5 lg:p-7">
    <div className="mb-5"><h1 className="text-xl font-semibold tracking-tight">Project overview</h1><p className="mt-1 text-xs text-zinc-500">A live view of the architecture, updated whenever source files change.</p></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <StatCard label="Source files" value={snapshot.stats.totalFiles} note={`${snapshot.scanDurationMs}ms index time`} icon={FileCode2} tone="sky" />
      <StatCard label="Exports" value={snapshot.stats.totalExports} note={`${snapshot.stats.averageExportsPerFile} average per file`} icon={Box} />
      <StatCard label="Import edges" value={snapshot.stats.totalImports} note={`${snapshot.stats.averageImportsPerFile} average per file`} icon={GitBranch} tone="sky" />
      <StatCard label="Unused exports" value={snapshot.stats.unusedExports} note="Candidates for cleanup" icon={CircleOff} tone="amber" />
      <StatCard label="Dependency cycles" value={snapshot.stats.circularDependencies} note="Static runtime cycles" icon={RefreshCw} tone="red" />
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="flex items-center border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"><div><h2 className="text-sm font-semibold">Most imported exports</h2><p className="text-[10px] text-zinc-500">Symbols with the widest reach</p></div><Button variant="ghost" size="sm" className="ml-auto" onClick={() => onView('exports')}>Explore all <ArrowRight className="h-3 w-3" /></Button></div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-900">{topExports.map((item, index) => <button key={item.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60" onClick={() => onSelectExport(item)}><span className="w-5 text-xs tabular-nums text-zinc-400">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{item.displayName}</span><span className="block truncate text-[10px] text-zinc-500">{item.file}</span></span><Badge>{item.kind}</Badge><strong className="w-8 text-right text-xs tabular-nums">{item.usages.length}</strong></button>)}</div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"><div><h2 className="text-sm font-semibold">Architecture hotspots</h2><p className="text-[10px] text-zinc-500">Files with the most dependents</p></div><Button variant="ghost" size="sm" className="ml-auto" onClick={() => onView('graph')}>Open graph <ArrowRight className="h-3 w-3" /></Button></div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-900">{topFiles.map((file, index) => <button key={file.path} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60" onClick={() => onSelectFile(file.path)}><span className="w-5 text-xs tabular-nums text-zinc-400">{index + 1}</span><FileCode2 className="h-4 w-4 text-sky-500" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{file.name}</span><span className="block truncate text-[10px] text-zinc-500">{file.path}</span></span><span className="text-right text-[10px] text-zinc-500"><strong className="block text-xs text-zinc-800 dark:text-zinc-100">{file.dependents.length}</strong>dependents</span></button>)}</div>
      </Card>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Insight label="Largest file" value={snapshot.stats.largestFile?.file ?? '—'} meta={`${snapshot.stats.largestFile?.loc ?? 0} lines`} />
      <Insight label="Most imported file" value={snapshot.stats.mostImportedFile?.file ?? '—'} meta={`${snapshot.stats.mostImportedFile?.imports ?? 0} dependents`} />
      <Insight label="Index status" value="Watching for changes" meta={`Snapshot #${snapshot.version} · ${new Date(snapshot.generatedAt).toLocaleTimeString()}`} healthy />
    </div>
  </div>
}

function Insight({ label, value, meta, healthy }: { label: string; value: string; meta: string; healthy?: boolean }) {
  return <Card className="p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">{healthy && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}{label}</div><div className="mt-2 truncate text-xs font-medium" title={value}>{value}</div><div className="mt-1 text-[10px] text-zinc-400">{meta}</div></Card>
}

function ExportExplorer({ items, selection, filter, setFilter, onSelect }: { items: ProjectExport[]; selection: Selection; filter: Filter; setFilter(value: Filter): void; onSelect(item: ProjectExport): void }) {
  return <div className="flex h-full flex-col p-5 lg:p-7"><div className="mb-4"><h1 className="text-xl font-semibold tracking-tight">Export explorer</h1><p className="mt-1 text-xs text-zinc-500">Inspect every public symbol and find exactly where it is used.</p></div><div className="mb-4 flex flex-wrap gap-1.5">{FILTERS.map((item) => <Button key={item.id} variant={filter === item.id ? 'default' : 'outline'} size="sm" onClick={() => setFilter(item.id)}>{filter === item.id && <Check className="h-3 w-3" />}{item.label}</Button>)}</div><Card className="min-h-0 flex-1 overflow-hidden"><div className="flex h-11 items-center border-b border-zinc-200 px-4 text-xs font-medium dark:border-zinc-800"><Box className="mr-2 h-4 w-4 text-violet-500" />{items.length.toLocaleString()} exports</div><VirtualExportList exports={items} selectedId={selection?.type === 'export' ? selection.id : undefined} onSelect={onSelect} height={Math.max(300, window.innerHeight - 245)} /></Card></div>
}

function Cycles({ snapshot, onSelectFile }: { snapshot: Snapshot; onSelectFile(path: string): void }) {
  return <div className="h-full overflow-auto p-5 lg:p-7"><h1 className="text-xl font-semibold tracking-tight">Circular dependencies</h1><p className="mt-1 text-xs text-zinc-500">Strongly connected runtime imports that can make initialization order fragile.</p>{snapshot.cycles.length === 0 ? <Card className="mt-6 flex flex-col items-center justify-center py-20 text-center"><span className="mb-4 rounded-full bg-emerald-500/10 p-4 text-emerald-500"><Check className="h-7 w-7" /></span><h2 className="text-sm font-semibold">No circular dependencies</h2><p className="mt-1 text-xs text-zinc-500">The runtime import graph is acyclic.</p></Card> : <div className="mt-5 grid gap-4 xl:grid-cols-2">{snapshot.cycles.map((cycle, index) => <Card key={cycle.id} className="overflow-hidden"><div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-400"><AlertTriangle className="h-4 w-4" />Cycle {index + 1}<Badge className="ml-auto border-red-200 bg-white text-red-600 dark:border-red-900 dark:bg-red-950">{cycle.files.length} files</Badge></div><div className="p-4">{[...cycle.files, cycle.files[0]].map((file, fileIndex) => <div key={`${file}:${fileIndex}`} className="flex items-center gap-3"><button className="min-w-0 flex-1 truncate rounded-lg border border-zinc-200 px-3 py-2 text-left text-xs hover:border-red-300 dark:border-zinc-800" onClick={() => onSelectFile(file)}>{file}</button>{fileIndex < cycle.files.length && <ArrowRight className="h-3.5 w-3.5 shrink-0 rotate-90 text-red-400" />}</div>)}</div></Card>)}</div>}</div>
}

function matchesFilter(item: ProjectExport, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'default') return item.isDefault
  if (filter === 'named') return item.isNamed
  if (filter === 'component') return item.isReactComponent
  if (filter === 'controller') return /controller/i.test(item.file)
  if (filter === 'service') return /service/i.test(item.file)
  if (filter === 'backend') return !item.isReactComponent && !/\.(?:tsx|jsx)$/.test(item.file)
  return item.kind === filter
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState<string>()
  const [view, setView] = useState<View>('overview')
  const [selection, setSelection] = useState<Selection>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [folder, setFolder] = useState<string>()
  const [dark, setDark] = useState(() => localStorage.getItem('gen-import-theme') !== 'light')
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const response = await fetch('/api/snapshot', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Studio API returned ${response.status}`)
      setSnapshot(await response.json() as Snapshot)
      setError(undefined)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  useEffect(() => { void load(); const events = new EventSource('/api/events'); events.addEventListener('update', () => void load()); return () => events.close() }, [])
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('gen-import-theme', dark ? 'dark' : 'light') }, [dark])

  const filteredExports = useMemo(() => {
    if (!snapshot) return []
    const needle = query.trim().toLowerCase()
    return snapshot.exports.filter((item) =>
      matchesFilter(item, filter) &&
      (!folder || item.file.startsWith(`${folder}/`) || item.file === folder) &&
      (!needle || item.name.toLowerCase().includes(needle) || item.displayName.toLowerCase().includes(needle) || item.file.toLowerCase().includes(needle)),
    )
  }, [filter, folder, query, snapshot])
  const searchResults = useMemo(() => {
    if (!snapshot || query.trim().length < 2) return []
    const needle = query.toLowerCase()
    return [
      ...snapshot.exports.filter((item) => item.displayName.toLowerCase().includes(needle)).slice(0, 5).map((item) => ({ type: 'export' as const, id: item.id, label: item.displayName, path: item.file })),
      ...snapshot.files.filter((item) => item.path.toLowerCase().includes(needle)).slice(0, 5).map((item) => ({ type: 'file' as const, id: item.path, label: item.name, path: item.path })),
    ].slice(0, 8)
  }, [query, snapshot])

  if (error) return <div className="flex h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950"><Card className="max-w-md p-8 text-center"><AlertTriangle className="mx-auto mb-3 h-7 w-7 text-red-500" /><h1 className="font-semibold">Studio could not load</h1><p className="mt-2 text-sm text-zinc-500">{error}</p><Button className="mt-5" onClick={() => void load()}>Try again</Button></Card></div>
  if (!snapshot) return <div className="flex h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Indexing your project…</div>

  const selectedFile = selection?.type === 'file' ? selection.id : selection?.type === 'export' ? snapshot.exports.find((item) => item.id === selection.id)?.file : undefined
  const selectFile = (path: string) => { setSelection({ type: 'file', id: path }); setView('graph') }
  const selectExport = (item: ProjectExport) => { setSelection({ type: 'export', id: item.id }) }
  const title = NAV.find((item) => item.id === view)?.label ?? 'Studio'

  return <div className="flex h-screen overflow-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200 px-4 dark:border-zinc-800"><span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/20"><Braces className="h-4 w-4" /></span><div><div className="text-sm font-semibold tracking-tight">Gen Import</div><div className="text-[9px] uppercase tracking-[.22em] text-violet-500">Studio</div></div><Badge className="ml-auto">live</Badge></div>
      <nav className="space-y-1 border-b border-zinc-200 p-2 dark:border-zinc-800">{NAV.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900', view === id && 'bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-white')}><Icon className={cn('h-3.5 w-3.5', view === id && 'text-violet-500')} />{label}{id === 'unused' && <span className="ml-auto text-[10px] tabular-nums">{snapshot.stats.unusedExports}</span>}{id === 'cycles' && snapshot.cycles.length > 0 && <span className="ml-auto rounded-full bg-red-500/10 px-1.5 text-[10px] text-red-500">{snapshot.cycles.length}</span>}</button>)}</nav>
      <div className="flex items-center px-3 pb-2 pt-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Project structure</span><span className="ml-auto text-[10px] text-zinc-400">{snapshot.files.length}</span></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"><ProjectTree folders={snapshot.folders} files={snapshot.files} activeFolder={folder} selectedFile={selectedFile} onFolder={(path) => { setFolder(path); setView('graph') }} onFile={selectFile} /></div>
      <div className="border-t border-zinc-200 p-3 text-[10px] text-zinc-500 dark:border-zinc-800"><div className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Watching {snapshot.stats.totalFiles.toLocaleString()} files</div><div className="mt-1 truncate" title={snapshot.rootDir}>{snapshot.rootDir}</div></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="hidden text-xs text-zinc-400 lg:inline">Studio</span><span className="hidden text-zinc-300 lg:inline">/</span><strong className="hidden text-xs font-medium lg:inline">{title}</strong>
        <div className="relative mx-auto w-full max-w-xl"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files, functions, classes, interfaces…" className="pl-9 pr-16" /><kbd className="pointer-events-none absolute right-2 top-2 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">⌘ K</kbd>
          {searchResults.length > 0 && view !== 'exports' && <Card className="absolute inset-x-0 top-11 z-50 overflow-hidden p-1 shadow-xl">{searchResults.map((result) => <button key={`${result.type}:${result.id}`} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900" onClick={() => { setSelection({ type: result.type, id: result.id }); setView('graph'); setQuery('') }}>{result.type === 'file' ? <FileCode2 className="h-4 w-4 text-sky-500" /> : <Box className="h-4 w-4 text-violet-500" />}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{result.label}</span><span className="block truncate text-[10px] text-zinc-500">{result.path}</span></span><Badge>{result.type}</Badge></button>)}</Card>}
        </div>
        <Button variant="ghost" size="icon" title="Refresh index" disabled={refreshing} onClick={async () => { setRefreshing(true); await fetch('/api/refresh', { method: 'POST' }); await load(); setRefreshing(false) }}><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} /></Button>
        <Button variant="ghost" size="icon" title="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          {view === 'overview' && <Overview snapshot={snapshot} onView={setView} onSelectExport={selectExport} onSelectFile={selectFile} />}
          {view === 'graph' && <GraphCanvas snapshot={snapshot} selection={selection} query={query} folder={folder} onSelect={setSelection} />}
          {(view === 'exports' || view === 'unused') && <ExportExplorer items={filteredExports.filter((item) => view !== 'unused' || item.unused)} selection={selection} filter={filter} setFilter={setFilter} onSelect={selectExport} />}
          {view === 'cycles' && <Cycles snapshot={snapshot} onSelectFile={selectFile} />}
        </main>
        <DetailsPanel snapshot={snapshot} selection={selection} onSelectFile={selectFile} onClose={() => setSelection(undefined)} />
      </div>
    </div>
  </div>
}
