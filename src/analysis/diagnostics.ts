import chalk from 'chalk'
import { relative } from 'node:path'
import type {
    BarrelAnalysis,
    Diagnostic,
    DiagnosticCode,
    DiagnosticSeverity,
    Edge,
    EagerVia,
    ModuleGraph,
    SccResult,
} from '../@types'
import { INIT_EDGE_KINDS } from './graph'
import { cycleEdges, cyclicSccs, shortestCycle } from './scc'

export const SEVERITY_BY_CODE: Record<DiagnosticCode, DiagnosticSeverity> = {
    GI001: 'error', // cycle with an init-time read
    GI002: 'error', // barrel inside a cycle, init-time read
    GI003: 'warn',  // cycle, all reads deferred
    GI004: 'warn',  // barrel inside a cycle, all reads deferred
    GI005: 'info',  // type-only cycle
    GI006: 'warn',  // export name collision
    GI007: 'info',  // direct import recommended
    GI008: 'info',  // dynamic import recommended
    GI009: 'info',  // NestJS forwardRef recommended
}

const NEST_FILE = /\.(module|service|controller|guard|resolver|interceptor|pipe|filter)\.[cm]?tsx?$/

function rel(rootDir: string, file: string): string {
    return relative(rootDir, file).replace(/\\/g, '/') || file
}

export function explainVia(via: EagerVia | undefined): string {
    switch (via) {
        case 'heritage': return 'class heritage clause (`class X extends Y`)'
        case 'decorator': return 'decorator argument — evaluated when the class is defined'
        case 'static': return 'static field / static block initialiser'
        case 'star-reexport': return '`export *` — enumerates the target during evaluation'
        case 'side-effect': return 'side-effect import (`import \'./x\'`)'
        default: return 'top-level statement in the module body'
    }
}

/** Pick the remedy that actually applies to this cycle. */
function adviseFor(rootDir: string, edges: Edge[], members: string[]): { code: DiagnosticCode; advice: string } {
    const eager = edges.filter((e) => e.eager)

    if (eager.length === 0) {
        return {
            code: 'GI008',
            advice:
                'Every read on this cycle is deferred, so it resolves at call time. ' +
                'Keep it that way — moving any of these reads to the module body will break initialisation.',
        }
    }

    const decorator = eager.find((e) => e.eagerVia === 'decorator')
    if (decorator && members.some((m) => NEST_FILE.test(m))) {
        const names = decorator.bindings.length ? decorator.bindings[0] : 'Dep'
        return {
            code: 'GI009',
            advice:
                `Decorator-time read in a NestJS cycle. Break it with forwardRef:\n` +
                `      @Module({ imports: [forwardRef(() => ${names}Module)] })\n` +
                `      constructor(@Inject(forwardRef(() => ${names})) private ${names.toLowerCase()}: ${names})`,
        }
    }

    const heritage = eager.find((e) => e.eagerVia === 'heritage')
    if (heritage) {
        return {
            code: 'GI007',
            advice:
                `\`${heritage.bindings.join(', ') || 'base class'}\` is read to build a class at ` +
                `${rel(rootDir, heritage.from)}:${heritage.eagerLine ?? heritage.line}. ` +
                'A base class cannot be lazily resolved — import it directly from its source file.',
        }
    }

    const first = eager[0]
    const routed = first.viaBarrel
        ? ` The import is routed through ${rel(rootDir, first.viaBarrel)}, but the dependency is real either way.`
        : ''
    return {
        code: 'GI007',
        advice:
            `Init-time read at ${rel(rootDir, first.from)}:${first.eagerLine ?? first.line} ` +
            `(${explainVia(first.eagerVia)}). Import ${first.bindings.join(', ') || 'it'} directly, ` +
            'or move the read inside a function body so it resolves after both modules finish loading.' +
            routed,
    }
}

