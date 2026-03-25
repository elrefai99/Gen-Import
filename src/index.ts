import ts from 'typescript'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { FileInfo, GenAppConfigOptions, GenImportOptions, GenPackageOptions } from './@types'

const DEFAULT_SKIP_PATTERNS = ['__tests__', '.test.', '.spec.']
const DEFAULT_MODULE_FILE_PATTERN = '.module.ts'

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e: import('node:fs').Dirent) => {
        const full = join(dir, e.name)
        return e.isDirectory() ? walk(full) : [full]
    })
}

function detectModuleType(rootDir: string): 'esm' | 'cjs' {
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

/**
 * Detect whether the project is TypeScript or JavaScript.
 * A project is considered TypeScript if `tsconfig.json` exists at the root
 * OR any `.ts` / `.tsx` file is present inside `srcDir`.
 * When the project is TypeScript the `.js` companion files are not needed
 * (the TS compiler produces them); only `.d.ts` barrels are written.
 */
function detectProjectLanguage(rootDir: string, srcDir: string): 'ts' | 'js' {
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
function toJsPath(filePath: string): string {
    return filePath.replace(/\.d\.ts$/, '.js').replace(/(?<!\.d)\.ts$/, '.js')
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

function buildDtsOutput(infos: FileInfo[], outFileName: string): string {
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

function buildJsOutput(
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

function buildPackageDts(packages: string[], outFileName: string): string {
    const baseName = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
    const lines: string[] = [
        '/**',
        ` * ${baseName}.d.ts — AUTO-GENERATED, do not edit manually.`,
        ' * Regenerate: npx gen-import --packages',
        ' */',
        '',
    ]
    for (const pkg of packages) {
        lines.push(`export * from '${pkg}';`)
    }
    lines.push('')
    return lines.join('\n')
}

function buildPackageJs(
    packages: string[],
    outFileName: string,
    moduleType: 'esm' | 'cjs',
): string {
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

// ─── barrel-file export parser ───────────────────────────────────────────────

/**
 * Parse a barrel `.d.ts` and return every exported name it declares.
 * Handles named exports, type exports, aliased defaults, and `export * from`.
 * Wildcard re-exports (`export * from`) are recorded as the sentinel `'*'`.
 */
function parseBarrelExports(filePath: string): Set<string> {
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

export function genImport(options: GenImportOptions = {}): void {
    const rootDir = resolve(options.rootDir ?? process.cwd())
    const srcDir = resolve(rootDir, options.srcDir ?? 'src')
    const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
    const moduleType = detectModuleType(rootDir)

    // TS projects: generate a real .ts source file (importable by tsx / ts-node / tsc).
    // JS projects: generate a .js runtime file (Node can import it directly).
    // .d.ts is never a valid import target — it is declaration-only.
    const outFileName = options.outFileName ?? (isTs ? 'gen-import.ts' : 'gen-import.js')
    const outFile = join(srcDir, outFileName)

    // For JS projects we also write a companion .d.ts so editors get type info.
    const writeTypeDecl = !isTs && !outFileName.endsWith('.d.ts')

    const generateJs = options.generateJs ?? false  // only used when outFile is .ts
    const moduleFilePattern = options.moduleFilePattern ?? DEFAULT_MODULE_FILE_PATTERN
    const pureReexports = new Set(options.pureReexports ?? [])
    const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

    // Files to skip when scanning srcDir
    const extraSkip = new Set([outFile, toJsPath(outFile)])

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

    // Main output:
    //   TS projects → .ts file with full TypeScript export syntax (export type { ... })
    //   JS projects → .js file with runtime-only exports (no `export type`)
    if (isTs) {
        writeFileSync(outFile, buildDtsOutput(infos, outFileName), 'utf-8')
    } else {
        writeFileSync(outFile, buildJsOutput(infos, outFileName, moduleType), 'utf-8')
    }

    // JS projects: write a .d.ts type-declaration companion so TypeScript IDEs get types
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

export function genPackage(options: GenPackageOptions = {}): void {
    const rootDir = resolve(options.rootDir ?? process.cwd())
    const srcDir = resolve(rootDir, options.srcDir ?? 'src')
    const outFileName = options.outFileName ?? 'gen-package.d.ts'
    const outFile = join(srcDir, outFileName)
    // gen-package always needs a .js runtime companion — packages live in node_modules
    // and must be require()-able at runtime regardless of project language.
    const generateJs = options.generateJs ?? true
    const moduleType = detectModuleType(rootDir)

    const pkgPath = join(rootDir, 'package.json')
    if (!existsSync(pkgPath)) {
        console.error('gen-import: no package.json found at', rootDir)
        process.exit(1)
    }

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
    }

    let packages = Object.keys(pkg.dependencies ?? {})
    if (options.includeDev) {
        packages = [...new Set([...packages, ...Object.keys(pkg.devDependencies ?? {})])]
    }
    if (options.includePackages?.length) {
        packages = packages.filter((p) => options.includePackages!.includes(p))
    }
    if (options.excludePackages?.length) {
        packages = packages.filter((p) => !options.excludePackages!.includes(p))
    }

    // Write .d.ts
    writeFileSync(outFile, buildPackageDts(packages, outFileName), 'utf-8')

    // Write .js companion
    if (generateJs) {
        const jsFile = toJsPath(outFile)
        writeFileSync(jsFile, buildPackageJs(packages, outFileName, moduleType), 'utf-8')
        console.log(`✓  ${relative(rootDir, jsFile)}`)
    }

    console.log(`✓  ${relative(rootDir, outFile)}`)
    console.log(`   ${packages.length} packages · module: ${moduleType}`)
}

export function genAppConfig(options: GenAppConfigOptions = {}): void {
    const rootDir = resolve(options.rootDir ?? process.cwd())
    const srcDir = resolve(rootDir, options.srcDir ?? 'src')
    const outFileName = options.outFileName ?? 'gen-app-config.d.ts'
    const outFile = join(srcDir, outFileName)
    const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
    // Mirror the same default that genImport() uses so auto-update finds the right file
    const genImportFileName = options.genImportFile ?? (isTs ? 'gen-import.ts' : 'gen-import.js')
    const genPackageFileName = options.genPackageFile ?? 'gen-package.d.ts'
    const genImportPath = join(srcDir, genImportFileName)
    const genPackagePath = join(srcDir, genPackageFileName)
    const autoUpdate = options.autoUpdate ?? true
    const generateJs = options.generateJs ?? !isTs
    const moduleType = detectModuleType(rootDir)
    const moduleFilePattern = options.moduleFilePattern ?? DEFAULT_MODULE_FILE_PATTERN
    const pureReexports = new Set(options.pureReexports ?? [])
    const skipPatterns = [...DEFAULT_SKIP_PATTERNS, ...(options.skipPatterns ?? [])]

    if (autoUpdate && existsSync(genImportPath)) {
        const knownExports = parseBarrelExports(genImportPath)

        function shouldSkip(file: string): boolean {
            if (file.endsWith('.d.ts')) return true
            if (!file.endsWith('.ts')) return true
            if (file === genImportPath || file === outFile) return true
            const rel = relative(rootDir, file).replace(/\\/g, '/')
            if (pureReexports.has(rel)) return true
            return skipPatterns.some((p) => rel.includes(p))
        }

        const allFiles = walk(srcDir).filter((f) => !shouldSkip(f)).sort()
        const regularFiles = allFiles.filter((f) => !f.includes(moduleFilePattern))
        const moduleFiles = allFiles.filter((f) => f.includes(moduleFilePattern))
        const allInfos = analyzeFiles([...regularFiles, ...moduleFiles], rootDir, srcDir)

        // Collect only the exports not yet present in gen-import.d.ts
        const appendLines: string[] = []
        let newCount = 0

        for (const { importPath, types, values, defaultAlias } of allInfos) {
            const newTypes = types.filter((n) => !knownExports.has(n))
            const newValues = values.filter((n) => !knownExports.has(n))
            const newDefault =
                defaultAlias && !knownExports.has(defaultAlias) ? defaultAlias : null

            if (newTypes.length) {
                appendLines.push(`export type { ${newTypes.join(', ')} } from '${importPath}';`)
                newCount += newTypes.length
            }
            if (newValues.length) {
                appendLines.push(`export { ${newValues.join(', ')} } from '${importPath}';`)
                newCount += newValues.length
            }
            if (newDefault) {
                appendLines.push(
                    `export { default as ${newDefault} } from '${importPath}';`,
                )
                newCount++
            }
        }

        if (appendLines.length) {
            const existing = readFileSync(genImportPath, 'utf-8').trimEnd()
            writeFileSync(
                genImportPath,
                existing + '\n' + appendLines.join('\n') + '\n',
                'utf-8',
            )
            console.log(
                `✓  ${relative(rootDir, genImportPath)} (auto-updated: +${newCount} new exports)`,
            )

            // Regenerate the .js companion for gen-import so it stays in sync
            if (generateJs) {
                const jsFile = toJsPath(genImportPath)
                if (existsSync(jsFile)) {
                    writeFileSync(
                        jsFile,
                        buildJsOutput(allInfos, genImportFileName, moduleType),
                        'utf-8',
                    )
                    console.log(`✓  ${relative(rootDir, jsFile)} (auto-updated)`)
                }
            }
        }
    }

    const hasGenImport = existsSync(genImportPath)
    const hasGenPackage = existsSync(genPackagePath)
    const genImportBase = genImportFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
    const genPackageBase = genPackageFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')
    const configBase = outFileName.replace(/\.d\.ts$/, '').replace(/\.ts$/, '')

    const dtsLines: string[] = [
        '/**',
        ` * ${configBase}.d.ts — AUTO-GENERATED, do not edit manually.`,
        ' * Regenerate: npx gen-import --app-config',
        ' * Imports only from barrel files — no per-file imports.',
        ' */',
        '',
    ]
    if (hasGenImport) dtsLines.push(`export * from './${genImportBase}';`)
    if (hasGenPackage) dtsLines.push(`export * from './${genPackageBase}';`)
    dtsLines.push('')

    writeFileSync(outFile, dtsLines.join('\n'), 'utf-8')
    console.log(`✓  ${relative(rootDir, outFile)}`)

    if (generateJs) {
        const jsFile = toJsPath(outFile)
        const jsLines: string[] = [
            '/**',
            ` * ${configBase}.js — AUTO-GENERATED, do not edit manually.`,
            ' * Regenerate: npx gen-import --app-config',
            ' * Imports only from barrel files — no per-file imports.',
            ' */',
            '',
        ]

        if (moduleType === 'esm') {
            if (hasGenImport) jsLines.push(`export * from './${genImportBase}.js';`)
            if (hasGenPackage) jsLines.push(`export * from './${genPackageBase}.js';`)
        } else {
            jsLines.push('"use strict";')
            jsLines.push('Object.defineProperty(exports, "__esModule", { value: true });')
            jsLines.push('')
            if (hasGenImport) {
                jsLines.push(`const _gi = require('./${genImportBase}.js');`)
                jsLines.push(
                    `if (_gi && typeof _gi === 'object') ` +
                    `Object.keys(_gi).forEach(function(k) { if (k !== 'default') exports[k] = _gi[k]; });`,
                )
            }
            if (hasGenPackage) {
                jsLines.push(`const _gp = require('./${genPackageBase}.js');`)
                jsLines.push(
                    `if (_gp && typeof _gp === 'object') ` +
                    `Object.keys(_gp).forEach(function(k) { if (k !== 'default') exports[k] = _gp[k]; });`,
                )
            }
        }
        jsLines.push('')

        writeFileSync(jsFile, jsLines.join('\n'), 'utf-8')
        console.log(`✓  ${relative(rootDir, jsFile)}`)
    }

    const barrels = [
        hasGenImport ? genImportFileName : null,
        hasGenPackage ? genPackageFileName : null,
    ]
        .filter(Boolean)
        .join(', ')
    console.log(`   barrel sources: ${barrels || '(none found)'} · module: ${moduleType}`)
}
