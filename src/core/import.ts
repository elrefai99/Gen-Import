import { writeFileSync } from 'node:fs'
import boxen from 'boxen'
import chalk from 'chalk'
import { join, relative, resolve } from 'node:path'
import { Diagnostic, FileInfo, GenImportOptions, StrictMode } from '../@types'
import { walk, detectModuleType, detectProjectLanguage, toJsPath, analyzeFiles, createTsProgram, readPreviousExports, buildDtsOutput, buildLazyDtsOutput, buildJsOutput, buildGlobalDtsOutput, buildLazyGlobalDtsOutput, buildGlobalJsOutput, buildGlobalDts, findNameCollisions } from '../script'
import { buildModuleGraph, withBarrelExports } from '../analysis/graph'
import { tarjanScc, topoOrder } from '../analysis/scc'
import { analyzeBarrel, analyzeBarrelGraph, selectSafeExports } from '../analysis/barrel'
import { collectBarrelDiagnostics, collectCycleDiagnostics, countBySeverity, formatDiagnostics, SEVERITY_BY_CODE } from '../analysis/diagnostics'
import { DEFAULT_MODULE_FILE_PATTERNS, DEFAULT_SKIP_PATTERNS } from '..'

const BARREL_SAFETY_LABEL = {
     safe: () => chalk.green('safe'),
     'type-safe': () => chalk.green('safe (type-only cycle)'),
     ordered: () => chalk.yellow('ordered ⚠'),
     unsafe: () => chalk.red('unsafe ✖'),
} as const

const BLOCKING_CODES: Record<Exclude<StrictMode, 'off'>, readonly string[]> = {
     cycles: ['GI001'],
     barrels: ['GI002', 'GI004'],
     collisions: ['GI006'],
     all: ['GI001', 'GI002', 'GI004', 'GI006'],
}

