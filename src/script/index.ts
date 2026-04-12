import ts from 'typescript'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { CycleReport, FileInfo } from '../@types'
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
          const hasTsFile = walk(srcDir).some(
               (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts'),
          )
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

export function buildLazyGlobalDtsOutput(infos: FileInfo[], outFileName: string): string {
     const seenTypes = new Set<string>()
     const seenValues = new Set<string>()

     const lines: string[] = [
          '// @ts-nocheck — auto-generated barrel with lazy CJS re-exports',
          '/**',
          ` * ${outFileName} — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import --globals',
          ' *',
          " * Import once in your entry point: import './gen-import'",
          ' * After that, all exports are available as globals — no per-file imports needed.',
          ' *',
          ' * Value exports use lazy getters to prevent circular-dependency',
          ' * errors when source files import from this barrel (CJS).',
          ' */',
          '',
     ]

     const typeExportLines: string[] = []
     const valueExports: { name: string; importPath: string; key: string }[] = []

     for (const { importPath, types, values, defaultAlias } of infos) {
          const t = types.filter((n) => !seenTypes.has(n) && !seenValues.has(n))
          const v = values.filter((n) => !seenValues.has(n) && !seenTypes.has(n))
          t.forEach((n) => seenTypes.add(n))
          v.forEach((n) => seenValues.add(n))

          const hasDefault = defaultAlias && !seenValues.has(defaultAlias)
          if (hasDefault) seenValues.add(defaultAlias!)

          if (t.length) typeExportLines.push(`export type { ${t.join(', ')} } from '${importPath}';`)

          for (const name of v) {
               valueExports.push({ name, importPath, key: name })
          }
          if (hasDefault) {
               valueExports.push({ name: defaultAlias!, importPath, key: 'default' })
          }
     }

     // Type exports
     lines.push(...typeExportLines)
     if (typeExportLines.length && valueExports.length) lines.push('')

     // Value type declarations (compile-time only)
     for (const { name, importPath, key } of valueExports) {
          if (key === 'default') {
               lines.push(`export declare const ${name}: typeof import('${importPath}').default;`)
          } else {
               lines.push(`export declare const ${name}: typeof import('${importPath}').${name};`)
          }
     }

     if (valueExports.length) {
          lines.push('')

          // Lazy getters for exports
          for (const { name, importPath, key } of valueExports) {
               lines.push(`Object.defineProperty(exports, '${name}', { get() { return require('${importPath}').${key} }, enumerable: true, configurable: true });`)
          }

          // Register on global using defineProperties for lazy access
          lines.push('')
          lines.push('Object.defineProperties(global, {')
          for (const { name } of valueExports) {
               lines.push(`  ${name}: { get() { return exports.${name} }, enumerable: true, configurable: true },`)
          }
          lines.push('});')
          lines.push('')
          lines.push('declare global {')
          for (const { name, importPath, key } of valueExports) {
               if (key === 'default') {
                    lines.push(`  var ${name}: typeof import('${importPath}').default`)
               } else {
                    lines.push(`  var ${name}: typeof import('${importPath}').${name}`)
               }
          }
          lines.push('}')
     }

     lines.push('')
     return lines.join('\n')
}

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
               continue
          }
          // Lazy barrel format: export declare const <name>: ...
          const declareMatch = line.match(/^export\s+declare\s+const\s+(\w+)\s*:/)
          if (declareMatch) {
               names.add(declareMatch[1])
          }
     }
     return names
}

export function createTsProgram(files: string[], rootDir: string): ts.Program {
     const cfgPath = join(rootDir, 'tsconfig.json')
     const cfgFile = ts.readConfigFile(cfgPath, ts.sys.readFile)
     const { options } = ts.parseJsonConfigFileContent(cfgFile.config ?? {}, ts.sys, rootDir)

     const hasJsFiles = files.some((f) => f.endsWith('.js'))
     if (hasJsFiles && !options.allowJs) options.allowJs = true

     return ts.createProgram(files, options)
}

export function analyzeFiles(
     files: string[],
     rootDir: string,
     srcDir: string,
     program?: ts.Program,
): FileInfo[] {
     const prog = program ?? createTsProgram(files, rootDir)
     const checker = prog.getTypeChecker()

     return files.flatMap((file): FileInfo[] => {
          const sf = prog.getSourceFile(file)
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

          return [{ importPath: `./${rel}`, absolutePath: file, types, values, defaultAlias }]
     })
}

export type DepGraph = Map<string, Set<string>>

export function buildDepGraph(files: string[], program: ts.Program): DepGraph {
     const graph: DepGraph = new Map()
     const fileSet = new Set(files)
     const compilerOptions = program.getCompilerOptions()

     for (const file of files) {
          const sf = program.getSourceFile(file)
          const deps = new Set<string>()

          if (sf) {
               for (const stmt of sf.statements) {
                    if (!ts.isImportDeclaration(stmt) && !ts.isExportDeclaration(stmt)) continue
                    const moduleSpec = stmt.moduleSpecifier
                    if (!moduleSpec || !ts.isStringLiteral(moduleSpec)) continue

                    const specText = moduleSpec.text
                    if (!specText.startsWith('.')) continue // skip external packages

                    const resolved = ts.resolveModuleName(specText, file, compilerOptions, ts.sys)
                    const resolvedFile = resolved.resolvedModule?.resolvedFileName
                    if (resolvedFile && fileSet.has(resolvedFile)) {
                         deps.add(resolvedFile)
                    }
               }
          }

          graph.set(file, deps)
     }

     return graph
}

export function detectCycles(graph: DepGraph): CycleReport[] {
     const cycles: CycleReport[] = []
     const visited = new Set<string>()
     const onStack = new Set<string>()
     const stack: string[] = []
     const reported = new Set<string>()

     function dfs(node: string): void {
          visited.add(node)
          onStack.add(node)
          stack.push(node)

          for (const neighbor of graph.get(node) ?? []) {
               if (!visited.has(neighbor)) {
                    dfs(neighbor)
               } else if (onStack.has(neighbor)) {
                    const cycleStart = stack.indexOf(neighbor)
                    const cyclePath = [...stack.slice(cycleStart), neighbor]
                    const key = cyclePath.join('>')
                    if (!reported.has(key)) {
                         reported.add(key)
                         cycles.push({ path: cyclePath })
                    }
               }
          }

          stack.pop()
          onStack.delete(node)
     }

     for (const node of graph.keys()) {
          if (!visited.has(node)) dfs(node)
     }

     return cycles
}

export function topoSort(files: string[], graph: DepGraph): string[] {
     const fileSet = new Set(files)

     const reversedGraph = new Map<string, Set<string>>()
     const inDegree = new Map<string, number>()

     for (const file of files) {
          inDegree.set(file, 0)
          reversedGraph.set(file, new Set())
     }

     for (const [file, deps] of graph) {
          if (!fileSet.has(file)) continue
          for (const dep of deps) {
               if (!fileSet.has(dep)) continue
               reversedGraph.get(dep)!.add(file)
               inDegree.set(file, (inDegree.get(file) ?? 0) + 1)
          }
     }

     // Files with 0 internal deps can be initialized first
     const queue: string[] = []
     for (const [file, deg] of inDegree) {
          if (deg === 0) queue.push(file)
     }

     const sorted: string[] = []
     while (queue.length) {
          const node = queue.shift()!
          sorted.push(node)
          for (const dependent of reversedGraph.get(node) ?? []) {
               const newDeg = (inDegree.get(dependent) ?? 0) - 1
               inDegree.set(dependent, newDeg)
               if (newDeg === 0) queue.push(dependent)
          }
     }

     // Cycles prevent full sort — append remaining files (best-effort fallback)
     if (sorted.length < files.length) {
          const sortedSet = new Set(sorted)
          const remaining = files.filter((f) => !sortedSet.has(f))
          return [...sorted, ...remaining]
     }

     return sorted
}

export function buildLazyDtsOutput(infos: FileInfo[], outFileName: string): string {
     const seenTypes = new Set<string>()
     const seenValues = new Set<string>()

     const lines: string[] = [
          '// @ts-nocheck — auto-generated barrel with lazy CJS re-exports',
          '/**',
          ` * ${outFileName} — AUTO-GENERATED, do not edit manually.`,
          ' * Regenerate: npx gen-import',
          ' *',
          ' * Value exports use lazy getters to prevent circular-dependency',
          ' * errors when source files import from this barrel (CJS).',
          ' */',
          '',
     ]

     // Phase 1: collect type exports, value export metadata
     const typeExportLines: string[] = []
     const valueModules: { importPath: string; names: string[]; defaultAlias: string | null }[] = []

     for (const { importPath, types, values, defaultAlias } of infos) {
          const t = types.filter((n) => !seenTypes.has(n) && !seenValues.has(n))
          const v = values.filter((n) => !seenValues.has(n) && !seenTypes.has(n))
          t.forEach((n) => seenTypes.add(n))
          v.forEach((n) => seenValues.add(n))

          const hasDefault = defaultAlias && !seenValues.has(defaultAlias)
          if (hasDefault) seenValues.add(defaultAlias!)

          if (t.length) {
               typeExportLines.push(`export type { ${t.join(', ')} } from '${importPath}';`)
          }

          if (v.length || hasDefault) {
               valueModules.push({
                    importPath,
                    names: v,
                    defaultAlias: hasDefault ? defaultAlias! : null,
               })
          }
     }

     // Phase 2: emit type exports
     lines.push(...typeExportLines)
     if (typeExportLines.length && valueModules.length) lines.push('')

     // Phase 3: emit value type declarations (compile-time only)
     for (const { importPath, names, defaultAlias } of valueModules) {
          for (const name of names) {
               lines.push(`export declare const ${name}: typeof import('${importPath}').${name};`)
          }
          if (defaultAlias) {
               lines.push(`export declare const ${defaultAlias}: typeof import('${importPath}').default;`)
          }
     }

     if (valueModules.length) lines.push('')

     // Phase 4: emit runtime lazy getters
     if (valueModules.length) {
          for (const { importPath, names, defaultAlias } of valueModules) {
               for (const name of names) {
                    lines.push(`Object.defineProperty(exports, '${name}', { get() { return require('${importPath}').${name} }, enumerable: true, configurable: true });`)
               }
               if (defaultAlias) {
                    lines.push(`Object.defineProperty(exports, '${defaultAlias}', { get() { return require('${importPath}').default }, enumerable: true, configurable: true });`)
               }
          }
     }

     lines.push('')
     return lines.join('\n')
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
     const baseName = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '').replace(/\.js$/, '')

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
               continue
          }
          // Lazy barrel format: export declare const <name>: ...
          const declareMatch = line.match(/^export\s+declare\s+const\s+(\w+)\s*:/)
          if (declareMatch) {
               names.add(declareMatch[1])
          }
     }
     return names
}
