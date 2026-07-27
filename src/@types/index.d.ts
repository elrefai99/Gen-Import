export interface GenAppConfigOptions {
     rootDir?: string
     srcDir?: string
     outFileName?: string
     genImportFile?: string
     autoUpdate?: boolean
     skipPatterns?: string[]
     pureReexports?: string[]
     moduleFilePattern?: string | string[]
     generateJs?: boolean
}
export interface GenImportOptions {
     rootDir?: string
     srcDir?: string
     outFileName?: string
     skipPatterns?: string[]
     pureReexports?: string[]
     moduleFilePattern?: string | string[]
     generateJs?: boolean
     globals?: boolean
     strictCycles?: boolean
     noTopoSort?: boolean
     lazy?: boolean
     watch?: boolean
     safeBarrels?: boolean
     strict?: StrictMode
}

export type StrictMode = 'off' | 'cycles' | 'barrels' | 'collisions' | 'all'

export interface FileInfo {
     importPath: string
     absolutePath: string
     types: string[]
     values: string[]
     defaultAlias: string | null
}

export interface CycleReport {
     path: string[]
}

export type EdgeKind = 'value-static' | 'type-only' | 'dynamic' | 'require' | 'side-effect'

export type EagerVia =
     | 'heritage'
     | 'decorator'
     | 'static'
     | 'star-reexport'
     | 'side-effect'
     | 'module-body'

export type RefPosition =
     | 'type'
     | 'deferred'
     | 'eager'
     | 'eager-decorator'
     | 'eager-heritage'
     | 'eager-static'

export interface RawEdge {
     specifier: string
     kind: EdgeKind
     eager: boolean
     eagerVia?: EagerVia
     eagerLine?: number
     bindings: string[]
     line: number
}

export interface Edge {
     from: string
     to: string
     kind: EdgeKind
     eager: boolean
     eagerVia?: EagerVia
     eagerLine?: number
     bindings: string[]
     line: number
     /** Set when the edge was routed through a barrel and then contracted. */
     viaBarrel?: string
}

export interface ModuleGraph {
     nodes: string[]
     out: Map<string, Edge[]>
     barrels: string[]
}

export interface Scc {
     id: number
     members: string[]
     hasCycle: boolean
}

export interface SccResult {
     sccs: Scc[]
     sccOf: Map<string, number>
     kinds: EdgeKind[]
}

export type BarrelSafety = 'safe' | 'type-safe' | 'ordered' | 'unsafe'

export interface BarrelAnalysis {
     barrelId: string
     safety: BarrelSafety
     members: string[]
     cycle: string[]
     eagerEdges: Edge[]
     consumers: string[]
     /** True when the analysis modelled a lazy (getter-based) barrel. */
     lazy: boolean
}

export type DiagnosticCode =
     | 'GI001'
     | 'GI002'
     | 'GI003'
     | 'GI004'
     | 'GI005'
     | 'GI006'
     | 'GI007'
     | 'GI008'
     | 'GI009'

export type DiagnosticSeverity = 'error' | 'warn' | 'info'

export interface Diagnostic {
     code: DiagnosticCode
     severity: DiagnosticSeverity
     message: string
     files: string[]
     cycle?: string[]
     advice?: string
}

export interface CliArgs {
     importOpts: GenImportOptions
     appConfigOpts: GenAppConfigOptions
     exportMapOpts: ExportMapOptions
     runImport: boolean
     runAppConfig: boolean
     runExportMap: boolean
}

export type ExportKind = 'type' | 'value' | 'default'

export type ExportMapFormat = 'console' | 'json' | 'mermaid'

export interface ExportEntry {
     name: string
     kind: ExportKind
}

export interface ExportMapEntry {
     file: string
     exports: ExportEntry[]
     importedBy: string[]
     importsFrom: string[]
}

export interface ExportMapOptions {
     rootDir?: string
     srcDir?: string
     format?: ExportMapFormat
     outFile?: string
     includeImports?: boolean
     skipPatterns?: string[]
     pureReexports?: string[]
     moduleFilePattern?: string
}

export interface ExportMapResult {
     entries: ExportMapEntry[]
     totalFiles: number
     totalExports: number
     totalImportEdges: number
}
