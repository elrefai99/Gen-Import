import ts from 'typescript'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { ExportEntry, ExportKind, ExportMapEntry, ExportMapOptions, ExportMapResult } from '../@types'
import { walk, DEFAULT_SKIP_PATTERNS, DEFAULT_MODULE_FILE_PATTERN } from '../utils'
import { createTsProgram } from '../script'

function normalizePath(p: string): string {
    return p.replace(/\\/g, '/')
}

function buildImportGraph(
    program: ts.Program,
    files: string[],
    compilerOptions: ts.CompilerOptions,
): { imports: Map<string, Set<string>>; importedBy: Map<string, Set<string>> } {
    const normalizedToOriginal = new Map(files.map((f) => [normalizePath(f), f]))
    const fileSet = new Set(normalizedToOriginal.keys())
    const imports = new Map<string, Set<string>>()
    const importedBy = new Map<string, Set<string>>()

    for (const file of files) {
        imports.set(file, new Set())
        importedBy.set(file, new Set())
    }

    for (const file of files) {
        const sf = program.getSourceFile(file)
        if (!sf) continue

        for (const stmt of sf.statements) {
            if (!ts.isImportDeclaration(stmt)) continue

            const moduleSpec = stmt.moduleSpecifier
            if (!ts.isStringLiteral(moduleSpec)) continue

            const specText = moduleSpec.text
            if (!specText.startsWith('.') && !specText.startsWith('/')) continue

            const resolved = ts.resolveModuleName(specText, file, compilerOptions, ts.sys)
            const rawResolved = resolved.resolvedModule?.resolvedFileName
            if (!rawResolved) continue
            if (rawResolved.includes('node_modules')) continue

            const normalizedResolved = normalizePath(rawResolved)
            if (!fileSet.has(normalizedResolved)) continue

            const resolvedFile = normalizedToOriginal.get(normalizedResolved)!
            imports.get(file)!.add(resolvedFile)
            importedBy.get(resolvedFile)!.add(file)
        }
    }

    return { imports, importedBy }
}

function analyzeExports(
    program: ts.Program,
    files: string[],
): Map<string, ExportEntry[]> {
    const checker = program.getTypeChecker()
    const result = new Map<string, ExportEntry[]>()

    for (const file of files) {
        const sf = program.getSourceFile(file)
        if (!sf) continue

        const mod = checker.getSymbolAtLocation(sf)
        if (!mod) continue

        const entries: ExportEntry[] = []

        for (const sym of checker.getExportsOfModule(mod)) {
            const name = sym.getName()

            if (name === 'default') {
                entries.push({ name: 'default', kind: 'default' })
                continue
            }

            const f = sym.getFlags()
            const isTypeOnly =
                !!(f & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) &&
                !(f & ts.SymbolFlags.Value)

            const kind: ExportKind = isTypeOnly ? 'type' : 'value'
            entries.push({ name, kind })
        }

        if (entries.length) result.set(file, entries)
    }

    return result
}

function reportConsole(result: ExportMapResult): string {
    const lines: string[] = [
        `📦 Export Map — ${result.totalFiles} files, ${result.totalExports} exports, ${result.totalImportEdges} import edges`,
    ]

    for (const entry of result.entries) {
        if (!entry.exports.length) continue
        lines.push('')
        lines.push(`  ${entry.file}  (${entry.exports.length} exports, imported by ${entry.importedBy.length})`)

        const values = entry.exports.filter((e) => e.kind === 'value').map((e) => e.name)
        const types = entry.exports.filter((e) => e.kind === 'type').map((e) => e.name)
        const defaults = entry.exports.filter((e) => e.kind === 'default')

        const hasImportedBy = entry.importedBy.length > 0
        const sectionCount =
            (defaults.length ? 1 : 0) +
            (values.length ? 1 : 0) +
            (types.length ? 1 : 0) +
            (hasImportedBy ? 1 : 0)
        let sectionIdx = 0

        if (defaults.length) {
            sectionIdx++
            const branch = sectionIdx === sectionCount ? '└─' : '├─'
            lines.push(`    ${branch} default: ${defaults.map((e) => e.name).join(', ')}`)
        }
        if (values.length) {
            sectionIdx++
            const branch = sectionIdx === sectionCount ? '└─' : '├─'
            lines.push(`    ${branch} values: ${values.join(', ')}`)
        }
        if (types.length) {
            sectionIdx++
            const branch = sectionIdx === sectionCount ? '└─' : '├─'
            lines.push(`    ${branch} types:  ${types.join(', ')}`)
        }
        if (hasImportedBy) {
            lines.push(`    └─ imported by:`)
            for (const dep of entry.importedBy) {
                lines.push(`         ← ${dep}`)
            }
        }
    }

    return lines.join('\n')
}

