import ts from 'typescript'
import { dirname, resolve as resolvePath } from 'node:path'
import type { Edge, EdgeKind, ModuleGraph } from '../@types'
import { scanFile, strongerKind, strongerVia, type ScanContext } from './scan'

export interface BuildModuleGraphOptions {
    rootDir: string
    program?: ts.Program
    compilerOptions?: ts.CompilerOptions
    barrelPaths?: string[]
}

export const INIT_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
    'value-static',
    'side-effect',
    'require',
])

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts', '/index.ts', '/index.js']

export function createCanonicalizer(): (p: string) => string {
    const cache = new Map<string, string>()
    const caseSensitive = ts.sys.useCaseSensitiveFileNames

    return (p: string): string => {
        const hit = cache.get(p)
        if (hit !== undefined) return hit

        let real = p
        try {
            if (ts.sys.realpath) real = ts.sys.realpath(p)
        } catch {
            real = p
        }
        real = real.replace(/\\/g, '/')
        if (!caseSensitive) real = real.toLowerCase()

        cache.set(p, real)
        return real
    }
}

export function buildModuleGraph(
    files: string[],
    options: BuildModuleGraphOptions,
): ModuleGraph {
    const { rootDir, program, barrelPaths = [] } = options
    const compilerOptions = options.compilerOptions ?? program?.getCompilerOptions() ?? {}

    const canonical = createCanonicalizer()
    const idByCanonical = new Map<string, string>()
    for (const f of files) idByCanonical.set(canonical(f), f)
    for (const b of barrelPaths) idByCanonical.set(canonical(b), b)

    const barrelSet = new Set(barrelPaths)
    const nodes = [...new Set([...files, ...barrelPaths])].sort()
    const out = new Map<string, Edge[]>()
    for (const n of nodes) out.set(n, [])

    const resolutionCache = ts.createModuleResolutionCache(
        rootDir,
        (x) => (ts.sys.useCaseSensitiveFileNames ? x : x.toLowerCase()),
        compilerOptions,
    )

    const scanCtx: ScanContext = {
        checker: program?.getTypeChecker(),
        preserveImports: !!compilerOptions.verbatimModuleSyntax ||
            compilerOptions.importsNotUsedAsValues === ts.ImportsNotUsedAsValues.Preserve,
    }

    const resolveToNode = (specifier: string, containingFile: string): string | undefined => {
        if (!specifier.startsWith('.') && !specifier.startsWith('/')) return undefined

        const resolved = ts.resolveModuleName(
            specifier,
            containingFile,
            compilerOptions,
            ts.sys,
            resolutionCache,
        ).resolvedModule?.resolvedFileName

        if (resolved && !resolved.includes('node_modules')) {
            const id = idByCanonical.get(canonical(resolved))
            if (id) return id
        }

        if (barrelSet.size > 0) {
            const base = resolvePath(dirname(containingFile), specifier)
            for (const suffix of CANDIDATE_SUFFIXES) {
                const id = idByCanonical.get(canonical(base + suffix))
                if (id && barrelSet.has(id)) return id
            }
        }

        return undefined
    }

    for (const file of files) {
        const sf = program?.getSourceFile(file) ?? parseSourceFile(file)
        if (!sf) continue

        const merged = new Map<string, Edge>()

        for (const raw of scanFile(sf, scanCtx)) {
            const to = resolveToNode(raw.specifier, file)
            if (!to) continue

            const existing = merged.get(to)
            if (existing) {
                existing.kind = strongerKind(existing.kind, raw.kind)
                existing.eager = existing.eager || raw.eager
                if (raw.eagerVia) existing.eagerVia = strongerVia(existing.eagerVia, raw.eagerVia)
                if (raw.eagerLine && !existing.eagerLine) existing.eagerLine = raw.eagerLine
                for (const b of raw.bindings) {
                    if (!existing.bindings.includes(b)) existing.bindings.push(b)
                }
                existing.line = Math.min(existing.line || raw.line, raw.line || existing.line)
            } else {
                merged.set(to, {
                    from: file,
                    to,
                    kind: raw.kind,
                    eager: raw.eager,
                    eagerVia: raw.eagerVia,
                    eagerLine: raw.eagerLine,
                    bindings: [...raw.bindings],
                    line: raw.line,
                })
            }
        }

        out.set(file, [...merged.values()].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0)))
    }

    return { nodes, out, barrels: [...barrelPaths].sort() }
}

function parseSourceFile(file: string): ts.SourceFile | undefined {
    const text = ts.sys.readFile(file)
    if (text === undefined) return undefined
    return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /* setParentNodes */ true)
}

export function contractBarrel(
    graph: ModuleGraph,
    barrelId: string,
    ownerByName: Map<string, string>,
    exportedFiles: string[],
): ModuleGraph {
    const out = new Map<string, Edge[]>()

    for (const [from, edges] of graph.out) {
        if (from === barrelId) {
            out.set(from, [])
            continue
        }

        const rewritten = new Map<string, Edge>()
        const add = (to: string, source: Edge): void => {
            if (to === from) return
            const existing = rewritten.get(to)
            if (existing) {
                existing.eager = existing.eager || source.eager
                if (source.eagerVia) existing.eagerVia = strongerVia(existing.eagerVia, source.eagerVia)
                if (source.eagerLine && !existing.eagerLine) existing.eagerLine = source.eagerLine
                for (const b of source.bindings) {
                    if (!existing.bindings.includes(b)) existing.bindings.push(b)
                }
            } else {
                rewritten.set(to, { ...source, to, bindings: [...source.bindings], viaBarrel: barrelId })
            }
        }

        for (const edge of edges) {
            if (edge.to !== barrelId) {
                const existing = rewritten.get(edge.to)
                if (!existing) rewritten.set(edge.to, edge)
                continue
            }
            if (!INIT_EDGE_KINDS.has(edge.kind)) continue

            if (edge.bindings.length > 0) {
                for (const binding of edge.bindings) {
                    const owner = ownerByName.get(binding)
                    if (owner) add(owner, edge)
                }
            } else {
                for (const owner of exportedFiles) add(owner, edge)
            }
        }

        out.set(from, [...rewritten.values()].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0)))
    }

    if (!out.has(barrelId)) out.set(barrelId, [])

    const nodes = graph.nodes.includes(barrelId) ? graph.nodes : [...graph.nodes, barrelId].sort()
    return { nodes, out, barrels: graph.barrels }
}

export function withBarrelExports(
    graph: ModuleGraph,
    barrelId: string,
    exportedFiles: string[],
): ModuleGraph {
    const out = new Map(graph.out)
    const nodes = graph.nodes.includes(barrelId)
        ? graph.nodes
        : [...graph.nodes, barrelId].sort()

    const edges: Edge[] = [...new Set(exportedFiles)]
        .filter((f) => f !== barrelId)
        .sort()
        .map((to) => ({
            from: barrelId,
            to,
            kind: 'value-static' as EdgeKind,
            eager: false, // re-exports compile to lazy getters / live bindings
            bindings: [],
            line: 0,
        }))

    out.set(barrelId, edges)
    return { nodes, out, barrels: graph.barrels }
}

export function consumersOf(graph: ModuleGraph, barrelId: string): string[] {
    const consumers: string[] = []
    for (const [from, edges] of graph.out) {
        if (from === barrelId) continue
        if (edges.some((e) => e.to === barrelId && INIT_EDGE_KINDS.has(e.kind))) consumers.push(from)
    }
    return consumers.sort()
}
