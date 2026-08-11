export { DEFAULT_SKIP_PATTERNS, DEFAULT_MODULE_FILE_PATTERN } from './utils'
export const DEFAULT_MODULE_FILE_PATTERNS: string[] = ['.module.ts', '.routes.ts', '.router.ts', '.route.ts']

export * from './core/app-config'
export * from './core/import'
export { buildDepGraph, detectCycles, topoSort, createTsProgram, buildLazyDtsOutput, buildLazyGlobalDtsOutput, findNameCollisions } from './script'
export type { DepGraph } from './script'
export type { CycleReport } from './@types'

export {
     buildModuleGraph,
     withBarrelExports,
     consumersOf,
     INIT_EDGE_KINDS,
     tarjanScc,
     topoOrder,
     cyclicSccs,
     shortestCycle,
     cycleEdges,
     condensation,
     analyzeBarrel,
     analyzeBarrelGraph,
     buildRuntimeGraph,
     contractBarrel,
     selectSafeExports,
     scanFile,
     classifyReference,
     collectCycleDiagnostics,
     collectBarrelDiagnostics,
     formatDiagnostics,
     countBySeverity,
     SEVERITY_BY_CODE,
} from './analysis'
export type { BuildModuleGraphOptions, SafeExportSelection, ScanContext } from './analysis'
export type {
     Edge,
     EdgeKind,
     EagerVia,
     ModuleGraph,
     Scc,
     SccResult,
     BarrelAnalysis,
     BarrelSafety,
     Diagnostic,
     DiagnosticCode,
     DiagnosticSeverity,
     StrictMode,
} from './@types'
export { genExportMap } from './core/export-map'
export { watchSrc } from './core/watch'
export type { WatchOptions } from './core/watch'
export type {
     StudioOptions,
     StudioExportKind,
     StudioImportKind,
     StudioUsage,
     StudioExport,
     StudioImport,
     StudioFile,
     StudioFolder,
     StudioCycle,
     StudioStats,
     StudioSnapshot,
} from './@types'
