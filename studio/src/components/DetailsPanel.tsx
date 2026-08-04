import { ArrowDownToLine, ArrowUpFromLine, Box, Braces, FileCode2, GitBranch, Hash, MapPin, X } from 'lucide-react'
import type { ProjectExport, ProjectFile, ProjectImport, Selection, Snapshot } from '../types'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { shortPath } from '../lib/utils'

interface Props {
  snapshot: Snapshot
  selection: Selection
  onSelectFile(path: string): void
  onClose(): void
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><div className="text-lg font-semibold tabular-nums">{value}</div><div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div></div>
}

function FileDetails({ file, snapshot, onSelectFile }: { file: ProjectFile; snapshot: Snapshot; onSelectFile(path: string): void }) {
  const imports = file.imports.map((id) => snapshot.imports.find((item) => item.id === id)).filter((item): item is ProjectImport => !!item)
  const exports = file.exports.map((id) => snapshot.exports.find((item) => item.id === id)).filter((item): item is ProjectExport => !!item)
  return <>
    <div className="flex items-start gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
      <span className="rounded-lg bg-sky-500/10 p-2 text-sky-500"><FileCode2 className="h-5 w-5" /></span>
      <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{file.name}</h2><p className="mt-1 break-all text-[11px] text-zinc-500">{file.path}</p></div>
    </div>
    <div className="grid grid-cols-3 gap-2 p-4"><Metric label="LOC" value={file.loc} /><Metric label="Functions" value={file.functions} /><Metric label="Classes" value={file.classes} /></div>
    <Section title="Exports" icon={<ArrowUpFromLine className="h-3.5 w-3.5" />} count={exports.length}>
      {exports.map((item) => <div key={item.id} className="flex items-center justify-between py-1.5 text-xs"><span className="truncate font-medium">{item.displayName}</span><Badge>{item.kind}</Badge></div>)}
    </Section>
    <Section title="This file imports" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} count={file.dependencies.length}>
      {imports.map((item) => <button key={item.id} className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-xs hover:text-violet-600" onClick={() => onSelectFile(item.target)}><span className="truncate">{shortPath(item.target)}</span><Badge>{item.kind}</Badge></button>)}
    </Section>
    <Section title="Files depending on this" icon={<GitBranch className="h-3.5 w-3.5" />} count={file.dependents.length}>
      {file.dependents.map((path) => <button key={path} className="block w-full truncate py-1.5 text-left text-xs hover:text-violet-600" onClick={() => onSelectFile(path)}>{shortPath(path)}</button>)}
    </Section>
  </>
}

function ExportDetails({ item, onSelectFile }: { item: ProjectExport; onSelectFile(path: string): void }) {
  return <>
    <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-2"><span className="rounded-lg bg-violet-500/10 p-2 text-violet-500"><Box className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{item.displayName}</h2><div className="mt-1 flex gap-1"><Badge>{item.kind}</Badge>{item.isDefault && <Badge>default</Badge>}{item.unused && <Badge className="text-amber-600">unused</Badge>}</div></div></div>
      <button className="mt-3 flex items-center gap-1 text-left text-[11px] text-zinc-500 hover:text-violet-600" onClick={() => onSelectFile(item.file)}><MapPin className="h-3 w-3" />{item.file}:{item.line}</button>
    </div>
    <div className="grid grid-cols-2 gap-2 p-4"><Metric label="Usage files" value={item.usages.length} /><Metric label="References" value={item.usages.reduce((sum, usage) => sum + usage.references, 0)} /></div>
    {item.originFile && <div className="mx-4 mb-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs dark:border-violet-900 dark:bg-violet-950/30"><div className="mb-1 flex items-center gap-1 font-medium"><Braces className="h-3 w-3" />Original declaration</div><div className="break-all text-zinc-500">{item.originFile}</div></div>}
    <Section title="Imported in" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} count={item.usages.length}>
      {item.usages.length === 0 && <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">This export is never imported inside the project.</div>}
      {item.usages.map((usage) => <button key={usage.id} className="mb-2 w-full rounded-lg border border-zinc-200 p-3 text-left hover:border-violet-300 dark:border-zinc-800 dark:hover:border-violet-800" onClick={() => onSelectFile(usage.file)}>
        <div className="truncate text-xs font-medium">{usage.file}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />line {usage.line}</span><span className="flex items-center gap-1"><Hash className="h-3 w-3" />{usage.references} refs</span><Badge>{usage.kind}</Badge>{usage.alias && <span>as <code>{usage.alias}</code></span>}</div>
      </button>)}
    </Section>
  </>
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return <section className="border-t border-zinc-200 p-4 dark:border-zinc-800"><h3 className="mb-2 flex items-center gap-2 text-xs font-semibold">{icon}{title}<span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-900">{count}</span></h3>{children}</section>
}

export function DetailsPanel({ snapshot, selection, onSelectFile, onClose }: Props) {
  if (!selection) return null
  const file = selection.type === 'file' ? snapshot.files.find((item) => item.path === selection.id) : undefined
  const projectExport = selection.type === 'export' ? snapshot.exports.find((item) => item.id === selection.id) : undefined
  if (!file && !projectExport) return null
  return <aside className="relative h-full w-[340px] shrink-0 overflow-y-auto border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <Button variant="ghost" size="icon" className="absolute right-2 top-2 z-10 h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
    {file && <FileDetails file={file} snapshot={snapshot} onSelectFile={onSelectFile} />}
    {projectExport && <ExportDetails item={projectExport} onSelectFile={onSelectFile} />}
  </aside>
}
