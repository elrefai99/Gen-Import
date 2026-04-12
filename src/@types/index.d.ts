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
}

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
