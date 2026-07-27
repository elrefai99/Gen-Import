import type { Edge, EdgeKind, ModuleGraph, Scc, SccResult } from '../@types'
import { INIT_EDGE_KINDS } from './graph'

function outEdges(
    graph: ModuleGraph,
    node: string,
    kinds: ReadonlySet<EdgeKind>,
): Edge[] {
    const edges = graph.out.get(node)
    if (!edges) return []
    return edges.filter((e) => kinds.has(e.kind))
}

export function tarjanScc(
    graph: ModuleGraph,
    kinds: ReadonlySet<EdgeKind> = INIT_EDGE_KINDS,
): SccResult {
    const index = new Map<string, number>()
    const low = new Map<string, number>()
    const onStack = new Set<string>()
    const stack: string[] = []
    const sccs: Scc[] = []
    const sccOf = new Map<string, number>()
    let counter = 0

    for (const root of graph.nodes) {
        if (index.has(root)) continue

        index.set(root, counter)
        low.set(root, counter)
        counter++
        stack.push(root)
        onStack.add(root)

        const work: Array<{ node: string; cursor: number; edges: Edge[] }> = [
            { node: root, cursor: 0, edges: outEdges(graph, root, kinds) },
        ]

        while (work.length) {
            const frame = work[work.length - 1]

            if (frame.cursor < frame.edges.length) {
                const next = frame.edges[frame.cursor].to
                frame.cursor++

                if (!index.has(next)) {
                    index.set(next, counter)
                    low.set(next, counter)
                    counter++
                    stack.push(next)
                    onStack.add(next)
                    work.push({ node: next, cursor: 0, edges: outEdges(graph, next, kinds) })
                } else if (onStack.has(next)) {
                    low.set(frame.node, Math.min(low.get(frame.node)!, index.get(next)!))
                }
                continue
            }

            work.pop()
            const node = frame.node

            if (work.length) {
                const parent = work[work.length - 1].node
                low.set(parent, Math.min(low.get(parent)!, low.get(node)!))
            }

            if (low.get(node) === index.get(node)) {
                const members: string[] = []
                let m: string
                do {
                    m = stack.pop()!
                    onStack.delete(m)
                    members.push(m)
                } while (m !== node)
                members.sort()

                const id = sccs.length
                for (const x of members) sccOf.set(x, id)

                const selfLoop =
                    members.length === 1 &&
                    outEdges(graph, members[0], kinds).some((e) => e.to === members[0])

                sccs.push({ id, members, hasCycle: members.length > 1 || selfLoop })
            }
        }
    }

    return { sccs, sccOf, kinds: [...kinds] }
}

export function topoOrder(result: SccResult): string[] {
    return result.sccs.flatMap((s) => s.members)
}

export function cyclicSccs(result: SccResult): Scc[] {
    return result.sccs.filter((s) => s.hasCycle)
}

export function shortestCycle(
    graph: ModuleGraph,
    scc: Scc,
    kinds: ReadonlySet<EdgeKind> = INIT_EDGE_KINDS,
): string[] {
    const members = new Set(scc.members)
    const start = scc.members[0]

    if (scc.members.length === 1) {
        const loops = outEdges(graph, start, kinds).some((e) => e.to === start)
        return loops ? [start, start] : []
    }

    const parent = new Map<string, string>()
    const queue: string[] = [start]
    const seen = new Set<string>([start])

    while (queue.length) {
        const node = queue.shift()!
        for (const edge of outEdges(graph, node, kinds)) {
            if (!members.has(edge.to)) continue

            if (edge.to === start) {
                const path: string[] = [node]
                for (let p = parent.get(node); p; p = parent.get(p)) path.push(p)
                path.reverse()
                return [...path, start]
            }
            if (seen.has(edge.to)) continue

            seen.add(edge.to)
            parent.set(edge.to, node)
            queue.push(edge.to)
        }
    }

    return []
}

export function cycleEdges(
    graph: ModuleGraph,
    scc: Scc,
    kinds: ReadonlySet<EdgeKind> = INIT_EDGE_KINDS,
): Edge[] {
    const members = new Set(scc.members)
    return scc.members.flatMap((m) => outEdges(graph, m, kinds).filter((e) => members.has(e.to)))
}

export function condensation(
    graph: ModuleGraph,
    result: SccResult,
    kinds: ReadonlySet<EdgeKind> = INIT_EDGE_KINDS,
): Map<number, Set<number>> {
    const dag = new Map<number, Set<number>>()
    for (const scc of result.sccs) dag.set(scc.id, new Set())

    for (const [from, edges] of graph.out) {
        const a = result.sccOf.get(from)
        if (a === undefined) continue
        for (const edge of edges) {
            if (!kinds.has(edge.kind)) continue
            const b = result.sccOf.get(edge.to)
            if (b === undefined || a === b) continue
            dag.get(a)!.add(b)
        }
    }

    return dag
}
