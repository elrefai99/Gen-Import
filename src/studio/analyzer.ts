import ts from 'typescript'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import type {
    StudioCycle,
    StudioExport,
    StudioExportKind,
    StudioFile,
    StudioFolder,
    StudioImport,
    StudioImportKind,
    StudioSnapshot,
    StudioStats,
    StudioUsage,
} from '../@types'
import { cyclicSccs, tarjanScc } from '../analysis'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const IGNORED_DIRECTORIES = new Set([
    '.git', '.gen-import', '.next', '.nuxt', '.output', '.turbo', '.vite',
    'coverage', 'dist', 'build', 'out', 'node_modules', 'vendor',
])
const GENERATED_FILES = /(?:^|\/)(?:gen-import|gen-app-config|gen-package)\.(?:d\.ts|[cm]?[jt]sx?)$/

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/')
}

function projectPath(rootDir: string, file: string): string {
    return normalizePath(relative(rootDir, file))
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node | undefined): number {
    if (!node) return 1
    try {
        return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    } catch {
        return 1
    }
}

function walkProject(directory: string, files: string[]): void {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue
        const fullPath = join(directory, entry.name)
        if (entry.isDirectory()) {
            if (!IGNORED_DIRECTORIES.has(entry.name)) walkProject(fullPath, files)
            continue
        }
        if (!entry.isFile()) continue
        const normalized = normalizePath(fullPath)
        if (GENERATED_FILES.test(normalized)) continue
        if (entry.name.endsWith('.d.ts')) continue
        if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(resolve(fullPath))
    }
}

function compilerOptions(rootDir: string): ts.CompilerOptions {
    const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json') ??
        ts.findConfigFile(rootDir, ts.sys.fileExists, 'jsconfig.json')
    if (!configPath) {
        return {
            allowJs: true,
            checkJs: false,
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            target: ts.ScriptTarget.ES2020,
        }
    }
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    return ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, dirname(configPath)).options
}

function exportKind(symbol: ts.Symbol): StudioExportKind {
    const declarations = symbol.getDeclarations() ?? []
    if (declarations.some(ts.isFunctionDeclaration)) return 'function'
    if (declarations.some(ts.isClassDeclaration)) return 'class'
    if (declarations.some(ts.isInterfaceDeclaration)) return 'interface'
    if (declarations.some(ts.isEnumDeclaration)) return 'enum'
    if (declarations.some(ts.isTypeAliasDeclaration)) return 'type'
    const variable = declarations.find(ts.isVariableDeclaration)
    if (variable) {
        if (variable.initializer && (ts.isArrowFunction(variable.initializer) || ts.isFunctionExpression(variable.initializer))) return 'function'
        if (variable.initializer && ts.isClassExpression(variable.initializer)) return 'class'
        const list = variable.parent
        return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0
            ? 'constant'
            : 'variable'
    }
    return 'unknown'
}

function declarationName(symbol: ts.Symbol, fallback: string): string {
    for (const declaration of symbol.getDeclarations() ?? []) {
        if ('name' in declaration) {
            const name = (declaration as ts.NamedDeclaration).name
            if (name && ts.isIdentifier(name)) return name.text
        }
    }
    return fallback
}

function isReactComponent(symbol: ts.Symbol, name: string, sourceFile: ts.SourceFile): boolean {
    if (!/^[A-Z]/.test(name)) return false
    const declarations = symbol.getDeclarations() ?? []
    if (!declarations.some((declaration) =>
        ts.isFunctionDeclaration(declaration) ||
        ts.isClassDeclaration(declaration) ||
        ts.isVariableDeclaration(declaration),
    )) return false
    return sourceFile.fileName.endsWith('.tsx') || sourceFile.fileName.endsWith('.jsx')
}

function referenceCount(sourceFile: ts.SourceFile, checker: ts.TypeChecker, declarationName: ts.Identifier): number {
    const target = checker.getSymbolAtLocation(declarationName)
    if (!target) return 0
    let count = 0
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node !== declarationName) {
            const symbol = checker.getSymbolAtLocation(node)
            if (symbol === target) count++
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return count
}

function findCycles(files: StudioFile[], imports: StudioImport[]): StudioCycle[] {
    const runtimeKinds = new Set<StudioImportKind>(['import', 're-export', 'require', 'side-effect'])
    const nodes = files.map((file) => file.path)
    const out = new Map(nodes.map((node) => [node, [] as import('../@types').Edge[]]))
    for (const edge of imports) {
        if (!runtimeKinds.has(edge.kind)) continue
        out.get(edge.source)?.push({
            from: edge.source,
            to: edge.target,
            kind: edge.kind === 'require' ? 'require' : edge.kind === 'side-effect' ? 'side-effect' : 'value-static',
            eager: false,
            bindings: edge.bindings,
            line: edge.line,
        })
    }
    return cyclicSccs(tarjanScc({ nodes, out, barrels: [] })).map((component, index) => ({
        id: `cycle:${index}`,
        files: [...component.members].sort(),
    }))
}

