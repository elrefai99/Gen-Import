export interface GenAppConfigOptions {
     rootDir?: string
     srcDir?: string
     outFileName?: string
     genImportFile?: string
     genPackageFile?: string
     autoUpdate?: boolean
     skipPatterns?: string[]
     pureReexports?: string[]
     moduleFilePattern?: string
     generateJs?: boolean
}
export interface GenImportOptions {
     rootDir?: string
     srcDir?: string
     outFileName?: string
     skipPatterns?: string[]
     pureReexports?: string[]
     moduleFilePattern?: string
     generateJs?: boolean
}

export interface GenPackageOptions {
     rootDir?: string
     srcDir?: string
     outFileName?: string
     includePackages?: string[]
     excludePackages?: string[]
     includeDev?: boolean
     generateJs?: boolean
}

export interface FileInfo {
     importPath: string
     types: string[]
     values: string[]
     defaultAlias: string | null
}

export interface CliArgs {
     importOpts: GenImportOptions
     packageOpts: GenPackageOptions
     appConfigOpts: GenAppConfigOptions
     runPackages: boolean
     runImport: boolean
     runAppConfig: boolean
}
