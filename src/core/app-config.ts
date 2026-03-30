import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { walk, detectModuleType, detectProjectLanguage, toJsPath, analyzeFiles, buildJsOutput, parseBarrelExports } from '../script'
import { DEFAULT_MODULE_FILE_PATTERN, DEFAULT_SKIP_PATTERNS } from '..'
import { GenAppConfigOptions } from '../@types'

export function genAppConfig(options: GenAppConfigOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const outFileName = options.outFileName ?? 'gen-app-config.d.ts'
     const outFile = join(srcDir, outFileName)
     const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
     // Mirror the same default that genImport() uses so auto-update finds the right file
     const genImportFileName = options.genImportFile ?? (isTs ? 'gen-import.ts' : 'gen-import.js')
     const genPackageFileName = options.genPackageFile ?? (isTs ? 'gen-package.ts' : 'gen-package.js')
     const genImportPath = join(srcDir, genImportFileName)
     const genPackagePath = join(srcDir, genPackageFileName)
     const autoUpdate = options.autoUpdate ?? true
     const generateJs = options.generateJs ?? !isTs
     const moduleType = detectModuleType(rootDir)
     const moduleFilePattern = options.moduleFilePattern ?? DEFAULT_MODULE_FILE_PATTERN
     const pureReexports = new Set(options.pureReexports ?? [])
     const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

     if (autoUpdate && existsSync(genImportPath)) {
          const knownExports = parseBarrelExports(genImportPath)

          function shouldSkip(file: string): boolean {
               if (file.endsWith('.d.ts')) return true
               if (!file.endsWith('.ts')) return true
               // Always skip the barrel files themselves to prevent circular exports
               if (file === genImportPath || file === genPackagePath || file === outFile) return true
               const rel = relative(rootDir, file).replace(/\\/g, '/')
               if (pureReexports.has(rel)) return true
               return skipPatterns.some((p) => rel.includes(p))
          }

          const allFiles = walk(srcDir).filter((f) => !shouldSkip(f)).sort()
          const regularFiles = allFiles.filter((f) => !f.includes(moduleFilePattern))
          const moduleFiles = allFiles.filter((f) => f.includes(moduleFilePattern))
          const allInfos = analyzeFiles([...regularFiles, ...moduleFiles], rootDir, srcDir)

          // Collect only the exports not yet present in gen-import.d.ts
          const appendLines: string[] = []
          let newCount = 0

          for (const { importPath, types, values, defaultAlias } of allInfos) {
               const newTypes = types.filter((n) => !knownExports.has(n))
               const newValues = values.filter((n) => !knownExports.has(n))
               const newDefault =
                    defaultAlias && !knownExports.has(defaultAlias) ? defaultAlias : null

               if (newTypes.length) {
                    appendLines.push(`export type { ${newTypes.join(', ')} } from '${importPath}';`)
                    newCount += newTypes.length
               }
               if (newValues.length) {
                    appendLines.push(`export { ${newValues.join(', ')} } from '${importPath}';`)
                    newCount += newValues.length
               }
               if (newDefault) {
                    appendLines.push(
                         `export { default as ${newDefault} } from '${importPath}';`,
                    )
                    newCount++
               }
          }

          if (appendLines.length) {
               const existing = readFileSync(genImportPath, 'utf-8').trimEnd()
               writeFileSync(
                    genImportPath,
                    existing + '\n' + appendLines.join('\n') + '\n',
                    'utf-8',
               )
               console.log(
                    `✓  ${relative(rootDir, genImportPath)} (auto-updated: +${newCount} new exports)`,
               )

               // Regenerate the .js companion for gen-import so it stays in sync
               if (generateJs) {
                    const jsFile = toJsPath(genImportPath)
                    if (existsSync(jsFile)) {
                         writeFileSync(
                              jsFile,
                              buildJsOutput(allInfos, genImportFileName, moduleType),
                              'utf-8',
                         )
                         console.log(`✓  ${relative(rootDir, jsFile)} (auto-updated)`)
                    }
               }
          }
     }

     const hasGenImport = existsSync(genImportPath)
     const hasGenPackage = existsSync(genPackagePath)
     const genImportBase = genImportFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
     const genPackageBase = genPackageFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
     const configBase = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')

     const dtsLines: string[] = [
          '/**',
          ` * ${configBase}.d.ts — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import --app-config',
          ' * Imports only from barrel files — no per-file imports.',
          ' */',
          '',
     ]
     if (hasGenImport) dtsLines.push(`export * from './${genImportBase}';`)
     if (hasGenPackage) dtsLines.push(`export * from './${genPackageBase}';`)
     dtsLines.push('')

     writeFileSync(outFile, dtsLines.join('\n'), 'utf-8')
     console.log(`✓  ${relative(rootDir, outFile)}`)

     if (generateJs) {
          const jsFile = toJsPath(outFile)
          const jsLines: string[] = [
               '/**',
               ` * ${configBase}.js — AUTO-GENERATED, do not edit manually.`,
               ' * Regenerate: npx gen-import --app-config',
               ' * Imports only from barrel files — no per-file imports.',
               ' */',
               '',
          ]

          if (moduleType === 'esm') {
               if (hasGenImport) jsLines.push(`export * from './${genImportBase}.js';`)
               if (hasGenPackage) jsLines.push(`export * from './${genPackageBase}.js';`)
          } else {
               jsLines.push('"use strict";')
               jsLines.push('Object.defineProperty(exports, "__esModule", { value: true });')
               jsLines.push('')
               if (hasGenImport) {
                    jsLines.push(`const _gi = require('./${genImportBase}.js');`)
                    jsLines.push(
                         `if (_gi && typeof _gi === 'object') ` +
                         `Object.keys(_gi).forEach(function(k) { if (k !== 'default') exports[k] = _gi[k]; });`,
                    )
               }
               if (hasGenPackage) {
                    jsLines.push(`const _gp = require('./${genPackageBase}.js');`)
                    jsLines.push(
                         `if (_gp && typeof _gp === 'object') ` +
                         `Object.keys(_gp).forEach(function(k) { if (k !== 'default') exports[k] = _gp[k]; });`,
                    )
               }
          }
          jsLines.push('')

          writeFileSync(jsFile, jsLines.join('\n'), 'utf-8')
          console.log(`✓  ${relative(rootDir, jsFile)}`)
     }

     const barrels = [
          hasGenImport ? genImportFileName : null,
          hasGenPackage ? genPackageFileName : null,
     ]
          .filter(Boolean)
          .join(', ')
     console.log(`   barrel sources: ${barrels || '(none found)'} · module: ${moduleType}`)
}
