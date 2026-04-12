export { DEFAULT_SKIP_PATTERNS, DEFAULT_MODULE_FILE_PATTERN } from './utils'
export const DEFAULT_MODULE_FILE_PATTERNS: string[] = ['.module.ts', '.routes.ts', '.router.ts', '.route.ts']

export * from './core/app-config'
export * from './core/import'
export { buildDepGraph, detectCycles, topoSort, createTsProgram, buildLazyDtsOutput, buildLazyGlobalDtsOutput } from './script'
export type { DepGraph } from './script'
export type { CycleReport } from './@types'
export { genExportMap } from './core/export-map'
