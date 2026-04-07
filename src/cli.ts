#!/usr/bin/env node
import { genImport, genAppConfig } from './index'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CliArgs, GenAppConfigOptions, GenImportOptions } from './@types'

function parseArgs(argv: string[]): CliArgs {
    const importOpts: GenImportOptions = {}
    const appConfigOpts: GenAppConfigOptions = {}
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
                i++
                break
            case '--src':
            case '-s':
                importOpts.srcDir = next
                appConfigOpts.srcDir = next
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
            case '--strict-cycles':
                importOpts.strictCycles = true
                break
            case '--no-topo-sort':
                importOpts.noTopoSort = true
                break
            case '--no-js':
                importOpts.generateJs = false
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
        }
    }

    return { importOpts, appConfigOpts, runImport, runAppConfig }
}

function loadConfig(rootDir: string): GenImportOptions {
    // .cjs is tried first so ESM projects can always provide a CJS config.
    for (const name of ['gen-import.config.cjs', 'gen-import.config.js']) {
        const configPath = join(rootDir, name)
        if (existsSync(configPath)) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
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

Source barrel (gen-import.ts for TS projects, gen-import.js for JS projects):
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: auto-detected)
  -m, --module-pattern <pat>  Module file pattern deferred to end (default: .module.ts)
  -g, --globals               Register all exports on Node.js global (no per-file imports needed)
  --strict-cycles             Exit with code 1 if circular dependencies are detected (useful in CI)
  --no-topo-sort              Skip topological sort and use alphabetical order (legacy behaviour)
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)

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
`)
}

const { importOpts, appConfigOpts, runImport, runAppConfig } =
    parseArgs(process.argv)
const rootDir = resolve(importOpts.rootDir ?? process.cwd())
const fileOpts = loadConfig(rootDir)

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
