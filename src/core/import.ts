import { writeFileSync } from 'node:fs'
import boxen from 'boxen'
import chalk from 'chalk'
import { join, relative, resolve } from 'node:path'
import { GenImportOptions } from '../@types'
import { walk, detectModuleType, detectProjectLanguage, toJsPath, analyzeFiles, readPreviousExports, buildDtsOutput, buildJsOutput, buildGlobalDtsOutput, buildGlobalJsOutput, buildGlobalDts } from '../script'
import { DEFAULT_MODULE_FILE_PATTERNS, DEFAULT_SKIP_PATTERNS } from '..'

export function genImport(options: GenImportOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
     const moduleType = detectModuleType(rootDir)

     const outFileName = options.outFileName ?? (isTs ? 'gen-import.ts' : 'gen-import.js')
     const outFile = join(srcDir, outFileName)

     const writeTypeDecl = !isTs && !outFileName.endsWith('.d.ts')

     const generateJs = options.generateJs ?? false  // only used when outFile is .ts
     const globals = options.globals ?? false
     const moduleFilePatterns = options.moduleFilePattern
          ? (Array.isArray(options.moduleFilePattern) ? options.moduleFilePattern : [options.moduleFilePattern])
          : DEFAULT_MODULE_FILE_PATTERNS
     const pureReexports = new Set(options.pureReexports ?? [])
     const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

     // Files to skip when scanning srcDir — always exclude both barrel files to prevent
     // gen-package.ts from being picked up as a source and causing circular re-exports.
     const genPackageFileName = isTs ? 'gen-package.ts' : 'gen-package.js'
     const genPackagePath = join(srcDir, genPackageFileName)
     const genAppConfigFileName = isTs ? 'gen-app-config.ts' : 'gen-app-config.js'
     const genAppConfigPath = join(srcDir, genAppConfigFileName)
     const extraSkip = new Set([outFile, toJsPath(outFile), genPackagePath, genAppConfigPath])

     function shouldSkip(file: string): boolean {
          if (file.endsWith('.d.ts')) return true        // never analyse declaration files
          if (!file.endsWith('.ts') && !file.endsWith('.js')) return true
          if (extraSkip.has(file)) return true
          const rel = relative(rootDir, file).replace(/\\/g, '/')
          if (pureReexports.has(rel)) return true
          return skipPatterns.some((p) => rel.includes(p))
     }

     function isModuleFile(file: string): boolean {
          return moduleFilePatterns.some((p) => file.includes(p))
     }

     const allFiles = walk(srcDir).filter((f) => !shouldSkip(f)).sort()
     const regularFiles = allFiles.filter((f) => !isModuleFile(f))
     const moduleFiles = allFiles.filter((f) => isModuleFile(f))
     const infos = analyzeFiles([...regularFiles, ...moduleFiles], rootDir, srcDir)

     const prevExports = readPreviousExports(outFile)

     if (isTs) {
          const content = globals
               ? buildGlobalDtsOutput(infos, outFileName)
               : buildDtsOutput(infos, outFileName)
          writeFileSync(outFile, content, 'utf-8')
     } else {
          const content = globals
               ? buildGlobalJsOutput(infos, outFileName, moduleType)
               : buildJsOutput(infos, outFileName, moduleType)
          writeFileSync(outFile, content, 'utf-8')
     }

     if (writeTypeDecl) {
          const dtsFile = outFile.replace(/\.js$/, '.d.ts')
          const dtsName = outFileName.replace(/\.js$/, '.d.ts')
          const dtsContent = globals
               ? buildGlobalDts(infos, dtsName)
               : buildDtsOutput(infos, dtsName)
          writeFileSync(dtsFile, dtsContent, 'utf-8')
     }

     // TS projects with explicit generateJs: also write a .js runtime companion
     if (isTs && generateJs) {
          const jsFile = toJsPath(outFile)
          const jsContent = globals
               ? buildGlobalJsOutput(infos, outFileName, moduleType)
               : buildJsOutput(infos, outFileName, moduleType)
          writeFileSync(jsFile, jsContent, 'utf-8')
     }

     const total = infos.reduce(
          (n, i) => n + i.types.length + i.values.length + (i.defaultAlias ? 1 : 0),
          0,
     )

     const newExports = infos
          .flatMap((i) => [...i.types, ...i.values, ...(i.defaultAlias ? [i.defaultAlias] : [])])
          .filter((name) => !prevExports.has(name))

     const rows: [string, string][] = [
          ['Source files',  `${infos.length}`],
          ['Total exports', `${total}`],
          ['Language',      isTs ? 'TypeScript' : 'JavaScript'],
          ['Output file',   relative(rootDir, outFile)],
          ['Module',        moduleType],
          ['Globals',       globals ? chalk.green('on') : chalk.gray('off')],
     ]

     if (newExports.length) {
          rows.push(['New exports', chalk.yellow(`+${newExports.length}: ${newExports.join(', ')}`)])
     }

     const labelWidth = Math.max(...rows.map(([l]) => l.length))
     const table = rows
          .map(([label, value]) => `${chalk.cyan(label.padEnd(labelWidth))}  ${value}`)
          .join('\n')

     console.log(
          boxen(table, {
               title: chalk.green.bold(' gen-import '),
               titleAlignment: 'center',
               padding: { top: 0, bottom: 0, left: 1, right: 1 },
               borderColor: 'green',
               borderStyle: 'round',
          }),
     )
}
