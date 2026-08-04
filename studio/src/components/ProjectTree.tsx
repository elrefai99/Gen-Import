import { useState } from 'react'
import { ChevronRight, FileCode2, Folder, FolderOpen } from 'lucide-react'
import type { ProjectFile, ProjectFolder } from '../types'
import { cn } from '../lib/utils'

interface Props {
  folders: ProjectFolder[]
  files: ProjectFile[]
  activeFolder?: string
  selectedFile?: string
  onFolder(path?: string): void
  onFile(path: string): void
}

function FolderRow({ folder, depth, filesByPath, activeFolder, selectedFile, onFolder, onFile }: {
  folder: ProjectFolder
  depth: number
  filesByPath: Map<string, ProjectFile>
  activeFolder?: string
  selectedFile?: string
  onFolder(path?: string): void
  onFile(path: string): void
}) {
  const [open, setOpen] = useState(depth < 2)
  const directFiles = folder.files
    .map((path) => filesByPath.get(path))
    .filter((file): file is ProjectFile => !!file && file.folder === folder.path)
  return <>
    <button
      className={cn('group flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900', activeFolder === folder.path && 'bg-violet-500/10 text-violet-700 dark:text-violet-300')}
      style={{ paddingLeft: 8 + depth * 12 }}
      onClick={() => { setOpen(!open); onFolder(folder.path) }}
      title={folder.path}
    >
      <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')} />
      {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-violet-500" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-violet-500" />}
      <span className="truncate">{folder.name}</span>
      <span className="ml-auto text-[10px] tabular-nums text-zinc-400">{folder.files.length}</span>
    </button>
    {open && <>
      {folder.children.map((child) => <FolderRow key={child.path} folder={child} depth={depth + 1} filesByPath={filesByPath} activeFolder={activeFolder} selectedFile={selectedFile} onFolder={onFolder} onFile={onFile} />)}
      {directFiles.map((file) => <button
        key={file.path}
        className={cn('flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900', selectedFile === file.path && 'bg-zinc-200/70 text-zinc-950 dark:bg-zinc-800 dark:text-white')}
        style={{ paddingLeft: 25 + (depth + 1) * 12 }}
        onClick={() => onFile(file.path)}
        title={file.path}
      >
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-sky-500" />
        <span className="truncate">{file.name}</span>
      </button>)}
    </>}
  </>
}

export function ProjectTree({ folders, files, activeFolder, selectedFile, onFolder, onFile }: Props) {
  const filesByPath = new Map(files.map((file) => [file.path, file]))
  const rootFiles = files.filter((file) => !file.folder)
  return <div className="space-y-0.5">
    <button className={cn('mb-1 flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900', !activeFolder && 'bg-zinc-100 dark:bg-zinc-900')} onClick={() => onFolder(undefined)}>
      <FolderOpen className="h-3.5 w-3.5 text-violet-500" /> Project root
      <span className="ml-auto text-[10px] text-zinc-400">{files.length}</span>
    </button>
    {folders.map((folder) => <FolderRow key={folder.path} folder={folder} depth={0} filesByPath={filesByPath} activeFolder={activeFolder} selectedFile={selectedFile} onFolder={onFolder} onFile={onFile} />)}
    {rootFiles.map((file) => <button key={file.path} className={cn('flex h-7 w-full items-center gap-1.5 rounded-md px-5 text-left text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900', selectedFile === file.path && 'bg-zinc-200/70 text-zinc-950 dark:bg-zinc-800 dark:text-white')} onClick={() => onFile(file.path)}>
      <FileCode2 className="h-3.5 w-3.5 text-sky-500" /><span className="truncate">{file.name}</span>
    </button>)}
  </div>
}
