#!/usr/bin/env node
import { genImport, genPackage, genAppConfig } from './index'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CliArgs, GenAppConfigOptions, GenImportOptions, GenPackageOptions } from './@types'

function parseArgs(argv: string[]): CliArgs {
    const importOpts: GenImportOptions = {}
    const packageOpts: GenPackageOptions = {}
    const appConfigOpts: GenAppConfigOptions = {}
    let runPackages = false
    let runImport = true
    let runAppConfig = false
    const args = argv.slice(2)

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        const next = args[i + 1]

        switch (arg) {
            case '--root':
            case '-r':
                importOpts.rootDir = next
                packageOpts.rootDir = next
                i++
                break
            case '--src':
            case '-s':
                importOpts.srcDir = next
                packageOpts.srcDir = next
                i++
                break
            case '--out':
            case '-o':
                importOpts.outFileName = next
                i++
                break
            case '--pkg-out':
                packageOpts.outFileName = next
                i++
                break
            case '--module-pattern':
            case '-m':
                importOpts.moduleFilePattern = next
                i++
                break
            case '--skip':
                importOpts.skipPatterns = [...(importOpts.skipPatterns ?? []), next]
                i++
                break
            case '--pure-reexport':
                importOpts.pureReexports = [...(importOpts.pureReexports ?? []), next]
                i++
                break
            case '--no-js':
                importOpts.generateJs = false
                packageOpts.generateJs = false
                break
            case '--packages':
            case '-p':
                runPackages = true
                break
            case '--packages-only':
                runPackages = true
                runImport = false
                break
            case '--app-config':
                runAppConfig = true
                break
            case '--app-config-out':
                appConfigOpts.outFileName = next
                i++
                break
            case '--no-auto-update':
                appConfigOpts.autoUpdate = false
                break
            case '--include-dev':
                packageOpts.includeDev = true
                break
            case '--include-pkg':
                packageOpts.includePackages = [...(packageOpts.includePackages ?? []), next]
                i++
                break
            case '--exclude-pkg':
                packageOpts.excludePackages = [...(packageOpts.excludePackages ?? []), next]
                i++
                break
            case '--help':
            case '-h':
                printHelp()
                process.exit(0)
        }
    }

    return { importOpts, packageOpts, appConfigOpts, runPackages, runImport, runAppConfig }
}

function loadConfig(rootDir: string): GenImportOptions {
    const configPath = join(rootDir, 'gen-import.config.js')
    if (existsSync(configPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(resolve(configPath)) as GenImportOptions
    }
    return {}
}

function printHelp(): void {
    console.log(`
gen-import — generate barrel files for your Node/TypeScript project

Usage:
  npx gen-import [options]

Source barrel (gen-import.d.ts + gen-import.js):
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: gen-import.d.ts)
  -m, --module-pattern <pat>  Module file pattern deferred to end (default: .module.ts)
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)

Package barrel (gen-package.d.ts + gen-package.js):
  -p, --packages              Also generate gen-package.d.ts from package.json deps
  --packages-only             Only generate the package barrel, skip source barrel
  --pkg-out <filename>        Package barrel output filename (default: gen-package.d.ts)
  --include-pkg <name>        Only include this package (repeatable)
  --exclude-pkg <name>        Exclude this package (repeatable)
  --include-dev               Also include devDependencies in package barrel

Shared:
  --no-js                     Skip generating .js companion files
  -h, --help                  Show this help

App-server config (gen-app-config.d.ts + gen-app-config.js):
  --app-config                Generate a server config that reads only from barrel files
  --app-config-out <filename> Config output filename (default: gen-app-config.d.ts)
  --no-auto-update            Skip auto-appending new source exports to gen-import.d.ts

Config file:
  Place a gen-import.config.js in your project root to set defaults.
  Example:
    module.exports = {
      srcDir: 'src',
      outFileName: 'gen-import.d.ts',
      skipPatterns: ['src/types/', 'src/app.ts'],
      pureReexports: ['src/config/index.ts'],
    }

Output files:
  gen-import.d.ts      TypeScript declaration barrel for your source files
  gen-import.js        JavaScript runtime barrel (CJS or ESM, auto-detected)
  gen-package.d.ts     TypeScript declaration barrel for npm packages
  gen-package.js       JavaScript runtime barrel for npm packages
  gen-app-config.d.ts  Server config — re-exports both barrels, no per-file imports
  gen-app-config.js    JavaScript companion for the server config
`)
}

const { importOpts, packageOpts, appConfigOpts, runPackages, runImport, runAppConfig } =
    parseArgs(process.argv)
const rootDir = resolve(importOpts.rootDir ?? process.cwd())
const fileOpts = loadConfig(rootDir)

if (runImport) {
    genImport({ ...fileOpts, ...importOpts, rootDir })
}

if (runPackages) {
    genPackage({ ...packageOpts, rootDir })
}

if (runAppConfig) {
    genAppConfig({
        ...appConfigOpts,
        rootDir,
        skipPatterns: importOpts.skipPatterns,
        pureReexports: importOpts.pureReexports,
        moduleFilePattern: importOpts.moduleFilePattern,
        generateJs: importOpts.generateJs,
    })
}