export function collectCycleDiagnostics(
    graph: ModuleGraph,
    result: SccResult,
    rootDir: string,
    options: { skipNodes?: ReadonlySet<string> } = {},
): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    const skip = options.skipNodes

    for (const scc of cyclicSccs(result)) {
        if (skip && scc.members.some((m) => skip.has(m))) continue

        const edges = cycleEdges(graph, scc, INIT_EDGE_KINDS)
        const eager = edges.filter((e) => e.eager)
        const code: DiagnosticCode = eager.length > 0 ? 'GI001' : 'GI003'
        const path = shortestCycle(graph, scc, INIT_EDGE_KINDS).map((p) => rel(rootDir, p))
        const { advice } = adviseFor(rootDir, edges, scc.members)

        diagnostics.push({
            code,
            severity: SEVERITY_BY_CODE[code],
            message:
                eager.length > 0
                    ? `Circular dependency read during module evaluation — ${explainVia(eager[0].eagerVia)}`
                    : 'Circular dependency, all reads deferred — resolves at call time',
            files: scc.members.map((m) => rel(rootDir, m)),
            cycle: path,
            advice,
        })
    }

    return diagnostics
}

export function collectBarrelDiagnostics(
    analysis: BarrelAnalysis,
    rootDir: string,
    options: { safeBarrels?: boolean } = {},
): Diagnostic[] {
    const barrel = rel(rootDir, analysis.barrelId)
    const cycle = analysis.cycle.map((p) => rel(rootDir, p))

    const offerFlag = analysis.lazy
        ? ` ${barrel} only forwards this — the cycle is between your own modules, so --safe-barrels cannot remove it.`
        : options.safeBarrels
            ? ''
            : ' Run with --safe-barrels to withhold the offending exports and print direct-import lines.'

    switch (analysis.safety) {
        case 'safe':
            return []

        case 'type-safe':
            return [{
                code: 'GI005',
                severity: SEVERITY_BY_CODE.GI005,
                message: `${barrel} participates in a type-only cycle — erased before runtime, harmless today`,
                files: analysis.members.map((m) => rel(rootDir, m)),
                cycle,
                advice:
                    'Becomes a real cycle if an `import type` annotation is dropped or ' +
                    'verbatimModuleSyntax is enabled. Keep the type-only imports annotated.',
            }]

        case 'ordered':
            return [{
                code: 'GI004',
                severity: SEVERITY_BY_CODE.GI004,
                message: `${barrel} is inside a cycle, but every read is deferred — initialisation still completes`,
                files: analysis.members.map((m) => rel(rootDir, m)),
                cycle,
                advice:
                    'Fragile: one `class X extends Y` or decorator argument reading through the barrel ' +
                    'turns this into a runtime failure.' + offerFlag,
            }]

        case 'unsafe': {
            const first = analysis.eagerEdges[0]
            return [{
                code: 'GI002',
                severity: SEVERITY_BY_CODE.GI002,
                message: `${barrel} is inside a cycle with an init-time read — this fails at runtime`,
                files: analysis.members.map((m) => rel(rootDir, m)),
                cycle,
                advice:
                    (first
                        ? `Breaks at ${rel(rootDir, first.from)}:${first.eagerLine ?? first.line} — ` +
                        `${explainVia(first.eagerVia)}.`
                        : '') + offerFlag,
            }]
        }
    }
}

export function countBySeverity(diagnostics: Diagnostic[]): Record<DiagnosticSeverity, number> {
    const counts: Record<DiagnosticSeverity, number> = { error: 0, warn: 0, info: 0 }
    for (const d of diagnostics) counts[d.severity]++
    return counts
}

const SEVERITY_STYLE: Record<DiagnosticSeverity, (s: string) => string> = {
    error: (s) => chalk.red.bold(s),
    warn: (s) => chalk.yellow.bold(s),
    info: (s) => chalk.blue.bold(s),
}

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
    error: 'error',
    warn: 'warn',
    info: 'info',
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
    const order: DiagnosticSeverity[] = ['error', 'warn', 'info']
    const sorted = [...diagnostics].sort(
        (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.code.localeCompare(b.code),
    )

    const lines: string[] = []
    for (const d of sorted) {
        const style = SEVERITY_STYLE[d.severity]
        lines.push(`${style(`${SEVERITY_LABEL[d.severity]} ${d.code}`)}  ${d.message}`)
        if (d.cycle?.length) {
            lines.push('    ' + d.cycle.map((p) => chalk.yellow(p)).join(chalk.red(' → ')))
        }
        if (d.advice) {
            lines.push('    ' + chalk.gray('fix: ') + chalk.gray(d.advice))
        }
        lines.push('')
    }
    if (lines[lines.length - 1] === '') lines.pop()

    return lines.join('\n')
}
