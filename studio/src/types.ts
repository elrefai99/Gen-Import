export type ExportKind = 'function' | 'class' | 'interface' | 'enum' | 'type' | 'variable' | 'constant' | 'default' | 'unknown'
export type ImportKind = 'import' | 'type-import' | 're-export' | 'dynamic-import' | 'require' | 'side-effect'

export interface Usage {
  id: string
  file: string
  line: number
  importedAs: string
  alias?: string
  references: number
  kind: ImportKind
}

export interface ProjectExport {
  id: string
  name: string
  displayName: string
  kind: ExportKind
  file: string
  line: number
  isDefault: boolean
  isNamed: boolean
  isReactComponent: boolean
  unused: boolean
  originFile?: string
  reExportedFrom?: string
  usages: Usage[]
}

export interface ProjectImport {
  id: string
  source: string
  target: string
  specifier: string
  line: number
  kind: ImportKind
  bindings: string[]
}

export interface ProjectFile {
  id: string
  path: string
  name: string
  folder: string
  extension: string
  loc: number
  functions: number
  classes: number
  exports: string[]
  imports: string[]
  dependencies: string[]
  dependents: string[]
}

export interface ProjectFolder {
  name: string
  path: string
  files: string[]
  children: ProjectFolder[]
}

export interface ProjectCycle { id: string; files: string[] }

export interface Snapshot {
  version: number
  generatedAt: string
  rootDir: string
  scanDurationMs: number
  files: ProjectFile[]
  exports: ProjectExport[]
  imports: ProjectImport[]
  folders: ProjectFolder[]
  cycles: ProjectCycle[]
  stats: {
    totalFiles: number
    totalExports: number
    totalImports: number
    unusedExports: number
    circularDependencies: number
    largestFile?: { file: string; loc: number }
    mostImportedFile?: { file: string; imports: number }
    mostImportedExport?: { exportId: string; name: string; imports: number }
    averageImportsPerFile: number
    averageExportsPerFile: number
  }
}

export type Selection = { type: 'file' | 'export'; id: string } | undefined
export type View = 'overview' | 'graph' | 'exports' | 'unused' | 'cycles'
