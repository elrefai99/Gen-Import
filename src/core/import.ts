import { writeFileSync } from 'node:fs'
import boxen from 'boxen'
import chalk from 'chalk'
import { join, relative, resolve } from 'node:path'
import { GenImportOptions } from '../@types'
import { walk, detectModuleType, detectProjectLanguage, toJsPath, analyzeFiles, createTsProgram, buildDepGraph, detectCycles, topoSort, readPreviousExports, buildDtsOutput, buildJsOutput, buildGlobalDtsOutput, buildGlobalJsOutput, buildGlobalDts } from '../script'
import { DEFAULT_MODULE_FILE_PATTERNS, DEFAULT_SKIP_PATTERNS } from '..'

export function genImport(options: GenImportOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
     const moduleType = detectModuleType(rootDir)

     const outFileName = options.outFileName ?? (isTs ? 'gen-import.ts' : 'gen-import.js')
     const outFile = join(srcDir, outFileName)

     const writeTypeDecl = !isTs && !outFileName.endsWith('.d.ts')

     const generateJs = options.generateJs ?? false
     const globals = options.globals ?? false
     const strictCycles = options.strictCycles ?? false
     const noTopoSort = options.noTopoSort ?? false
     const moduleFilePatterns = options.moduleFilePattern
          ? (Array.isArray(options.moduleFilePattern) ? options.moduleFilePattern : [options.moduleFilePattern])
          : DEFAULT_MODULE_FILE_PATTERNS
     const pureReexports = new Set(options.pureReexports ?? [])
     const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

     const genPackageFileName = isTs ? 'gen-package.ts' : 'gen-package.js'
     const genPackagePath = join(srcDir, genPackageFileName)
     const genAppConfigFileName = isTs ? 'gen-app-config.ts' : 'gen-app-config.js'
     const genAppConfigPath = join(srcDir, genAppConfigFileName)
     const extraSkip = new Set([outFile, toJsPath(outFile), genPackagePath, genAppConfigPath])

     function shouldSkip(file: string): boolean {
          if (file.endsWith('.d.ts')) return true
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
     const orderedFiles = [...regularFiles, ...moduleFiles]

     // Create program once — reused by analyzeFiles and buildDepGraph
     const program = createTsProgram(orderedFiles, rootDir)
     const infos = analyzeFiles(orderedFiles, rootDir, srcDir, program)

     // ─── Cycle detection ──────────────────────────────────────────────────────
     const graph = buildDepGraph(orderedFiles, program)
     const cycles = detectCycles(graph)

     if (cycles.length > 0) {
          const cycleLines = cycles.map(({ path }) => {
               const relPath = path.map((p) => chalk.yellow(relative(rootDir, p)))
               return '  ' + relPath.join(chalk.red(' → '))
          })
          const header = chalk.red.bold(`⚠  ${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'} detected:`)
          console.warn('\n' + header + '\n' + cycleLines.join('\n') + '\n')

          if (strictCycles) {
               console.error(chalk.red('Exiting due to --strict-cycles flag.'))
               process.exit(1)
          }
     }

     // ─── Topological sort ─────────────────────────────────────────────────────
     let sortedInfos = infos
     if (!noTopoSort) {
          const sortedPaths = topoSort(orderedFiles, graph)
          const pathIndex = new Map(sortedPaths.map((p, i) => [p, i]))
          sortedInfos = [...infos].sort((a, b) => {
               const ai = pathIndex.get(a.absolutePath) ?? Infinity
               const bi = pathIndex.get(b.absolutePath) ?? Infinity
               return ai - bi
          })
     }

     const prevExports = readPreviousExports(outFile)

     if (isTs) {
          const content = globals
               ? buildGlobalDtsOutput(sortedInfos, outFileName)
               : buildDtsOutput(sortedInfos, outFileName)
          writeFileSync(outFile, content, 'utf-8')
     } else {
          const content = globals
               ? buildGlobalJsOutput(sortedInfos, outFileName, moduleType)
               : buildJsOutput(sortedInfos, outFileName, moduleType)
          writeFileSync(outFile, content, 'utf-8')
     }

     if (writeTypeDecl) {
          const dtsFile = outFile.replace(/\.js$/, '.d.ts')
          const dtsName = outFileName.replace(/\.js$/, '.d.ts')
          const dtsContent = globals
               ? buildGlobalDts(sortedInfos, dtsName)
               : buildDtsOutput(sortedInfos, dtsName)
          writeFileSync(dtsFile, dtsContent, 'utf-8')
     }

     if (isTs && generateJs) {
          const jsFile = toJsPath(outFile)
          const jsContent = globals
               ? buildGlobalJsOutput(sortedInfos, outFileName, moduleType)
               : buildJsOutput(sortedInfos, outFileName, moduleType)
          writeFileSync(jsFile, jsContent, 'utf-8')
     }

     const total = sortedInfos.reduce(
          (n, i) => n + i.types.length + i.values.length + (i.defaultAlias ? 1 : 0),
          0,
     )

     const newExports = sortedInfos
          .flatMap((i) => [...i.types, ...i.values, ...(i.defaultAlias ? [i.defaultAlias] : [])])
          .filter((name) => !prevExports.has(name))

     const rows: [string, string][] = [
          ['Source files', `${sortedInfos.length}`],
          ['Total exports', `${total}`],
          ['Language', isTs ? 'TypeScript' : 'JavaScript'],
          ['Output file', relative(rootDir, outFile)],
          ['Module', moduleType],
          ['Globals', globals ? chalk.green('on') : chalk.gray('off')],
          ['Topo sort', noTopoSort ? chalk.gray('off') : chalk.green('on')],
          ['Cycles', cycles.length === 0 ? chalk.green('none') : chalk.red(`${cycles.length} ⚠`)],
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
               borderColor: cycles.length > 0 ? 'yellow' : 'green',
               borderStyle: 'round',
          }),
     )

     // ─── Import / Export graph ─────────────────────────────────────────────────
     const outName = relative(rootDir, outFile)
     const graphLines: string[] = []

     for (const info of sortedInfos) {
          const allExports: string[] = [
               ...info.types.map((n) => `${chalk.blue('[T]')} ${chalk.dim(n)}`),
               ...info.values.map((n) => `${chalk.green('[V]')} ${chalk.white(n)}`),
               ...(info.defaultAlias ? [`${chalk.yellow('[D]')} ${chalk.white(info.defaultAlias)}`] : []),
          ]
          if (allExports.length === 0) continue

          graphLines.push(
               `${chalk.cyan(info.importPath)} ${chalk.gray('──►')} ${chalk.green(outName)}`,
          )
          for (let i = 0; i < allExports.length; i++) {
               const branch = i === allExports.length - 1 ? '└─' : '├─'
               graphLines.push(`  ${chalk.gray(branch)} ${allExports[i]}`)
          }
          graphLines.push('')
     }

     if (graphLines.length > 0) {
          // drop trailing blank line
          if (graphLines[graphLines.length - 1] === '') graphLines.pop()
          console.log(
               boxen(graphLines.join('\n'), {
                    title: chalk.blue.bold(' Import / Export Graph '),
                    titleAlignment: 'center',
                    padding: { top: 0, bottom: 0, left: 1, right: 1 },
                    borderColor: 'blue',
                    borderStyle: 'round',
               }),
          )
     }
}
