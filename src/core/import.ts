import ts from 'typescript'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { GenImportOptions } from '../@types'
import { walk, detectModuleType, detectProjectLanguage, toJsPath, analyzeFiles, readPreviousExports, buildDtsOutput, buildJsOutput } from '../script'
import { DEFAULT_MODULE_FILE_PATTERN, DEFAULT_SKIP_PATTERNS } from '..'

export function genImport(options: GenImportOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
     const moduleType = detectModuleType(rootDir)

     const outFileName = options.outFileName ?? (isTs ? 'gen-import.ts' : 'gen-import.js')
     const outFile = join(srcDir, outFileName)

     const writeTypeDecl = !isTs && !outFileName.endsWith('.d.ts')

     const generateJs = options.generateJs ?? false  // only used when outFile is .ts
     const moduleFilePattern = options.moduleFilePattern ?? DEFAULT_MODULE_FILE_PATTERN
     const pureReexports = new Set(options.pureReexports ?? [])
     const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

     // Files to skip when scanning srcDir — always exclude both barrel files to prevent
     // gen-package.ts from being picked up as a source and causing circular re-exports.
     const genPackageFileName = isTs ? 'gen-package.ts' : 'gen-package.js'
     const genPackagePath = join(srcDir, genPackageFileName)
     const extraSkip = new Set([outFile, toJsPath(outFile), genPackagePath])

     function shouldSkip(file: string): boolean {
          if (file.endsWith('.d.ts')) return true        // never analyse declaration files
          if (!file.endsWith('.ts') && !file.endsWith('.js')) return true
          if (extraSkip.has(file)) return true
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

     if (isTs) {
          writeFileSync(outFile, buildDtsOutput(infos, outFileName), 'utf-8')
     } else {
          writeFileSync(outFile, buildJsOutput(infos, outFileName, moduleType), 'utf-8')
     }

     if (writeTypeDecl) {
          const dtsFile = outFile.replace(/\.js$/, '.d.ts')
          writeFileSync(dtsFile, buildDtsOutput(infos, outFileName.replace(/\.js$/, '.d.ts')), 'utf-8')
          console.log(`✓  ${relative(rootDir, dtsFile)}`)
     }

     // TS projects with explicit generateJs: also write a .js runtime companion
     if (isTs && generateJs) {
          const jsFile = toJsPath(outFile)
          writeFileSync(jsFile, buildJsOutput(infos, outFileName, moduleType), 'utf-8')
          console.log(`✓  ${relative(rootDir, jsFile)}`)
     }

     const total = infos.reduce(
          (n, i) => n + i.types.length + i.values.length + (i.defaultAlias ? 1 : 0),
          0,
     )

     const newExports = infos
          .flatMap((i) => [...i.types, ...i.values, ...(i.defaultAlias ? [i.defaultAlias] : [])])
          .filter((name) => !prevExports.has(name))

     console.log(`✓  ${relative(rootDir, outFile)}`)
     console.log(`   ${infos.length} source files · ${total} exports · ${isTs ? 'typescript' : 'javascript'} · module: ${moduleType}`)
     if (newExports.length) {
          console.log(`   +${newExports.length} new: ${newExports.join(', ')}`)
     }
}