function buildFolders(files: StudioFile[]): StudioFolder[] {
    interface MutableFolder extends StudioFolder { children: MutableFolder[] }
    const roots: MutableFolder[] = []
    const byPath = new Map<string, MutableFolder>()

    for (const file of files) {
        const segments = file.folder ? file.folder.split('/') : []
        let parentPath = ''
        let siblings = roots
        for (const segment of segments) {
            const path = parentPath ? `${parentPath}/${segment}` : segment
            let folder = byPath.get(path)
            if (!folder) {
                folder = { name: segment, path, files: [], children: [] }
                byPath.set(path, folder)
                siblings.push(folder)
            }
            folder.files.push(file.path)
            siblings = folder.children
            parentPath = path
        }
    }

    const sort = (folders: MutableFolder[]): void => {
        folders.sort((a, b) => a.name.localeCompare(b.name))
        for (const folder of folders) sort(folder.children)
    }
    sort(roots)
    return roots
}

function calculateStats(files: StudioFile[], exports: StudioExport[], imports: StudioImport[], cycles: StudioCycle[]): StudioStats {
    const largestFile = [...files].sort((a, b) => b.loc - a.loc)[0]
    const mostImportedFile = [...files].sort((a, b) => b.dependents.length - a.dependents.length)[0]
    const mostImportedExport = [...exports].sort((a, b) => b.usages.length - a.usages.length)[0]
    const divisor = files.length || 1
    return {
        totalFiles: files.length,
        totalExports: exports.length,
        totalImports: imports.length,
        unusedExports: exports.filter((item) => item.unused).length,
        circularDependencies: cycles.length,
        largestFile: largestFile ? { file: largestFile.path, loc: largestFile.loc } : undefined,
        mostImportedFile: mostImportedFile
            ? { file: mostImportedFile.path, imports: mostImportedFile.dependents.length }
            : undefined,
        mostImportedExport: mostImportedExport
            ? { exportId: mostImportedExport.id, name: mostImportedExport.displayName, imports: mostImportedExport.usages.length }
            : undefined,
        averageImportsPerFile: Number((imports.length / divisor).toFixed(2)),
        averageExportsPerFile: Number((exports.length / divisor).toFixed(2)),
    }
}

export class StudioAnalyzer {
    private previousProgram?: ts.Program
    private version = 0

    constructor(private readonly rootDir: string) {}

