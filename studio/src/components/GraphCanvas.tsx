import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Boxes, FolderTree, Layers3 } from 'lucide-react'
import type { Selection, Snapshot } from '../types'
import { Button } from './ui/button'

interface Props {
  snapshot: Snapshot
  selection: Selection
  query: string
  folder?: string
  onSelect(selection: Selection): void
}

interface GraphData { nodes: Node[]; edges: Edge[]; truncated: boolean }

function layout(nodes: Node[]): Node[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.7)))
  return nodes.map((node, index) => ({
    ...node,
    position: { x: (index % columns) * 245, y: Math.floor(index / columns) * 115 },
  }))
}

function buildFileGraph(snapshot: Snapshot, selection: Selection, folder?: string): GraphData {
  let files = folder ? snapshot.files.filter((file) => file.path.startsWith(`${folder}/`) || file.folder === folder) : snapshot.files
  if (selection?.type === 'file') {
    const selected = snapshot.files.find((file) => file.path === selection.id)
    if (selected) {
      const neighborhood = new Set([selected.path, ...selected.dependencies, ...selected.dependents])
      for (const path of [...neighborhood]) {
        const file = snapshot.files.find((item) => item.path === path)
        if (file) for (const adjacent of [...file.dependencies, ...file.dependents]) neighborhood.add(adjacent)
      }
      files = files.filter((file) => neighborhood.has(file.path))
    }
  } else if (selection?.type === 'export') {
    const item = snapshot.exports.find((candidate) => candidate.id === selection.id)
    if (item) {
      const neighborhood = new Set([item.file, ...item.usages.map((usage) => usage.file)])
      files = files.filter((file) => neighborhood.has(file.path))
    }
  }
  const truncated = files.length > 700
  files = files.slice(0, 700)
  const paths = new Set(files.map((file) => file.path))
  const cycleEdges = new Set(snapshot.cycles.flatMap((cycle) => cycle.files.flatMap((file, index) => [`${file}\0${cycle.files[(index + 1) % cycle.files.length]}`])))
  const nodes: Node[] = files.map((file) => ({
    id: `file:${file.path}`,
    data: { label: file.name },
    position: { x: 0, y: 0 },
    style: {
      width: 190,
      borderRadius: 10,
      border: selection?.type === 'file' && selection.id === file.path ? '2px solid #8b5cf6' : '1px solid #d4d4d8',
      background: selection?.type === 'file' && selection.id === file.path ? '#f5f3ff' : 'var(--graph-node)',
      color: 'var(--graph-text)',
      fontSize: 12,
      fontWeight: 600,
      padding: '12px 14px',
      boxShadow: '0 4px 18px rgba(0,0,0,.06)',
    },
  }))
  const edges: Edge[] = snapshot.imports
    .filter((edge) => paths.has(edge.source) && paths.has(edge.target))
    .map((edge) => {
      const cyclic = cycleEdges.has(`${edge.source}\0${edge.target}`) || snapshot.cycles.some((cycle) => cycle.files.includes(edge.source) && cycle.files.includes(edge.target))
      return {
        id: edge.id,
        source: `file:${edge.source}`,
        target: `file:${edge.target}`,
        label: edge.kind === 'import' ? undefined : edge.kind,
        animated: edge.kind === 'dynamic-import',
        markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13 },
        style: { stroke: cyclic ? '#ef4444' : edge.kind === 're-export' ? '#8b5cf6' : '#94a3b8', strokeWidth: cyclic ? 2 : 1.3 },
        labelStyle: { fontSize: 9, fill: '#71717a' },
      }
    })

  if (selection) {
    const selectedFile = selection.type === 'file'
      ? selection.id
      : snapshot.exports.find((item) => item.id === selection.id)?.file
    if (selectedFile && paths.has(selectedFile)) {
      const exports = snapshot.exports.filter((item) => item.file === selectedFile).slice(0, 80)
      for (const item of exports) {
        nodes.push({
          id: item.id,
          data: { label: `${item.displayName} · ${item.kind}` },
          position: { x: 0, y: 0 },
          style: {
            width: 190,
            borderRadius: 8,
            border: selection.type === 'export' && selection.id === item.id ? '2px solid #8b5cf6' : '1px solid #c4b5fd',
            background: item.unused ? 'var(--graph-unused)' : 'var(--graph-export)',
            color: 'var(--graph-text)', fontSize: 11, padding: '9px 12px',
          },
        })
        edges.push({ id: `declares:${item.id}`, source: `file:${selectedFile}`, target: item.id, label: 'exports', style: { stroke: '#a78bfa', strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11 } })
      }
    }
  }
  return { nodes: layout(nodes), edges, truncated }
}

