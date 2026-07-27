import type { BarrelAnalysis, BarrelSafety, Edge, FileInfo, ModuleGraph, Scc } from '../@types'
import { INIT_EDGE_KINDS, consumersOf, contractBarrel, withBarrelExports } from './graph'
import { cycleEdges, cyclicSccs, shortestCycle, tarjanScc } from './scc'

const ALL_EDGE_KINDS = new Set(['value-static', 'side-effect', 'require', 'type-only', 'dynamic'] as const)

export interface BarrelAnalysisOptions {
    lazy?: boolean
    ownerByName?: Map<string, string>
}

export interface BarrelAnalysisResult {
    analysis: BarrelAnalysis
    runtimeGraph: ModuleGraph
}

export function buildRuntimeGraph(
    graph: ModuleGraph,
    barrelId: string,
    exportedFiles: string[],
    options: BarrelAnalysisOptions = {},
): ModuleGraph {
    return options.ownerByName
        ? contractBarrel(graph, barrelId, options.ownerByName, exportedFiles)
        : withBarrelExports(graph, barrelId, exportedFiles)
}

export function analyzeBarrel(
    graph: ModuleGraph,
    barrelId: string,
    exportedFiles: string[],
    options: BarrelAnalysisOptions = {},
): BarrelAnalysis {
    return analyzeBarrelGraph(graph, barrelId, exportedFiles, options).analysis
}

export function analyzeBarrelGraph(
    graph: ModuleGraph,
    barrelId: string,
    exportedFiles: string[],
    options: BarrelAnalysisOptions = {},
): BarrelAnalysisResult {
    const augmented = buildRuntimeGraph(graph, barrelId, exportedFiles, options)
    const result = tarjanScc(augmented, INIT_EDGE_KINDS)
    const consumers = consumersOf(graph, barrelId)

    let scc: Scc | undefined
    if (options.ownerByName) {
        scc = cyclicSccs(result).find((candidate) => {
            const members = new Set(candidate.members)
            return candidate.members.some((m) =>
                (augmented.out.get(m) ?? []).some(
                    (e) => e.viaBarrel === barrelId && members.has(e.to) && INIT_EDGE_KINDS.has(e.kind),
                ),
            )
        })
    } else {
        const sccId = result.sccOf.get(barrelId)
        const candidate = sccId === undefined ? undefined : result.sccs[sccId]
        scc = candidate?.hasCycle ? candidate : undefined
    }

    if (!scc) {
        const typeGraph = withBarrelExports(graph, barrelId, exportedFiles)
        const typeResult = tarjanScc(typeGraph, ALL_EDGE_KINDS)
        const typeSccId = typeResult.sccOf.get(barrelId)
        const typeScc = typeSccId === undefined ? undefined : typeResult.sccs[typeSccId]
        const typeSafe = !!typeScc?.hasCycle

        return {
            analysis: {
                barrelId,
                safety: typeSafe ? 'type-safe' : 'safe',
                members: typeSafe ? typeScc!.members.filter((m) => m !== barrelId) : [],
                cycle: typeSafe ? shortestCycle(typeGraph, typeScc!, ALL_EDGE_KINDS) : [],
                eagerEdges: [],
                consumers,
                lazy: !!options.lazy,
            },
            runtimeGraph: augmented,
        }
    }

    const internal = cycleEdges(augmented, scc, INIT_EDGE_KINDS)
    const eagerEdges = internal.filter((e) => e.eager)
    const safety: BarrelSafety = eagerEdges.length > 0 ? 'unsafe' : 'ordered'

    return {
        analysis: {
            barrelId,
            safety,
            members: scc.members.filter((m) => m !== barrelId),
            cycle: shortestCycle(augmented, scc, INIT_EDGE_KINDS),
            eagerEdges,
            consumers,
            lazy: !!options.lazy,
        },
        runtimeGraph: augmented,
    }
}

export interface SafeExportSelection {
    infos: FileInfo[]
    demoted: FileInfo[]
    dropped: FileInfo[]
    unchanged: boolean
}

export interface SafeExportOptions {
    lazy?: boolean
    precomputed?: BarrelAnalysis
}

export function selectSafeExports(
    graph: ModuleGraph,
    barrelId: string,
    infos: FileInfo[],
    options: SafeExportOptions = {},
): SafeExportSelection {
    const analysis = options.precomputed ??
        analyzeBarrel(graph, barrelId, infos.map((i) => i.absolutePath), options)

    const mustBreak = !options.lazy &&
        (analysis.safety === 'unsafe' || analysis.safety === 'ordered')

    if (!mustBreak) {
        return { infos, demoted: [], dropped: [], unchanged: true }
    }

    const poison = new Set(analysis.members)
    const kept: FileInfo[] = []
    const demoted: FileInfo[] = []
    const dropped: FileInfo[] = []

    for (const info of infos) {
        if (!poison.has(info.absolutePath)) {
            kept.push(info)
            continue
        }

        if (info.types.length > 0) {
            const typeOnly: FileInfo = { ...info, values: [], defaultAlias: null }
            kept.push(typeOnly)
            demoted.push(info)
        } else {
            dropped.push(info)
        }
    }

    return { infos: kept, demoted, dropped, unchanged: false }
}

export function describeEagerEdge(edge: Edge): string {
    const bindings = edge.bindings.length ? edge.bindings.join(', ') : 'module body'
    return `${edge.from}:${edge.line} reads ${bindings} during module evaluation`
}
