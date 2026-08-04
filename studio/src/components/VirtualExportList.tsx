import { useMemo, useState } from 'react'
import { Box, CircleDot, FileCode2 } from 'lucide-react'
import type { ProjectExport } from '../types'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

interface Props {
  exports: ProjectExport[]
  selectedId?: string
  onSelect(item: ProjectExport): void
  height?: number
}

const ROW_HEIGHT = 72

export function VirtualExportList({ exports: items, selectedId, onSelect, height = 520 }: Props) {
  const [scrollTop, setScrollTop] = useState(0)
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4)
    const end = Math.min(items.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + 4)
    return { start, end }
  }, [height, items.length, scrollTop])

  return <div className="overflow-auto" style={{ height }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
    <div className="relative" style={{ height: items.length * ROW_HEIGHT }}>
      <div className="absolute inset-x-0" style={{ top: range.start * ROW_HEIGHT }}>
        {items.slice(range.start, range.end).map((item) => <button
          key={item.id}
          onClick={() => onSelect(item)}
          className={cn('flex w-full items-center gap-3 border-b border-zinc-100 px-4 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60', selectedId === item.id && 'bg-violet-500/10 dark:bg-violet-500/10')}
          style={{ height: ROW_HEIGHT }}
        >
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', item.unused ? 'bg-amber-500/10 text-amber-600' : 'bg-violet-500/10 text-violet-600 dark:text-violet-400')}>
            {item.isDefault ? <CircleDot className="h-4 w-4" /> : <Box className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{item.displayName}</span>
              <Badge>{item.kind}</Badge>
              {item.unused && <Badge className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">unused</Badge>}
            </span>
            <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-zinc-500"><FileCode2 className="h-3 w-3" />{item.file}:{item.line}</span>
          </span>
          <span className="text-right text-[11px] text-zinc-400"><strong className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.usages.length}</strong>usages</span>
        </button>)}
      </div>
    </div>
  </div>
}
