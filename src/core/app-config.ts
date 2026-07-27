import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { walk, detectModuleType, detectProjectLanguage, toJsPath, analyzeFiles, buildJsOutput, parseBarrelExports, createTsProgram, buildDepGraph, topoSort, buildDtsOutput, buildLazyDtsOutput, buildGlobalDtsOutput, buildLazyGlobalDtsOutput } from '../script'
import { DEFAULT_MODULE_FILE_PATTERNS, DEFAULT_SKIP_PATTERNS } from '..'
import { GenAppConfigOptions } from '../@types'

export function genAppConfig(options: GenAppConfigOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
     const outFileName = options.outFileName ?? (isTs ? 'gen-app-config.ts' : 'gen-app-config.js')
     const outFile = join(srcDir, outFileName)
     const genImportFileName = options.genImportFile ?? (isTs ? 'gen-import.ts' : 'gen-import.js')
     const genImportPath = join(srcDir, genImportFileName)
     const autoUpdate = options.autoUpdate ?? true
     const generateJs = options.generateJs ?? !isTs
     const moduleType = detectModuleType(rootDir)
     const moduleFilePatterns = options.moduleFilePattern
          ? (Array.isArray(options.moduleFilePattern) ? options.moduleFilePattern : [options.moduleFilePattern])
          : DEFAULT_MODULE_FILE_PATTERNS
     const pureReexports = new Set(options.pureReexports ?? [])
     const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

     if (autoUpdate && isTs && existsSync(genImportPath)) {
          const knownExports = parseBarrelExports(genImportPath)

          function shouldSkip(file: string): boolean {
               if (file.endsWith('.d.ts')) return true
               if (!file.endsWith('.ts')) return true
               if (file === genImportPath || file === outFile) return true
               const rel = relative(rootDir, file).replace(/\\/g, '/')
               if (pureReexports.has(rel)) return true
               return skipPatterns.some((p) => rel.includes(p))
          }

          const allFiles = walk(srcDir).filter((f) => !shouldSkip(f)).sort()
          const regularFiles = allFiles.filter((f) => !moduleFilePatterns.some((p) => f.includes(p)))
          const moduleFiles = allFiles.filter((f) => moduleFilePatterns.some((p) => f.includes(p)))
          const orderedFiles = [...regularFiles, ...moduleFiles]

          const program = createTsProgram(orderedFiles, rootDir)
          const allInfos = analyzeFiles(orderedFiles, rootDir, srcDir, program)

          const graph = buildDepGraph(orderedFiles, program)
          const sortedPaths = topoSort(orderedFiles, graph)
          const pathIndex = new Map(sortedPaths.map((p, i) => [p, i]))
          const sortedInfos = [...allInfos].sort((a, b) => {
               const ai = pathIndex.get(a.absolutePath) ?? Infinity
               const bi = pathIndex.get(b.absolutePath) ?? Infinity
               return ai - bi
          })

          const currentNames = new Set(
               sortedInfos.flatMap((i) => [...i.types, ...i.values, ...(i.defaultAlias ? [i.defaultAlias] : [])]),
          )
          const added = [...currentNames].filter((n) => !knownExports.has(n))
          const removed = [...knownExports].filter((n) => n !== '*' && !currentNames.has(n))

          if (added.length || removed.length) {
               const existing = readFileSync(genImportPath, 'utf-8')
               const wasLazy = existing.includes("Object.defineProperty(exports, '")
               const wasGlobals = existing.includes('declare global') || existing.includes('Object.assign(global')
               const content = wasGlobals
                    ? (wasLazy
                         ? buildLazyGlobalDtsOutput(sortedInfos, genImportFileName)
                         : buildGlobalDtsOutput(sortedInfos, genImportFileName))
                    : (wasLazy
                         ? buildLazyDtsOutput(sortedInfos, genImportFileName)
                         : buildDtsOutput(sortedInfos, genImportFileName))
               writeFileSync(genImportPath, content, 'utf-8')

               const parts = [
                    added.length ? `+${added.length} new` : null,
                    removed.length ? `-${removed.length} stale` : null,
               ].filter(Boolean).join(', ')
               console.log(
                    `✓  ${relative(rootDir, genImportPath)} (auto-updated: ${parts})`,
               )

               if (generateJs) {
                    const jsFile = toJsPath(genImportPath)
                    if (existsSync(jsFile)) {
                         writeFileSync(
                              jsFile,
                              buildJsOutput(sortedInfos, genImportFileName, moduleType),
                              'utf-8',
                         )
                         console.log(`✓  ${relative(rootDir, jsFile)} (auto-updated)`)
                    }
               }
          }
     }

     const hasGenImport = existsSync(genImportPath)
     const genImportBase = genImportFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '').replace(/\.js$/, '')
     const configBase = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '').replace(/\.js$/, '')

     const writeTypeDecl = !isTs && !outFileName.endsWith('.d.ts')

     const buildBarrel = (label: string): string => {
          const lines: string[] = [
               '/**',
               ` * ${label} — AUTO-GENERATED, do not edit manually.`,
               ' * Regenerate: npx gen-import --app-config',
               ' * Imports only from barrel files — no per-file imports.',
               ' */',
               '',
          ]
          if (hasGenImport) lines.push(`export * from './${genImportBase}';`)
          lines.push('')
          return lines.join('\n')
     }

     // Runtime JS content (used for JS projects or explicit generateJs on TS projects)
     const buildJsBarrel = (): string => {
          const lines: string[] = [
               '/**',
               ` * ${configBase}.js — AUTO-GENERATED, do not edit manually.`,
               ' * Regenerate: npx gen-import --app-config',
               ' * Imports only from barrel files — no per-file imports.',
               ' */',
               '',
          ]
          if (moduleType === 'esm') {
               if (hasGenImport) lines.push(`export * from './${genImportBase}.js';`)
          } else {
               lines.push('"use strict";')
               lines.push('Object.defineProperty(exports, "__esModule", { value: true });')
               lines.push('')
               if (hasGenImport) {
                    lines.push(`const _gi = require('./${genImportBase}.js');`)
                    lines.push(
                         `if (_gi && typeof _gi === 'object') ` +
                         `Object.keys(_gi).forEach(function(k) { if (k !== 'default') exports[k] = _gi[k]; });`,
                    )
               }
          }
          lines.push('')
          return lines.join('\n')
     }

     if (isTs) {
          writeFileSync(outFile, buildBarrel(`${configBase}.ts`), 'utf-8')
     } else {
          writeFileSync(outFile, buildJsBarrel(), 'utf-8')
     }
     console.log(`✓  ${relative(rootDir, outFile)}`)

     if (writeTypeDecl) {
          const dtsFile = outFile.replace(/\.js$/, '.d.ts')
          writeFileSync(dtsFile, buildBarrel(`${configBase}.d.ts`), 'utf-8')
          console.log(`✓  ${relative(rootDir, dtsFile)}`)
     }

     if (isTs && generateJs) {
          const jsFile = toJsPath(outFile)
          writeFileSync(jsFile, buildJsBarrel(), 'utf-8')
          console.log(`✓  ${relative(rootDir, jsFile)}`)
     }

     const barrels = hasGenImport ? genImportFileName : null
     console.log(`   barrel sources: ${barrels ?? '(none found)'} · module: ${moduleType}`)
}
