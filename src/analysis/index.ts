export { scanFile, classifyReference, isEager, strongerKind, strongerVia } from './scan'
export type { ScanContext } from './scan'

export {
    buildModuleGraph,
    withBarrelExports,
    contractBarrel,
    consumersOf,
    createCanonicalizer,
    INIT_EDGE_KINDS,
} from './graph'
export type { BuildModuleGraphOptions } from './graph'

export { tarjanScc, topoOrder, cyclicSccs, shortestCycle, cycleEdges, condensation } from './scc'

export { analyzeBarrel, analyzeBarrelGraph, buildRuntimeGraph, selectSafeExports, describeEagerEdge } from './barrel'
export type { SafeExportSelection, SafeExportOptions, BarrelAnalysisOptions, BarrelAnalysisResult } from './barrel'

export {
    collectCycleDiagnostics,
    collectBarrelDiagnostics,
    formatDiagnostics,
    countBySeverity,
    explainVia,
    SEVERITY_BY_CODE,
} from './diagnostics'
