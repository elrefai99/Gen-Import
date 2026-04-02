import ts from 'typescript'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { FileInfo } from '../@types'
import { join, relative } from 'node:path'

export function walk(dir: string): string[] {
     return readdirSync(dir, { withFileTypes: true }).flatMap((e: import('node:fs').Dirent) => {
          const full = join(dir, e.name)
          return e.isDirectory() ? walk(full) : [full]
     })
}

export function detectModuleType(rootDir: string): 'esm' | 'cjs' {
     const pkgPath = join(rootDir, 'package.json')
     if (existsSync(pkgPath)) {
          try {
               const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { type?: string }
               if (pkg.type === 'module') return 'esm'
          } catch {
               // ignore
          }
     }
     return 'cjs'
}

export function detectProjectLanguage(rootDir: string, srcDir: string): 'ts' | 'js' {
     if (existsSync(join(rootDir, 'tsconfig.json'))) return 'ts'
     try {
          const hasTsFile = walk(srcDir).some((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
          if (hasTsFile) return 'ts'
     } catch {
          // srcDir may not exist yet
     }
     return 'js'
}

/** Derive the .js output path from a .d.ts / .ts path */
export function toJsPath(filePath: string): string {
     return filePath.replace(/\.d\.ts$/, '.js').replace(/(?<!\.d)\.ts$/, '.js')
}

export function buildPackageJs(packages: string[], outFileName: string, moduleType: 'esm' | 'cjs',): string {
     const baseName = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
     const lines: string[] = [
          '/**',
          ` * ${baseName}.js — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import --packages',
          ' */',
          '',
     ]

     if (moduleType === 'esm') {
          for (const pkg of packages) {
               lines.push(`export * from '${pkg}';`)
          }
     } else {
          lines.push('"use strict";')
          lines.push('Object.defineProperty(exports, "__esModule", { value: true });')
          lines.push('')
          for (const pkg of packages) {
               const id = pkg.replace(/[^a-zA-Z0-9_$]/g, '_')
               lines.push(`const _${id} = require('${pkg}');`)
               lines.push(
                    `if (_${id} && typeof _${id} === 'object') ` +
                    `Object.keys(_${id}).forEach(function(k) { if (k !== 'default') exports[k] = _${id}[k]; });`,
               )
          }
     }

     lines.push('')
     return lines.join('\n')
}
export function buildPackageDts(packages: string[], outFileName: string, rootDir?: string): string {
     const baseName = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
     const lines: string[] = [
          '/**',
          ` * ${baseName}.d.ts — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import --packages',
          ' */',
          '',
     ]

     if (!rootDir) {
          for (const pkg of packages) {
               lines.push(`export * from '${pkg}';`)
          }
          lines.push('')
          return lines.join('\n')
     }

     // Collect exports per package to detect cross-package name conflicts
     const pkgExports = new Map<string, string[]>()
     for (const pkg of packages) {
          pkgExports.set(pkg, getPackageExportNames(pkg, rootDir))
     }

     // Build a map of name → packages that export it (excluding 'default')
     const nameOwners = new Map<string, string[]>()
     for (const [pkg, names] of pkgExports) {
          for (const name of names) {
               if (name === 'default') continue
               if (!nameOwners.has(name)) nameOwners.set(name, [])
               nameOwners.get(name)!.push(pkg)
          }
     }

     const conflicting = new Set(
          [...nameOwners.entries()]
               .filter(([, owners]) => owners.length > 1)
               .map(([name]) => name),
     )

     const resolved = new Set<string>()

     for (const pkg of packages) {
          const names = pkgExports.get(pkg) ?? []
          const hasConflict = names.some((n) => conflicting.has(n))

          if (!hasConflict) {
               lines.push(`export * from '${pkg}';`)
               continue
          }

          // Emit only non-conflicting named exports from this package
          const safe = names.filter((n) => n !== 'default' && !conflicting.has(n))
          if (safe.length) {
               lines.push(`export { ${safe.join(', ')} } from '${pkg}';`)
          }

          // First-seen package wins each conflicting name
          const win = names.filter((n) => n !== 'default' && conflicting.has(n) && !resolved.has(n))
          if (win.length) {
               lines.push(`export { ${win.join(', ')} } from '${pkg}';`)
               win.forEach((n) => resolved.add(n))
          }
     }

     lines.push('')
     return lines.join('\n')
}

export function readPreviousExports(outFile: string): Set<string> {
     if (!existsSync(outFile)) return new Set()
     const content = readFileSync(outFile, 'utf-8')
     const names = new Set<string>()
     for (const line of content.split('\n')) {
          const block = line.match(/^export\s+(?:type\s+)?\{([^}]+)\}/)
          if (block) {
               for (const part of block[1].split(',')) {
                    const name = part.trim().replace(/^.*\s+as\s+/, '')
                    if (name) names.add(name)
               }
          }
     }
     return names
}

export function analyzeFiles(files: string[], rootDir: string, srcDir: string): FileInfo[] {
     const cfgPath = join(rootDir, 'tsconfig.json')
     const cfgFile = ts.readConfigFile(cfgPath, ts.sys.readFile)
     const { options } = ts.parseJsonConfigFileContent(cfgFile.config, ts.sys, rootDir)

     const program = ts.createProgram(files, options)
     const checker = program.getTypeChecker()

     return files.flatMap((file): FileInfo[] => {
          const sf = program.getSourceFile(file)
          if (!sf) return []

          const mod = checker.getSymbolAtLocation(sf)
          if (!mod) return []

          const types: string[] = []
          const values: string[] = []
          let hasDefault = false

          for (const sym of checker.getExportsOfModule(mod)) {
               const name = sym.getName()

               if (name === 'default') {
                    hasDefault = true
                    continue
               }

               const f = sym.getFlags()
               const isTypeOnly =
                    !!(f & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) &&
                    !(f & ts.SymbolFlags.Value)

               isTypeOnly ? types.push(name) : values.push(name)
          }

          if (!types.length && !values.length && !hasDefault) return []

          const rel = relative(srcDir, file)
               .replace(/\\/g, '/')
               .replace(/(?:\.d)?\.ts$/, '')
               .replace(/\/index$/, '')

          const lastSegment = rel.split('/').pop()!.replace(/[^a-zA-Z0-9_$]/g, '_')
          const defaultAlias = hasDefault ? lastSegment || null : null

          return [{ importPath: `./${rel}`, types, values, defaultAlias }]
     })
}

export function buildDtsOutput(infos: FileInfo[], outFileName: string): string {
     const seen = new Set<string>()

     const lines: string[] = [
          '/**',
          ` * ${outFileName} — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import',
          ' */',
          '',
     ]

     for (const { importPath, types, values, defaultAlias } of infos) {
          const t = types.filter((n) => !seen.has(n))
          const v = values.filter((n) => !seen.has(n))

          t.forEach((n) => seen.add(n))
          v.forEach((n) => seen.add(n))

          if (t.length) lines.push(`export type { ${t.join(', ')} } from '${importPath}';`)
          if (v.length) lines.push(`export { ${v.join(', ')} } from '${importPath}';`)

          if (defaultAlias && !seen.has(defaultAlias)) {
               seen.add(defaultAlias)
               lines.push(`export { default as ${defaultAlias} } from '${importPath}';`)
          }
     }

     lines.push('')
     return lines.join('\n')
}

export function buildJsOutput(
     infos: FileInfo[],
     outFileName: string,
     moduleType: 'esm' | 'cjs',
): string {
     const seen = new Set<string>()
     const baseName = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')

     const lines: string[] = [
          '/**',
          ` * ${baseName}.js — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import',
          ' */',
          '',
     ]

     if (moduleType === 'cjs') {
          lines.push('"use strict";')
          lines.push('Object.defineProperty(exports, "__esModule", { value: true });')
          lines.push('')
     }

     for (const { importPath, values, defaultAlias } of infos) {
          const v = values.filter((n) => !seen.has(n))
          v.forEach((n) => seen.add(n))

          const hasDefault = defaultAlias && !seen.has(defaultAlias)
          if (hasDefault) seen.add(defaultAlias!)

          if (moduleType === 'esm') {
               const named = [...v, ...(hasDefault ? [`default as ${defaultAlias}`] : [])]
               if (named.length) lines.push(`export { ${named.join(', ')} } from '${importPath}';`)
          } else {
               // CJS
               if (v.length || hasDefault) {
                    const destructured = [
                         ...v,
                         ...(hasDefault ? [`default: ${defaultAlias}`] : []),
                    ].join(', ')
                    lines.push(`const { ${destructured} } = require('${importPath}');`)
                    const exported = [...v, ...(hasDefault ? [defaultAlias!] : [])].join(', ')
                    lines.push(`Object.assign(exports, { ${exported} });`)
               }
          }
     }

     lines.push('')
     return lines.join('\n')
}

export function getPackageExportNames(pkgName: string, rootDir: string): string[] {
     try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resolutionKind = (ts.ModuleResolutionKind as any).NodeJs ?? 2
          const result = ts.resolveModuleName(
               pkgName,
               join(rootDir, '__dummy__.ts'),
               { moduleResolution: resolutionKind },
               ts.sys,
          )
          const dtsPath = result.resolvedModule?.resolvedFileName
          if (!dtsPath || !existsSync(dtsPath)) return []

          const program = ts.createProgram([dtsPath], { moduleResolution: resolutionKind })
          const checker = program.getTypeChecker()
          const sf = program.getSourceFile(dtsPath)
          if (!sf) return []

          const mod = checker.getSymbolAtLocation(sf)
          if (!mod) return []

          return checker.getExportsOfModule(mod).map((s) => s.getName())
     } catch {
          return []
     }
}

