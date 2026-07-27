import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { scanFile } from '../../src/analysis/scan'
import { tarjanScc, topoOrder, cyclicSccs, shortestCycle } from '../../src/analysis/scc'
import type { Edge, EdgeKind, ModuleGraph } from '../../src/@types'

function parse(source: string): ts.SourceFile {
    return ts.createSourceFile('probe.ts', source, ts.ScriptTarget.Latest, true)
}

function edgesFor(source: string) {
    return scanFile(parse(source))
}

describe('scan: edge kinds', () => {
    const cases: Array<[string, string, EdgeKind]> = [
        ['named value import', `import { a } from './m'\nconsole.log(a)`, 'value-static'],
        ['type-only import', `import type { A } from './m'\nlet x: A`, 'type-only'],
        ['inline type specifiers', `import { type A, type B } from './m'\nlet x: A`, 'type-only'],
        ['side-effect import', `import './m'`, 'side-effect'],
        ['dynamic import', `async function f() { await import('./m') }`, 'dynamic'],
        ['top-level require', `const m = require('./m')\nconsole.log(m)`, 'require'],
        ['require inside a function', `function f() { return require('./m') }`, 'dynamic'],
        ['re-export', `export { a } from './m'`, 'value-static'],
        ['type re-export', `export type { A } from './m'`, 'type-only'],
    ]

    for (const [name, source, expected] of cases) {
        test(name, () => {
            const [edge] = edgesFor(source)
            assert.ok(edge, `no edge extracted from: ${source}`)
            assert.equal(edge.kind, expected)
        })
    }

    test('a mixed import stays a value edge', () => {
        const [edge] = edgesFor(`import { type A, b } from './m'\nconsole.log(b)`)
        assert.equal(edge.kind, 'value-static')
    })
})

describe('scan: eager vs deferred reads', () => {
    const eager: Array<[string, string]> = [
        ['class heritage', `import { B } from './m'\nexport class C extends B {}`],
        ['decorator argument', `import { Dep } from './m'\n@Dep() class C {}`],
        ['top-level call', `import { f } from './m'\nexport const v = f()`],
        ['static field', `import { X } from './m'\nclass C { static v = X }`],
        ['static block', `import { X } from './m'\nclass C { static { console.log(X) } }`],
        ['side-effect import', `import './m'`],
        ['export star', `export * from './m'`],
    ]

    for (const [name, source] of eager) {
        test(`eager: ${name}`, () => {
            const [edge] = edgesFor(source)
            assert.equal(edge.eager, true, `expected an init-time read in: ${source}`)
        })
    }

    const deferred: Array<[string, string]> = [
        ['function body', `import { f } from './m'\nexport const g = () => f()`],
        ['method body', `import { f } from './m'\nclass C { run() { return f() } }`],
        ['instance field', `import { X } from './m'\nclass C { v = X }`],
        ['default parameter', `import { X } from './m'\nexport function f(a = X) { return a }`],
        ['type position only', `import { T } from './m'\nexport function f(a: T) { return a }`],
        ['named re-export', `export { a } from './m'`],
    ]

    for (const [name, source] of deferred) {
        test(`deferred: ${name}`, () => {
            const [edge] = edgesFor(source)
            assert.equal(edge.eager, false, `expected no init-time read in: ${source}`)
        })
    }

    test('records why the read is eager', () => {
        const [heritage] = edgesFor(`import { B } from './m'\nexport class C extends B {}`)
        assert.equal(heritage.eagerVia, 'heritage')

        const [decorator] = edgesFor(`import { D } from './m'\n@D() class C {}`)
        assert.equal(decorator.eagerVia, 'decorator')
    })

    test('implements clause is erased, not a value read', () => {
        const [edge] = edgesFor(`import { I } from './m'\nexport class C implements I {}`)
        assert.equal(edge.eager, false)
    })
})

/** Build a graph from an adjacency description; every edge is value-static. */
function graphOf(adjacency: Record<string, string[]>, eagerPairs: string[] = []): ModuleGraph {
    const eager = new Set(eagerPairs)
    const nodes = [...new Set([...Object.keys(adjacency), ...Object.values(adjacency).flat()])].sort()
    const out = new Map<string, Edge[]>()
    for (const node of nodes) {
        out.set(
            node,
            [...(adjacency[node] ?? [])].sort().map((to) => ({
                from: node,
                to,
                kind: 'value-static' as EdgeKind,
                eager: eager.has(`${node}->${to}`),
                bindings: [],
                line: 1,
            })),
        )
    }
    return { nodes, out, barrels: [] }
}

