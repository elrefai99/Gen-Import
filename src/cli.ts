#!/usr/bin/env node
import { genImport, genAppConfig } from './index'
import { genExportMap } from './core/export-map'
import { watchSrc } from './core/watch'
import { startStudio } from './studio'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { CliArgs, ExportMapFormat, ExportMapOptions, GenAppConfigOptions, GenImportOptions, StrictMode, StudioOptions } from './@types'

function parseArgs(argv: string[]): CliArgs {
    const importOpts: GenImportOptions = {}
    const appConfigOpts: GenAppConfigOptions = {}
    const exportMapOpts: ExportMapOptions = {}
    const studioOpts: StudioOptions = {}
    let runImport = true
    let runAppConfig = false
    let runExportMap = false
    let runStudio = false
    const args = argv.slice(2)

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        const next = args[i + 1]

        if (arg === 'studio') {
            runStudio = true
            runImport = false
            continue
        }

        if (arg.startsWith('--strict=')) {
            importOpts.strict = arg.slice('--strict='.length) as StrictMode
            continue
        }

        switch (arg) {
            case '--root':
            case '-r':
                importOpts.rootDir = next
                studioOpts.rootDir = next
                i++
                break
            case '--src':
            case '-s':
                importOpts.srcDir = next
                appConfigOpts.srcDir = next
                studioOpts.srcDir = next
                i++
                break
            case '--out':
            case '-o':
                importOpts.outFileName = next
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
            case '--globals':
            case '-g':
                importOpts.globals = true
                break
            case '--strict':
                importOpts.strict = 'all'
                break
            case '--safe-barrels':
                importOpts.safeBarrels = true
                break
            case '--strict-cycles':
                importOpts.strictCycles = true
                break
            case '--no-topo-sort':
                importOpts.noTopoSort = true
                break
            case '--no-js':
                importOpts.generateJs = false
                break
            case '--lazy':
                importOpts.lazy = true
                break
            case '--no-lazy':
                importOpts.lazy = false
                break
            case '--watch':
            case '-w':
                importOpts.watch = true
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
            case '--help':
            case '-h':
                printHelp()
                process.exit(0)
            case '--map':
                runExportMap = true
                break
            case '--map-format':
                exportMapOpts.format = next as ExportMapFormat
                i++
                break
            case '--map-out':
                exportMapOpts.outFile = next
                i++
                break
            case '--no-imports':
                exportMapOpts.includeImports = false
                break
            case '--port': {
                const port = Number(next)
                if (!Number.isInteger(port) || port < 0 || port > 65535) {
                    throw new Error(`Invalid port: ${next}`)
                }
                studioOpts.port = port
                i++
                break
            }
            case '--host':
                studioOpts.host = next
                i++
                break
            case '--no-open':
                studioOpts.open = false
                break
        }
    }

    return { importOpts, appConfigOpts, exportMapOpts, studioOpts, runImport, runAppConfig, runExportMap, runStudio }
}

function loadConfig(rootDir: string): GenImportOptions {
    for (const name of ['gen-import.config.cjs', 'gen-import.config.js']) {
        const configPath = join(rootDir, name)
        if (existsSync(configPath)) {
            return require(resolve(configPath)) as GenImportOptions
        }
    }
    return {}
}

function printHelp(): void {
    console.log(`
gen-import — generate barrel files for your Node/TypeScript project

Usage:
  npx gen-import [options]
  npx gen-import studio [options]

Studio (interactive import/export explorer):
  studio                      Start Studio, watch the project, and open the browser
  --port <port>               Preferred port (default: 3000; finds a free port if busy)
  --host <host>               Bind host (default: 127.0.0.1)
  --no-open                   Do not open the default browser

Source barrel (gen-import.ts for TS projects, gen-import.js for JS projects):
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: auto-detected)
  -m, --module-pattern <pat>  Module file pattern deferred to end (default: .module.ts)
  -g, --globals               Register all exports on Node.js global (no per-file imports needed)
  --safe-barrels              Withhold exports that would put the barrel inside a dependency cycle
                              (types are kept — they are erased before runtime; dropped value
                              exports are reported with the direct-import line to use instead)
  --strict[=<mode>]           Exit 1 on blocking findings. mode: cycles | barrels | collisions | all
                              (default all). cycles=GI001, barrels=GI002/GI004, collisions=GI006
  --strict-cycles             Deprecated alias for --strict=cycles
  --no-topo-sort              Skip topological sort and use alphabetical order (legacy behaviour)
  --lazy                      Force lazy re-exports to prevent circular-dep errors (default for CJS; CJS-only, ignored with a warning on ESM)
  --no-lazy                   Force static re-exports (default for ESM)
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)
  -w, --watch                 Watch src and auto-regenerate barrels on every change

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
      outFileName: 'gen-import.ts',  // or gen-import.js for JS projects
      skipPatterns: ['src/types/', 'src/app.ts'],
      pureReexports: ['src/config/index.ts'],
    }

Output files:
  gen-import.ts        TypeScript source barrel (TS projects — importable by tsx/ts-node)
  gen-import.js        JavaScript runtime barrel (JS projects, or TS with --no-js disabled)
  gen-import.d.ts      Type companion written alongside gen-import.js (JS projects only)
  gen-app-config.d.ts  Server config — re-exports the source barrel, no per-file imports
  gen-app-config.js    JavaScript companion for the server config
  (with --globals: gen-import.ts/.js also registers all exports on Node.js global)

Export map (visualization):
  --map                       Generate export map visualization
  --map-format <fmt>          Output format: console (default), json, mermaid
  --map-out <file>            Write map to file instead of stdout
  --no-imports                Skip import relationship analysis (exports only)
`)
}

const { importOpts, appConfigOpts, exportMapOpts, studioOpts, runImport, runAppConfig, runExportMap, runStudio } =
    parseArgs(process.argv)
const rootDir = resolve(importOpts.rootDir ?? process.cwd())
const fileOpts = loadConfig(rootDir)

function runAll(): void {
    if (runImport) {
        genImport({ ...fileOpts, ...importOpts, rootDir })
    }

    if (runAppConfig) {
        const mergedSkip = [
            ...(fileOpts.skipPatterns ?? []),
            ...(importOpts.skipPatterns ?? []),
        ]
        const mergedPure = [
            ...(fileOpts.pureReexports ?? []),
            ...(importOpts.pureReexports ?? []),
        ]
        genAppConfig({
            ...appConfigOpts,
            rootDir,
            skipPatterns: mergedSkip.length ? mergedSkip : undefined,
            pureReexports: mergedPure.length ? mergedPure : undefined,
            moduleFilePattern: importOpts.moduleFilePattern ?? fileOpts.moduleFilePattern,
            generateJs: importOpts.generateJs,
        })
    }

    if (runExportMap) {
        genExportMap({
            ...exportMapOpts,
            rootDir,
            skipPatterns: importOpts.skipPatterns,
            pureReexports: importOpts.pureReexports,
            moduleFilePattern: typeof importOpts.moduleFilePattern === 'string'
                ? importOpts.moduleFilePattern
                : undefined,
        })
    }
}

if (runStudio) {
    void startStudio({ ...studioOpts, rootDir }).catch((error: unknown) => {
        console.error(`Failed to start Gen Import Studio: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
    })
} else {
    runAll()
}

if (!runStudio && (importOpts.watch ?? fileOpts.watch)) {
    const srcDir = resolve(rootDir, importOpts.srcDir ?? fileOpts.srcDir ?? 'src')
    watchSrc({
        srcDir,
        ignore: ['gen-import', 'gen-app-config', 'gen-package'],
        onChange: runAll,
    })
}