export function packageUsesExportEquals(pkgName: string, rootDir: string): boolean {
     try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resolutionKind = (ts.ModuleResolutionKind as any).NodeJs ?? 2
          const result = ts.resolveModuleName(
               pkgName,
               join(rootDir, '__dummy__.ts'),
               { moduleResolution: resolutionKind },
               ts.sys,
          )
          const dtsPath = result.resolvedModule?.resolvedFileName
          if (!dtsPath || !existsSync(dtsPath)) return false
          const content = readFileSync(dtsPath, 'utf-8')
          return /^\s*export\s*=/m.test(content)
     } catch {
          return false
     }
}

export function filterCompatiblePackages(
     packages: string[],
     rootDir: string,
): { compatible: string[]; skipped: string[] } {
     const compatible: string[] = []
     const skipped: string[] = []
     for (const pkg of packages) {
          if (packageUsesExportEquals(pkg, rootDir)) {
               skipped.push(pkg)
          } else {
               compatible.push(pkg)
          }
     }
     return { compatible, skipped }
}

export function parseBarrelExports(filePath: string): Set<string> {
     const names = new Set<string>()
     if (!existsSync(filePath)) return names

     for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
          if (/^export\s+\*\s+from/.test(line)) {
               names.add('*')
               continue
          }
          const block = line.match(/^export\s+(?:type\s+)?\{([^}]+)\}/)
          if (block) {
               for (const part of block[1].split(',')) {
                    const name = part.trim().replace(/^.*\s+as\s+/, '').trim()
                    if (name) names.add(name)
               }
          }
     }
     return names
}