function blockingDiagnostics(diagnostics: Diagnostic[], strict: StrictMode): Diagnostic[] {
     if (strict === 'off') return []
     const codes = BLOCKING_CODES[strict]
     return diagnostics.filter((d) => codes.includes(d.code))
}

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
     const safeBarrels = options.safeBarrels ?? false
     const strict: StrictMode = options.strict ?? (options.strictCycles ? 'cycles' : 'off')
     const noTopoSort = options.noTopoSort ?? false
     let lazy = options.lazy ?? (moduleType === 'cjs')
     if (lazy && moduleType === 'esm' && isTs) {
          console.warn(chalk.yellow('⚠  --lazy emits CJS require() getters, incompatible with "type": "module". Falling back to static re-exports.'))
          lazy = false
     }
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

     const program = createTsProgram(orderedFiles, rootDir)
     const infos = analyzeFiles(orderedFiles, rootDir, srcDir, program)

     const barrelPaths = [outFile, toJsPath(outFile), genAppConfigPath, toJsPath(genAppConfigPath)]
     const graph = buildModuleGraph(orderedFiles, { rootDir, program, barrelPaths })

     let analysisGraph = graph
     for (const aggregator of [genAppConfigPath, toJsPath(genAppConfigPath)]) {
          analysisGraph = withBarrelExports(analysisGraph, aggregator, [outFile])
     }

     const ownerByName = new Map<string, string>()
     for (const info of infos) {
          for (const name of [...info.values, ...info.types, ...(info.defaultAlias ? [info.defaultAlias] : [])]) {
               if (!ownerByName.has(name)) ownerByName.set(name, info.absolutePath)
          }
     }

     const barrel = analyzeBarrelGraph(
          analysisGraph,
          outFile,
          infos.map((i) => i.absolutePath),
          { lazy, ownerByName },
     )
     const barrelAnalysis = barrel.analysis
     const runtimeGraph = barrel.runtimeGraph

     const sccResult = tarjanScc(runtimeGraph)
     const diagnostics: Diagnostic[] = collectCycleDiagnostics(runtimeGraph, sccResult, rootDir, {
          skipNodes: new Set(barrelPaths),
     })

     let sortedInfos = infos
     if (!noTopoSort) {
          const sortedPaths = topoOrder(sccResult)
          const pathIndex = new Map(sortedPaths.map((p, i) => [p, i]))
          sortedInfos = [...infos].sort((a, b) => {
               const ai = pathIndex.get(a.absolutePath) ?? Infinity
               const bi = pathIndex.get(b.absolutePath) ?? Infinity
               return ai - bi
          })
     }

     const collisions = findNameCollisions(sortedInfos)
     if (collisions.size > 0) {
          const collisionLines = [...collisions].map(([name, paths]) => {
               const [winner, ...dropped] = paths
               return `  ${chalk.yellow.bold(name)}: kept from ${chalk.cyan(winner)}, dropped from ${dropped.map((p) => chalk.red(p)).join(', ')}`
          })
          const header = chalk.yellow.bold(`⚠  ${collisions.size} export name collision${collisions.size === 1 ? '' : 's'} — only the first occurrence is re-exported:`)
          console.warn('\n' + header + '\n' + collisionLines.join('\n') + '\n')

          diagnostics.push({
               code: 'GI006',
               severity: SEVERITY_BY_CODE.GI006,
               message: `${collisions.size} export name collision${collisions.size === 1 ? '' : 's'} — only the first occurrence is re-exported`,
               files: [...new Set([...collisions.values()].flat())],
               advice: 'Rename one of the exports, or exclude the losing file with --skip.',
          })
     }

     let emittedInfos: FileInfo[] = sortedInfos
     let demoted: FileInfo[] = []
     let dropped: FileInfo[] = []
     let resolvedSafety = barrelAnalysis.safety

     if (safeBarrels) {
          const selection = selectSafeExports(analysisGraph, outFile, sortedInfos, {
               lazy,
               precomputed: barrelAnalysis,
          })
          emittedInfos = selection.infos
          demoted = selection.demoted
          dropped = selection.dropped

          if (!selection.unchanged) {
               resolvedSafety = analyzeBarrel(
                    analysisGraph,
                    outFile,
                    emittedInfos.map((i) => i.absolutePath),
                    { lazy, ownerByName },
               ).safety
          }
     }

     const eagerSources = new Set(barrelAnalysis.eagerEdges.map((e) => e.from))

     const repaired = resolvedSafety !== barrelAnalysis.safety &&
          (resolvedSafety === 'safe' || resolvedSafety === 'type-safe')

     if (repaired) {
          diagnostics.push({
               code: 'GI007',
               severity: SEVERITY_BY_CODE.GI007,
               message:
                    `${relative(rootDir, outFile)} would have been ${barrelAnalysis.safety}; ` +
                    `${dropped.length + demoted.length} export source${dropped.length + demoted.length === 1 ? '' : 's'} withheld to keep it acyclic`,
               files: barrelAnalysis.members.map((m) => relative(rootDir, m)),
               cycle: barrelAnalysis.cycle.map((p) => relative(rootDir, p)),
          })
     } else if (!barrelAnalysis.lazy || barrelAnalysis.safety === 'type-safe') {
          diagnostics.push(...collectBarrelDiagnostics(barrelAnalysis, rootDir, { safeBarrels }))
     }

     const prevExports = readPreviousExports(outFile)

     if (isTs) {
          let content: string
          if (globals) {
               content = lazy
                    ? buildLazyGlobalDtsOutput(emittedInfos, outFileName)
                    : buildGlobalDtsOutput(emittedInfos, outFileName)
          } else {
               content = lazy
                    ? buildLazyDtsOutput(emittedInfos, outFileName)
                    : buildDtsOutput(emittedInfos, outFileName)
          }
          writeFileSync(outFile, content, 'utf-8')
     } else {
          const content = globals
               ? buildGlobalJsOutput(emittedInfos, outFileName, moduleType)
               : buildJsOutput(emittedInfos, outFileName, moduleType)
          writeFileSync(outFile, content, 'utf-8')
     }

     if (writeTypeDecl) {
          const dtsFile = outFile.replace(/\.js$/, '.d.ts')
          const dtsName = outFileName.replace(/\.js$/, '.d.ts')
          const dtsContent = globals
               ? buildGlobalDts(emittedInfos, dtsName)
               : buildDtsOutput(emittedInfos, dtsName)
          writeFileSync(dtsFile, dtsContent, 'utf-8')
     }

     if (isTs && generateJs) {
          const jsFile = toJsPath(outFile)
          const jsContent = globals
               ? buildGlobalJsOutput(emittedInfos, outFileName, moduleType)
               : buildJsOutput(emittedInfos, outFileName, moduleType)
          writeFileSync(jsFile, jsContent, 'utf-8')
     }

     const total = emittedInfos.reduce(
          (n, i) => n + i.types.length + i.values.length + (i.defaultAlias ? 1 : 0),
          0,
     )

     const newExports = [...new Set(
          emittedInfos.flatMap((i) => [...i.types, ...i.values, ...(i.defaultAlias ? [i.defaultAlias] : [])]),
     )].filter((name) => !prevExports.has(name))

     const cycleCount = diagnostics.filter((d) => d.code === 'GI001' || d.code === 'GI003').length
     const eagerCycleCount = diagnostics.filter((d) => d.code === 'GI001').length
     const edgeCount = [...runtimeGraph.out.values()].reduce((n, e) => n + e.length, 0)

     const rows: [string, string][] = [
          ['Source files', `${emittedInfos.length}`],
          ['Total exports', `${total}`],
          ['Language', isTs ? 'TypeScript' : 'JavaScript'],
          ['Output file', relative(rootDir, outFile)],
          ['Module', moduleType],
          ['Globals', globals ? chalk.green('on') : chalk.gray('off')],
          ['Lazy', lazy ? chalk.green('on') : chalk.gray('off')],
          ['Topo sort', noTopoSort ? chalk.gray('off') : chalk.green('on')],
          ['Import edges', `${edgeCount}`],
          [
               'Cycles',
               cycleCount === 0
                    ? chalk.green('none')
                    : eagerCycleCount > 0
                         ? chalk.red(`${cycleCount} (${eagerCycleCount} init-time ✖)`)
                         : chalk.yellow(`${cycleCount} (all deferred)`),
          ],
          [
               'Barrel',
               resolvedSafety === barrelAnalysis.safety
                    ? BARREL_SAFETY_LABEL[barrelAnalysis.safety]()
                    : `${chalk.strikethrough(barrelAnalysis.safety)} ${chalk.gray('→')} ${BARREL_SAFETY_LABEL[resolvedSafety]()}`,
          ],
          ['Collisions', collisions.size === 0 ? chalk.green('none') : chalk.yellow(`${collisions.size} ⚠`)],
     ]

     if (safeBarrels) {
          rows.push([
               'Safe barrels',
               demoted.length + dropped.length === 0
                    ? chalk.green('on · nothing withheld')
                    : chalk.yellow(`on · ${demoted.length} demoted, ${dropped.length} dropped`),
          ])
     }

     if (newExports.length) {
          rows.push(['New exports', chalk.yellow(`+${newExports.length}: ${newExports.join(', ')}`)])
     }

     const withheldReason = (info: FileInfo): string =>
          eagerSources.has(info.absolutePath)
               ? 'reads through the barrel while its own module body runs'
               : 'shares the barrel cycle — withholding it is what breaks the loop'

     for (const info of dropped) {
          const names = [...info.values, ...(info.defaultAlias ? [info.defaultAlias] : [])]
          diagnostics.push({
               code: 'GI007',
               severity: SEVERITY_BY_CODE.GI007,
               message: `${info.importPath} withheld from the barrel — ${withheldReason(info)}`,
               files: [relative(rootDir, info.absolutePath)],
               advice: `import { ${names.join(', ')} } from '${info.importPath}'`,
          })
     }
     for (const info of demoted) {
          diagnostics.push({
               code: 'GI007',
               severity: SEVERITY_BY_CODE.GI007,
               message: `${info.importPath}: types kept, values withheld — ${withheldReason(info)}`,
               files: [relative(rootDir, info.absolutePath)],
               advice: `import { ${info.values.join(', ')} } from '${info.importPath}'`,
          })
     }

     const severity = countBySeverity(diagnostics)
     if (diagnostics.length > 0) {
          console.log('\n' + formatDiagnostics(diagnostics) + '\n')
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
               borderColor: severity.error > 0 ? 'red' : severity.warn > 0 ? 'yellow' : 'green',
               borderStyle: 'round',
          }),
     )

     const outName = relative(rootDir, outFile)
     const graphLines: string[] = []

     for (const info of emittedInfos) {
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

     const blocking = blockingDiagnostics(diagnostics, strict)
     if (blocking.length > 0) {
          const codes = [...new Set(blocking.map((d) => d.code))].sort().join(', ')
          console.error(
               chalk.red.bold(
                    `\n✖  ${blocking.length} blocking finding${blocking.length === 1 ? '' : 's'} ` +
                    `(${codes}) under --strict=${strict} — exiting with code 1`,
               ),
          )
          process.exit(1)
     }
}