function buildFolderGraph(snapshot: Snapshot, folder?: string): GraphData {
  const visibleFiles = folder ? snapshot.files.filter((file) => file.path.startsWith(`${folder}/`) || file.folder === folder) : snapshot.files
  const folders = [...new Set(visibleFiles.map((file) => file.folder || '(root)'))].sort()
  const ids = new Set(folders)
  const nodes: Node[] = folders.map((name) => ({
    id: `folder:${name}`,
    data: { label: `${name}  ·  ${visibleFiles.filter((file) => (file.folder || '(root)') === name).length} files` },
    position: { x: 0, y: 0 },
    style: { width: 220, borderRadius: 12, border: '1px solid #c4b5fd', background: 'var(--graph-folder)', color: 'var(--graph-text)', fontSize: 12, fontWeight: 600, padding: '16px' },
  }))
  const edgeMap = new Map<string, number>()
  const fileMap = new Map(snapshot.files.map((file) => [file.path, file]))
  for (const edge of snapshot.imports) {
    const source = fileMap.get(edge.source)?.folder || '(root)'
    const target = fileMap.get(edge.target)?.folder || '(root)'
    if (source === target || !ids.has(source) || !ids.has(target)) continue
    const key = `${source}\0${target}`
    edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1)
  }
  const edges: Edge[] = [...edgeMap].map(([key, count], index) => {
    const [source, target] = key.split('\0')
    return { id: `folder-edge:${index}`, source: `folder:${source}`, target: `folder:${target}`, label: `${count}`, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#8b5cf6', strokeWidth: Math.min(1 + count / 5, 4) }, labelStyle: { fontSize: 10, fill: '#8b5cf6' } }
  })
  return { nodes: layout(nodes), edges, truncated: false }
}

function Canvas({ snapshot, selection, query, folder, onSelect }: Props) {
  const [grouped, setGrouped] = useState(false)
  const [hovered, setHovered] = useState<string>()
  const flow = useReactFlow()
  const graph = useMemo(() => grouped ? buildFolderGraph(snapshot, folder) : buildFileGraph(snapshot, selection, folder), [folder, grouped, selection, snapshot])

  useEffect(() => {
    if (!query.trim()) return
    const needle = query.toLowerCase()
    const found = graph.nodes.find((node) => String(node.data.label).toLowerCase().includes(needle))
    if (found) flow.setCenter(found.position.x + 95, found.position.y + 30, { zoom: 1.3, duration: 500 })
  }, [flow, graph.nodes, query])

  const connected = useMemo(() => {
    if (!hovered) return undefined
    const found = new Set([hovered])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of graph.edges) {
        if (found.has(edge.source) && !found.has(edge.target)) { found.add(edge.target); changed = true }
        if (found.has(edge.target) && !found.has(edge.source)) { found.add(edge.source); changed = true }
      }
    }
    return found
  }, [graph.edges, hovered])

  const nodes = graph.nodes.map((node) => ({ ...node, style: { ...node.style, opacity: connected && !connected.has(node.id) ? .16 : 1 } }))
  const edges = graph.edges.map((edge) => ({ ...edge, style: { ...edge.style, opacity: connected && (!connected.has(edge.source) || !connected.has(edge.target)) ? .1 : 1 } }))

  return <div className="relative h-full w-full bg-[var(--graph-bg)]">
    <div className="absolute left-3 top-3 z-10 flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setGrouped(!grouped)}>{grouped ? <Layers3 className="h-3.5 w-3.5" /> : <FolderTree className="h-3.5 w-3.5" />}{grouped ? 'Expand files' : 'Collapse folders'}</Button>
      {graph.truncated && <span className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950">Showing first 700 nodes. Select a file to focus.</span>}
    </div>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      minZoom={0.08}
      maxZoom={2.5}
      onNodeMouseEnter={(_, node) => setHovered(node.id)}
      onNodeMouseLeave={() => setHovered(undefined)}
      onNodeClick={(_, node) => {
        if (node.id.startsWith('file:')) onSelect({ type: 'file', id: node.id.slice(5) })
        else if (node.id.startsWith('export:')) onSelect({ type: 'export', id: node.id })
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--graph-dot)" gap={22} size={1} />
      <Controls position="bottom-left" />
      <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.id.startsWith('export:') ? '#8b5cf6' : '#64748b'} maskColor="var(--minimap-mask)" />
    </ReactFlow>
    {graph.nodes.length === 0 && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-zinc-400"><Boxes className="mb-3 h-9 w-9" /><p className="text-sm">No nodes match this folder.</p></div>}
  </div>
}

export function GraphCanvas(props: Props) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>
}
