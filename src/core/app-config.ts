import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { walk, detectModuleType, detectProjectLanguage, toJsPath, analyzeFiles, buildJsOutput, parseBarrelExports } from '../script'
import { DEFAULT_MODULE_FILE_PATTERN, DEFAULT_SKIP_PATTERNS } from '..'
import { GenAppConfigOptions } from '../@types'

export function genAppConfig(options: GenAppConfigOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
     const outFileName = options.outFileName ?? (isTs ? 'gen-app-config.ts' : 'gen-app-config.js')
     const outFile = join(srcDir, outFileName)
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
     const genImportBase = genImportFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '').replace(/\.js$/, '')
     const genPackageBase = genPackageFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '').replace(/\.js$/, '')
     const configBase = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '').replace(/\.js$/, '')

     // For JS projects: also write a .d.ts companion so editors get types
     const writeTypeDecl = !isTs && !outFileName.endsWith('.d.ts')

     // Source-compatible content — valid in both .ts and .d.ts
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
          if (hasGenPackage) lines.push(`export * from './${genPackageBase}';`)
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
               if (hasGenPackage) lines.push(`export * from './${genPackageBase}.js';`)
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
               if (hasGenPackage) {
                    lines.push(`const _gp = require('./${genPackageBase}.js');`)
                    lines.push(
                         `if (_gp && typeof _gp === 'object') ` +
                         `Object.keys(_gp).forEach(function(k) { if (k !== 'default') exports[k] = _gp[k]; });`,
                    )
               }
          }
          lines.push('')
          return lines.join('\n')
     }

     // Main output:
     //   TS projects → .ts source file (importable by ts-node / tsx / tsc)
     //   JS projects → .js runtime file
     if (isTs) {
          writeFileSync(outFile, buildBarrel(`${configBase}.ts`), 'utf-8')
     } else {
          writeFileSync(outFile, buildJsBarrel(), 'utf-8')
     }
     console.log(`✓  ${relative(rootDir, outFile)}`)

     // JS projects: write a .d.ts type companion so TypeScript IDEs get types
     if (writeTypeDecl) {
          const dtsFile = outFile.replace(/\.js$/, '.d.ts')
          writeFileSync(dtsFile, buildBarrel(`${configBase}.d.ts`), 'utf-8')
          console.log(`✓  ${relative(rootDir, dtsFile)}`)
     }

     // TS projects with explicit generateJs: also write a .js runtime companion
     if (isTs && generateJs) {
          const jsFile = toJsPath(outFile)
          writeFileSync(jsFile, buildJsBarrel(), 'utf-8')
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
