#!/usr/bin/env node
import { genImport, GenImportOptions } from './index'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

function parseArgs(argv: string[]): GenImportOptions {
     const opts: GenImportOptions = {}
     const args = argv.slice(2)

     for (let i = 0; i < args.length; i++) {
          const arg = args[i]
          const next = args[i + 1]

          switch (arg) {
               case '--root':
               case '-r':
                    opts.rootDir = next; i++; break
               case '--src':
               case '-s':
                    opts.srcDir = next; i++; break
               case '--out':
               case '-o':
                    opts.outFileName = next; i++; break
               case '--module-pattern':
               case '-m':
                    opts.moduleFilePattern = next; i++; break
               case '--skip':
                    opts.skipPatterns = [...(opts.skipPatterns ?? []), next]; i++; break
               case '--pure-reexport':
                    opts.pureReexports = [...(opts.pureReexports ?? []), next]; i++; break
               case '--help':
               case '-h':
                    printHelp(); process.exit(0)
          }
     }

     return opts
}

function loadConfig(rootDir: string): GenImportOptions {
     const configPath = join(rootDir, 'gen-import.config.js')
     if (existsSync(configPath)) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require(resolve(configPath))
     }
     return {}
}

function printHelp(): void {
     console.log(`
gen-import — generate a TypeScript barrel file for your Express project

Usage:
  npx gen-import [options]

Options:
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: the-import.ts)
  -m, --module-pattern <pat>  Module file pattern deferred to end (default: .module.ts)
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)
  -h, --help                  Show this help

Config file:
  Place a gen-import.config.js in your project root to set defaults.
  Example:
    module.exports = {
      srcDir: 'src',
      outFileName: 'the-import.ts',
      skipPatterns: ['src/types/', 'src/app.ts'],
      pureReexports: ['src/config/index.ts'],
    }
`)
}

const cliOpts = parseArgs(process.argv)
const rootDir = resolve(cliOpts.rootDir ?? process.cwd())
const fileOpts = loadConfig(rootDir)

genImport({ ...fileOpts, ...cliOpts, rootDir })
