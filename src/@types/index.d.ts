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
}

export interface FileInfo {
     importPath: string
     types: string[]
     values: string[]
     defaultAlias: string | null
}

export interface CliArgs {
     importOpts: GenImportOptions
     appConfigOpts: GenAppConfigOptions
     runImport: boolean
     runAppConfig: boolean
}