    analyze(): StudioSnapshot {
        const startedAt = Date.now()
        const files: string[] = []
        walkProject(this.rootDir, files)
        files.sort()

        const options = compilerOptions(this.rootDir)
        if (files.some((file) => /\.[cm]?jsx?$/.test(file))) options.allowJs = true
        const program = ts.createProgram({ rootNames: files, options, oldProgram: this.previousProgram })
        this.previousProgram = program
        const checker = program.getTypeChecker()
        const canonical = (file: string): string => {
            const normalized = normalizePath(file)
            return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase()
        }
        const canonicalFiles = new Map(files.map((file) => [canonical(file), file]))
        const moduleCache = ts.createModuleResolutionCache(
            this.rootDir,
            (value) => ts.sys.useCaseSensitiveFileNames ? value : value.toLowerCase(),
            options,
        )

        const resolveModule = (specifier: string, containingFile: string): string | undefined => {
            const resolvedFile = ts.resolveModuleName(
                specifier,
                containingFile,
                options,
                ts.sys,
                moduleCache,
            ).resolvedModule?.resolvedFileName
            if (!resolvedFile || resolvedFile.includes('node_modules')) return undefined
            return canonicalFiles.get(canonical(resolvedFile))
        }

        const studioFiles: StudioFile[] = []
        const studioExports: StudioExport[] = []
        const exportsByFile = new Map<string, Map<string, StudioExport>>()

        for (const absoluteFile of files) {
            const sourceFile = program.getSourceFile(absoluteFile)
            if (!sourceFile) continue
            const path = projectPath(this.rootDir, absoluteFile)
            let functions = 0
            let classes = 0
            const countDeclarations = (node: ts.Node): void => {
                if (ts.isFunctionDeclaration(node)) functions++
                if (ts.isClassDeclaration(node)) classes++
                ts.forEachChild(node, countDeclarations)
            }
            countDeclarations(sourceFile)

            const file: StudioFile = {
                id: `file:${path}`,
                path,
                name: basename(path),
                folder: normalizePath(dirname(path)) === '.' ? '' : normalizePath(dirname(path)),
                extension: extname(path),
                loc: sourceFile.getLineAndCharacterOfPosition(sourceFile.end).line + 1,
                functions,
                classes,
                exports: [],
                imports: [],
                dependencies: [],
                dependents: [],
            }
            studioFiles.push(file)

            const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
            const fileExports = new Map<string, StudioExport>()
            if (moduleSymbol) {
                for (const exportedSymbol of checker.getExportsOfModule(moduleSymbol)) {
                    const exportedName = exportedSymbol.getName()
                    let target = exportedSymbol
                    if (target.flags & ts.SymbolFlags.Alias) {
                        try { target = checker.getAliasedSymbol(target) } catch { target = exportedSymbol }
                    }
                    const targetDeclaration = target.getDeclarations()?.[0]
                    const localDeclaration = exportedSymbol.getDeclarations()?.find((declaration) => declaration.getSourceFile() === sourceFile)
                    const displayName = exportedName === 'default'
                        ? declarationName(target, 'default')
                        : exportedName
                    const originFile = targetDeclaration ? projectPath(this.rootDir, targetDeclaration.getSourceFile().fileName) : undefined
                    const item: StudioExport = {
                        id: `export:${path}:${exportedName}`,
                        name: exportedName,
                        displayName,
                        kind: exportedName === 'default' && exportKind(target) === 'unknown' ? 'default' : exportKind(target),
                        file: path,
                        line: lineOf(sourceFile, localDeclaration ?? (targetDeclaration?.getSourceFile() === sourceFile ? targetDeclaration : undefined)),
                        isDefault: exportedName === 'default',
                        isNamed: exportedName !== 'default',
                        isReactComponent: isReactComponent(target, displayName, sourceFile),
                        unused: true,
                        originFile: originFile && originFile !== path ? originFile : undefined,
                        usages: [],
                    }
                    studioExports.push(item)
                    fileExports.set(exportedName, item)
                    file.exports.push(item.id)
                }
            }
            exportsByFile.set(path, fileExports)
        }

        const fileByPath = new Map(studioFiles.map((file) => [file.path, file]))
        const studioImports: StudioImport[] = []
        const edgeKeys = new Map<string, StudioImport>()

        const addEdge = (
            source: string,
            targetAbsolute: string | undefined,
            specifier: string,
            line: number,
            kind: StudioImportKind,
            bindings: string[],
        ): StudioImport | undefined => {
            if (!targetAbsolute) return undefined
            const target = projectPath(this.rootDir, targetAbsolute)
            if (!fileByPath.has(target)) return undefined
            const key = `${source}\0${target}\0${kind}`
            const existing = edgeKeys.get(key)
            if (existing) {
                for (const binding of bindings) if (!existing.bindings.includes(binding)) existing.bindings.push(binding)
                existing.line = Math.min(existing.line, line)
                return existing
            }
            const edge: StudioImport = {
                id: `import:${studioImports.length}`,
                source,
                target,
                specifier,
                line,
                kind,
                bindings: [...bindings],
            }
            edgeKeys.set(key, edge)
            studioImports.push(edge)
            fileByPath.get(source)?.imports.push(edge.id)
            return edge
        }

        const addUsage = (
            targetFile: string,
            exportName: string,
            source: string,
            line: number,
            importedAs: string,
            alias: string | undefined,
            references: number,
            kind: StudioImportKind,
        ): void => {
            const targetExport = exportsByFile.get(targetFile)?.get(exportName)
            if (!targetExport) return
            const usage: StudioUsage = {
                id: `usage:${targetExport.usages.length}:${targetExport.id}:${source}`,
                file: source,
                line,
                importedAs,
                alias,
                references,
                kind,
            }
            targetExport.usages.push(usage)
            targetExport.unused = false
        }

        for (const absoluteFile of files) {
            const sourceFile = program.getSourceFile(absoluteFile)
            if (!sourceFile) continue
            const source = projectPath(this.rootDir, absoluteFile)

            for (const statement of sourceFile.statements) {
                if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
                    const specifier = statement.moduleSpecifier.text
                    const targetAbsolute = resolveModule(specifier, absoluteFile)
                    const target = targetAbsolute ? projectPath(this.rootDir, targetAbsolute) : undefined
                    const clause = statement.importClause
                    const namedElements = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
                        ? clause.namedBindings.elements
                        : undefined
                    const allNamedTypeOnly = !!namedElements?.length && namedElements.every((element) => element.isTypeOnly)
                    const kind: StudioImportKind = clause?.isTypeOnly || allNamedTypeOnly ? 'type-import' : clause ? 'import' : 'side-effect'
                    const bindings: string[] = []
                    if (clause?.name) bindings.push(clause.name.text)
                    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bindings.push(clause.namedBindings.name.text)
                    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                        bindings.push(...clause.namedBindings.elements.map((element) => element.name.text))
                    }
                    addEdge(source, targetAbsolute, specifier, lineOf(sourceFile, statement), kind, bindings)
                    if (!target || !clause) continue

                    if (clause.name) {
                        addUsage(target, 'default', source, lineOf(sourceFile, statement), 'default', clause.name.text,
                            referenceCount(sourceFile, checker, clause.name), kind)
                    }
                    const namedBindings = clause.namedBindings
                    if (namedBindings && ts.isNamedImports(namedBindings)) {
                        for (const element of namedBindings.elements) {
                            const importedAs = element.propertyName?.text ?? element.name.text
                            addUsage(
                                target,
                                importedAs,
                                source,
                                lineOf(sourceFile, element),
                                importedAs,
                                element.propertyName ? element.name.text : undefined,
                                referenceCount(sourceFile, checker, element.name),
                                element.isTypeOnly ? 'type-import' : kind,
                            )
                        }
                    } else if (namedBindings && ts.isNamespaceImport(namedBindings)) {
                        const namespaceName = namedBindings.name.text
                        const propertyCounts = new Map<string, { count: number; line: number }>()
                        const findProperties = (node: ts.Node): void => {
                            if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === namespaceName) {
                                const current = propertyCounts.get(node.name.text)
                                propertyCounts.set(node.name.text, {
                                    count: (current?.count ?? 0) + 1,
                                    line: current?.line ?? lineOf(sourceFile, node),
                                })
                            }
                            ts.forEachChild(node, findProperties)
                        }
                        findProperties(sourceFile)
                        for (const [name, data] of propertyCounts) {
                            addUsage(target, name, source, data.line, name, `${namespaceName}.${name}`, data.count, kind)
                        }
                    }
                    continue
                }