describe('scc: Tarjan', () => {
    test('acyclic graph yields only singleton components', () => {
        const g = graphOf({ a: ['b'], b: ['c'], c: [] })
        const r = tarjanScc(g)
        assert.equal(cyclicSccs(r).length, 0)
        assert.equal(r.sccs.length, 3)
    })

    test('emission order is dependency-first', () => {
        const g = graphOf({ a: ['b'], b: ['c'], c: [] })
        assert.deepEqual(topoOrder(tarjanScc(g)), ['c', 'b', 'a'])
    })

    test('detects a two-node cycle', () => {
        const r = tarjanScc(graphOf({ a: ['b'], b: ['a'] }))
        const cyclic = cyclicSccs(r)
        assert.equal(cyclic.length, 1)
        assert.deepEqual(cyclic[0].members, ['a', 'b'])
    })

    test('detects a self loop', () => {
        const r = tarjanScc(graphOf({ a: ['a'] }))
        assert.equal(cyclicSccs(r).length, 1)
    })

    test('finds every component, not just the first back edge', () => {
        // Two disjoint cycles plus a node that reaches both. The previous
        // shared-visited DFS reported whichever it happened to enter first.
        const g = graphOf({ root: ['a', 'x'], a: ['b'], b: ['a'], x: ['y'], y: ['x'] })
        const cyclic = cyclicSccs(tarjanScc(g))
        assert.equal(cyclic.length, 2)
        assert.deepEqual(cyclic.map((s) => s.members).sort(), [['a', 'b'], ['x', 'y']])
    })

    test('finds a component entered through an already-finished node', () => {
        const g = graphOf({ first: ['shared'], shared: ['loop'], loop: ['shared'], second: ['shared'] })
        assert.equal(cyclicSccs(tarjanScc(g)).length, 1)
    })

    test('cycle path is rotated to a canonical start', () => {
        const g = graphOf({ b: ['c'], c: ['a'], a: ['b'] })
        const [scc] = cyclicSccs(tarjanScc(g))
        const path = shortestCycle(g, scc)
        assert.equal(path[0], 'a')
        assert.equal(path[path.length - 1], 'a')
    })

    test('shortest cycle is minimal, not merely any cycle', () => {
        //  a -> b -> a   (length 2)  and  a -> c -> d -> a  (length 3)
        const g = graphOf({ a: ['b', 'c'], b: ['a'], c: ['d'], d: ['a'] })
        const [scc] = cyclicSccs(tarjanScc(g))
        assert.equal(shortestCycle(g, scc).length, 3) // a -> b -> a, inclusive of both ends
    })

    test('survives a chain far deeper than the call stack', () => {
        // A recursive DFS overflows here; the iterative implementation must not.
        const depth = 60_000
        const adjacency: Record<string, string[]> = {}
        for (let i = 0; i < depth; i++) adjacency[`n${i}`] = [`n${i + 1}`]
        adjacency[`n${depth}`] = []

        const r = tarjanScc(graphOf(adjacency))
        assert.equal(r.sccs.length, depth + 1)
        assert.equal(cyclicSccs(r).length, 0)
    })

    test('type-only edges are excluded from cycle detection by default', () => {
        const g: ModuleGraph = {
            nodes: ['a', 'b'],
            out: new Map<string, Edge[]>([
                ['a', [{ from: 'a', to: 'b', kind: 'type-only', eager: false, bindings: [], line: 1 }]],
                ['b', [{ from: 'b', to: 'a', kind: 'type-only', eager: false, bindings: [], line: 1 }]],
            ]),
            barrels: [],
        }
        assert.equal(cyclicSccs(tarjanScc(g)).length, 0)
        assert.equal(cyclicSccs(tarjanScc(g, new Set<EdgeKind>(['type-only']))).length, 1)
    })

    test('output is identical regardless of node insertion order', () => {
        const forward = graphOf({ a: ['b'], b: ['c'], c: ['a'], d: ['a'] })
        const reversed: ModuleGraph = {
            nodes: [...forward.nodes].reverse(),
            out: forward.out,
            barrels: [],
        }
        const a = cyclicSccs(tarjanScc(forward)).map((s) => s.members)
        const b = cyclicSccs(tarjanScc(reversed)).map((s) => s.members)
        assert.deepEqual(a, b)
    })
})
