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
     /** Relative file path from rootDir */
     file: string
     /** All symbols exported by this file */
     exports: ExportEntry[]
     /** Relative paths of files that import from this file */
     importedBy: string[]
     /** Relative paths of files this file imports from (internal only) */
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
