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


/**
 * Like buildDtsOutput but also registers value exports on Node.js global.
 * Import the generated file once in your app entry point — all exports become
 * available everywhere without per-file imports.
 */
export function buildGlobalDtsOutput(infos: FileInfo[], outFileName: string): string {
     const seenTypes = new Set<string>()
     const seenValues = new Set<string>()

     const lines: string[] = [
          '/**',
          ` * ${outFileName} — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import --globals',
          ' *',
          " * Import once in your entry point: import './gen-import'",
          ' * After that, all exports are available as globals — no per-file imports needed.',
          ' */',
          '',
     ]

     // Collect per-file import groups.
     // Values are imported with a _ prefix alias to break the circular type reference:
     //   `var foo: typeof foo` inside declare global resolves to itself (TS2502).
     //   `var foo: typeof _foo` resolves to the local import — no circularity.
     const typeReexports: string[] = []
     const valueImports: string[] = []
     const allValueNames: string[] = []   // original names (for export / Object.assign)
     const allAliasNames: string[] = []   // _ prefixed (for declare global typeof)

     for (const { importPath, types, values, defaultAlias } of infos) {
          const t = types.filter((n) => !seenTypes.has(n) && !seenValues.has(n))
          const v = values.filter((n) => !seenValues.has(n) && !seenTypes.has(n))
          t.forEach((n) => seenTypes.add(n))
          v.forEach((n) => seenValues.add(n))

          const hasDefault = defaultAlias && !seenValues.has(defaultAlias)
          if (hasDefault) seenValues.add(defaultAlias!)

          if (t.length) typeReexports.push(`export type { ${t.join(', ')} } from '${importPath}';`)

          const importNames = [
               ...v.map((n) => `${n} as _${n}`),
               ...(hasDefault ? [`default as _${defaultAlias}`] : []),
          ]
          if (importNames.length) {
               valueImports.push(`import { ${importNames.join(', ')} } from '${importPath}';`)
               allValueNames.push(...v, ...(hasDefault ? [defaultAlias!] : []))
               allAliasNames.push(...v.map((n) => `_${n}`), ...(hasDefault ? [`_${defaultAlias!}`] : []))
          }
     }

     lines.push(...typeReexports)
     if (typeReexports.length && valueImports.length) lines.push('')
     lines.push(...valueImports)

     if (allValueNames.length) {
          // export { _foo as foo }
          const exportPairs = allValueNames.map((n, i) => `${allAliasNames[i]} as ${n}`)
          lines.push('')
          lines.push(`export { ${exportPairs.join(', ')} };`)
          // Object.assign with original names: { foo: _foo }
          const assignPairs = allValueNames.map((n, i) => `${n}: ${allAliasNames[i]}`)
          lines.push('')
          lines.push(`Object.assign(global as any, { ${assignPairs.join(', ')} });`)
          lines.push('')
          lines.push('declare global {')
          for (let i = 0; i < allValueNames.length; i++) {
               lines.push(`  var ${allValueNames[i]}: typeof ${allAliasNames[i]}`)
          }
          lines.push('}')
     }

     lines.push('')
     return lines.join('\n')
}

/**
 * Like buildJsOutput but also registers value exports on Node.js global.
 */
export function buildGlobalJsOutput(
     infos: FileInfo[],
     outFileName: string,
     moduleType: 'esm' | 'cjs',
): string {
     const seen = new Set<string>()
     const baseName = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
     const allValueNames: string[] = []

     const lines: string[] = [
          '/**',
          ` * ${baseName}.js — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import --globals',
          ' */',
          '',
     ]

     if (moduleType === 'cjs') {
          lines.push('"use strict";')
          lines.push('Object.defineProperty(exports, "__esModule", { value: true });')
          lines.push('')

          for (const { importPath, values, defaultAlias } of infos) {
               const v = values.filter((n) => !seen.has(n))
               v.forEach((n) => seen.add(n))
               const hasDefault = defaultAlias && !seen.has(defaultAlias)
               if (hasDefault) seen.add(defaultAlias!)

               if (!v.length && !hasDefault) continue

               // Lazy getters to avoid circular-dependency undefined at init time
               for (const name of v) {
                    lines.push(`Object.defineProperty(exports, '${name}', { get: () => require('${importPath}').${name}, enumerable: true, configurable: true });`)
               }
               if (hasDefault) {
                    lines.push(`Object.defineProperty(exports, '${defaultAlias}', { get: () => require('${importPath}').default, enumerable: true, configurable: true });`)
               }
               allValueNames.push(...v, ...(hasDefault ? [defaultAlias!] : []))
          }

          if (allValueNames.length) {
               lines.push('')
               lines.push(`Object.assign(global, { ${allValueNames.join(', ')} });`)
          }
     } else {
          for (const { importPath, values, defaultAlias } of infos) {
               const v = values.filter((n) => !seen.has(n))
               v.forEach((n) => seen.add(n))
               const hasDefault = defaultAlias && !seen.has(defaultAlias)
               if (hasDefault) seen.add(defaultAlias!)

               if (!v.length && !hasDefault) continue

               const named = [...v, ...(hasDefault ? [`default as ${defaultAlias}`] : [])]
               lines.push(`import { ${named.join(', ')} } from '${importPath}';`)
               allValueNames.push(...v, ...(hasDefault ? [defaultAlias!] : []))
          }

          if (allValueNames.length) {
               lines.push('')
               lines.push(`export { ${allValueNames.join(', ')} };`)
               lines.push(`Object.assign(globalThis, { ${allValueNames.join(', ')} });`)
          }
     }

     lines.push('')
     return lines.join('\n')
}

/**
 * Companion .d.ts for JS projects using --globals.
 * Adds declare global { var ... } after the normal re-exports.
 */
export function buildGlobalDts(infos: FileInfo[], outFileName: string): string {
     const seen = new Set<string>()

     const lines: string[] = [
          '/**',
          ` * ${outFileName} — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import --globals',
          ' */',
          '',
     ]

     const globalDecls: string[] = []

     for (const { importPath, types, values, defaultAlias } of infos) {
          const t = types.filter((n) => !seen.has(n))
          const v = values.filter((n) => !seen.has(n))
          t.forEach((n) => seen.add(n))
          v.forEach((n) => seen.add(n))

          const hasDefault = defaultAlias && !seen.has(defaultAlias)
          if (hasDefault) seen.add(defaultAlias!)

          if (t.length) lines.push(`export type { ${t.join(', ')} } from '${importPath}';`)
          if (v.length) lines.push(`export { ${v.join(', ')} } from '${importPath}';`)
          if (hasDefault) lines.push(`export { default as ${defaultAlias} } from '${importPath}';`)

          for (const name of v) {
               globalDecls.push(`  var ${name}: typeof import('${importPath}').${name}`)
          }
          if (hasDefault) {
               globalDecls.push(`  var ${defaultAlias}: typeof import('${importPath}').default`)
          }
     }

     if (globalDecls.length) {
          lines.push('')
          lines.push('declare global {')
          lines.push(...globalDecls)
          lines.push('}')
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
               // CJS — use lazy getters to avoid circular-dependency undefined at init time
               for (const name of v) {
                    lines.push(`Object.defineProperty(exports, '${name}', { get: () => require('${importPath}').${name}, enumerable: true, configurable: true });`)
               }
               if (hasDefault) {
                    lines.push(`Object.defineProperty(exports, '${defaultAlias}', { get: () => require('${importPath}').default, enumerable: true, configurable: true });`)
               }
          }
     }

     lines.push('')
     return lines.join('\n')
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
