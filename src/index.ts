import ts from 'typescript'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export interface GenImportOptions {
     rootDir?: string
     srcDir?: string
     outFileName?: string
     skipPatterns?: string[]
     pureReexports?: string[]
     moduleFilePattern?: string
}

const DEFAULT_SKIP_PATTERNS = ['__tests__', '.test.', '.spec.']
const DEFAULT_MODULE_FILE_PATTERN = '.module.ts'

function walk(dir: string): string[] {
     return readdirSync(dir, { withFileTypes: true }).flatMap((e: import('node:fs').Dirent) => {
          const full = join(dir, e.name)
          return e.isDirectory() ? walk(full) : [full]
     })
}

interface FileInfo {
     importPath: string
     types: string[]
     values: string[]
     defaultAlias: string | null
}

function analyzeFiles(files: string[], rootDir: string, srcDir: string): FileInfo[] {
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

function buildOutput(infos: FileInfo[], outFile: string): string {
     const seen = new Set<string>()
     const outFileName = outFile.split('/').pop()!.replace(/\.ts$/, '')

     const lines: string[] = [
          '/**',
          ` * ${outFileName}.ts — AUTO-GENERATED, do not edit manually.`,
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

function readPreviousExports(outFile: string): Set<string> {
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

export function genImport(options: GenImportOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const outFileName = options.outFileName ?? 'gen-import.ts'
     const outFile = join(srcDir, outFileName)
     const moduleFilePattern = options.moduleFilePattern ?? DEFAULT_MODULE_FILE_PATTERN
     const pureReexports = new Set(options.pureReexports ?? [])
     const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

     function shouldSkip(file: string): boolean {
          if (!file.endsWith('.ts')) return true
          if (file === outFile) return true
          const rel = relative(rootDir, file).replace(/\\/g, '/')
          if (pureReexports.has(rel)) return true
          return skipPatterns.some((p) => rel.includes(p))
     }

     function isModuleFile(file: string): boolean {
          return file.includes(moduleFilePattern)
     }

     const allFiles = walk(srcDir).filter((f) => !shouldSkip(f)).sort()
     const regularFiles = allFiles.filter((f) => !isModuleFile(f))
     const moduleFiles = allFiles.filter((f) => isModuleFile(f))
     const infos = analyzeFiles([...regularFiles, ...moduleFiles], rootDir, srcDir)

     const prevExports = readPreviousExports(outFile)
     const output = buildOutput(infos, outFileName)

     writeFileSync(outFile, output, 'utf-8')

     const total = infos.reduce(
          (n, i) => n + i.types.length + i.values.length + (i.defaultAlias ? 1 : 0),
          0,
     )

     const newExports = infos
          .flatMap((i) => [...i.types, ...i.values, ...(i.defaultAlias ? [i.defaultAlias] : [])])
          .filter((name) => !prevExports.has(name))

     console.log(`✓  ${relative(rootDir, outFile)}`)
     console.log(`   ${infos.length} source files · ${total} exports`)
     if (newExports.length) {
          console.log(`   +${newExports.length} new: ${newExports.join(', ')}`)
     }
}