                if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
                    const specifier = statement.moduleSpecifier.text
                    const targetAbsolute = resolveModule(specifier, absoluteFile)
                    const target = targetAbsolute ? projectPath(this.rootDir, targetAbsolute) : undefined
                    const bindings: string[] = []
                    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
                        bindings.push(...statement.exportClause.elements.map((element) => element.name.text))
                    }
                    addEdge(source, targetAbsolute, specifier, lineOf(sourceFile, statement), 're-export', bindings)
                    if (!target) continue
                    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
                        for (const element of statement.exportClause.elements) {
                            const original = element.propertyName?.text ?? element.name.text
                            const localExport = exportsByFile.get(source)?.get(element.name.text)
                            if (localExport) localExport.reExportedFrom = exportsByFile.get(target)?.get(original)?.id
                            addUsage(target, original, source, lineOf(sourceFile, element), original,
                                element.propertyName ? element.name.text : undefined, 0, 're-export')
                        }
                    } else {
                        for (const original of exportsByFile.get(target)?.values() ?? []) {
                            if (original.isDefault) continue
                            addUsage(target, original.name, source, lineOf(sourceFile, statement), '*', undefined, 0, 're-export')
                        }
                    }
                }
            }

            const visitCalls = (node: ts.Node): void => {
                if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
                    const specifier = node.arguments[0].text
                    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                        addEdge(source, resolveModule(specifier, absoluteFile), specifier, lineOf(sourceFile, node), 'dynamic-import', [])
                    } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                        addEdge(source, resolveModule(specifier, absoluteFile), specifier, lineOf(sourceFile, node), 'require', [])
                    }
                }
                ts.forEachChild(node, visitCalls)
            }
            visitCalls(sourceFile)
        }

        for (const edge of studioImports) {
            const source = fileByPath.get(edge.source)
            const target = fileByPath.get(edge.target)
            if (source && !source.dependencies.includes(edge.target)) source.dependencies.push(edge.target)
            if (target && !target.dependents.includes(edge.source)) target.dependents.push(edge.source)
        }
        for (const file of studioFiles) {
            file.dependencies.sort()
            file.dependents.sort()
        }
        for (const item of studioExports) item.usages.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

        const cycles = findCycles(studioFiles, studioImports)
        const stats = calculateStats(studioFiles, studioExports, studioImports, cycles)
        return {
            version: ++this.version,
            generatedAt: new Date().toISOString(),
            rootDir: normalizePath(this.rootDir),
            scanDurationMs: Date.now() - startedAt,
            files: studioFiles,
            exports: studioExports,
            imports: studioImports,
            folders: buildFolders(studioFiles),
            cycles,
            stats,
        }
    }
}

export function analyzeStudioProject(rootDir = process.cwd()): StudioSnapshot {
    return new StudioAnalyzer(resolve(rootDir)).analyze()
}