function reportJson(result: ExportMapResult): string {
    return JSON.stringify(
        {
            totalFiles: result.totalFiles,
            totalExports: result.totalExports,
            totalImportEdges: result.totalImportEdges,
            files: result.entries,
        },
        null,
        2,
    )
}

function nodeId(filePath: string): string {
    return filePath.replace(/[^a-zA-Z0-9]/g, '_')
}

function reportMermaid(result: ExportMapResult): string {
    const lines: string[] = ['```mermaid', 'flowchart LR']

    for (const entry of result.entries) {
        const id = nodeId(entry.file)
        const exportNames = entry.exports.map((e) => e.name).join(', ')
        const label = exportNames.length > 50 ? exportNames.slice(0, 47) + '...' : exportNames
        const nodeLabel = label ? `${entry.file}\\n${label}` : entry.file
        lines.push(`  ${id}["${nodeLabel}"]`)
    }

    for (const entry of result.entries) {
        const fromId = nodeId(entry.file)
        for (const importedFile of entry.importsFrom) {
            const toId = nodeId(importedFile)
            lines.push(`  ${fromId} --> ${toId}`)
        }
    }

    lines.push('```')
    return lines.join('\n')
}

export function genExportMap(options: ExportMapOptions = {}): ExportMapResult {
    const rootDir = resolve(options.rootDir ?? process.cwd())
    const srcDir = resolve(rootDir, options.srcDir ?? 'src')
    const format = options.format ?? 'console'
    const includeImports = options.includeImports !== false
    const moduleFilePattern = options.moduleFilePattern ?? DEFAULT_MODULE_FILE_PATTERN
    const pureReexports = new Set(options.pureReexports ?? [])
    const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

    function shouldSkip(file: string): boolean {
        if (file.endsWith('.d.ts')) return true
        if (!file.endsWith('.ts') && !file.endsWith('.js')) return true
        const rel = relative(rootDir, file).replace(/\\/g, '/')
        if (pureReexports.has(rel)) return true
        return skipPatterns.some((p) => rel.includes(p))
    }

    const allFiles = walk(srcDir)
        .filter((f) => !shouldSkip(f) && !f.includes(moduleFilePattern))
        .sort()
        .concat(
            walk(srcDir)
                .filter((f) => !shouldSkip(f) && f.includes(moduleFilePattern))
                .sort(),
        )

    const program = createTsProgram(allFiles, rootDir)
    const compilerOptions = program.getCompilerOptions()

    const exportsByFile = analyzeExports(program, allFiles)

    let importsMap = new Map<string, Set<string>>()
    let importedByMap = new Map<string, Set<string>>()

    if (includeImports) {
        const graph = buildImportGraph(program, allFiles, compilerOptions)
        importsMap = graph.imports
        importedByMap = graph.importedBy
    }

    const entries: ExportMapEntry[] = allFiles
        .filter((file) => exportsByFile.has(file))
        .map((file) => {
            const relFile = relative(rootDir, file).replace(/\\/g, '/')
            const importsFrom = [...(importsMap.get(file) ?? [])].map(
                (f) => relative(rootDir, f).replace(/\\/g, '/'),
            )
            const importedBy = [...(importedByMap.get(file) ?? [])].map(
                (f) => relative(rootDir, f).replace(/\\/g, '/'),
            )
            return {
                file: relFile,
                exports: exportsByFile.get(file)!,
                importedBy,
                importsFrom,
            }
        })

    const totalExports = entries.reduce((n, e) => n + e.exports.length, 0)
    const totalImportEdges = entries.reduce((n, e) => n + e.importsFrom.length, 0)

    const result: ExportMapResult = {
        entries,
        totalFiles: entries.length,
        totalExports,
        totalImportEdges,
    }

    let output: string
    switch (format) {
        case 'json':
            output = reportJson(result)
            break
        case 'mermaid':
            output = reportMermaid(result)
            break
        default:
            output = reportConsole(result)
    }

    if (options.outFile) {
        writeFileSync(options.outFile, output, 'utf-8')
    } else {
        console.log(output)
    }

    const docsDir = join(rootDir, 'docs')
    if (!existsSync(docsDir)) {
        mkdirSync(docsDir, { recursive: true })
    }
    writeFileSync(join(docsDir, 'export-map.json'), reportJson(result), 'utf-8')

    return result
}
