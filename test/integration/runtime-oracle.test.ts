import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace, type Workspace } from '../helpers/workspace'

/**
 * The runtime oracle.
 *
 * Emit-shape assertions cannot catch the failures that matter: a barrel can look
 * perfectly well-formed and still hand back `undefined` at runtime. So every
 * scenario here is generated, analysed, emitted, and then *actually executed* —
 * under `tsc` + node and under `tsx` (esbuild), in both lazy and static emit
 * modes.
 *
 * Two properties are asserted:
 *
 *   1. The analyser's barrel verdict matches the declared expectation.
 *   2. Executing the result produces the declared probe output — identically
 *      under every loader.
 *
 * Property 2 in the `safe` cases is the important one: if the tool calls a
 * barrel safe, importing from it must work everywhere. That is precisely the
 * invariant the `exports` vs `module.exports` bug violated.
 */

type Verdict = 'safe' | 'ordered' | 'unsafe'

interface Expectation {
    verdict: Verdict
    /**
     * Exact stdout the entry point must produce, or 'BROKEN'.
     *
     * 'BROKEN' rather than an exact string because a real cycle corrupts
     * differently per loader: tsc yields a silent `undefined`, esbuild throws
     * `Cannot access 'X' before initialization`. Both are failures; pinning one
     * spelling would make the test loader-specific.
     */
    probe: string
}

interface Scenario {
    name: string
    files: Record<string, string>
    entry: string
    lazy: Expectation
    static: Expectation
    /** Skip the static run (e.g. --no-lazy is meaningless for the case). */
    staticOnlyAnalysis?: boolean
}

/** Pull the `Barrel` row out of the CLI summary box. */
export function barrelVerdict(stdout: string): Verdict | 'unknown' {
    const line = stdout.split('\n').find((l) => /\bBarrel\b/.test(l))
    if (!line) return 'unknown'
    if (line.includes('unsafe')) return 'unsafe'
    if (line.includes('ordered')) return 'ordered'
    if (line.includes('safe')) return 'safe'
    return 'unknown'
}

const scenarios: Scenario[] = [
    {
        name: 'acyclic barrel',
        files: {
            'greet.ts': `export const greet = (n: string) => 'hi ' + n\n`,
            'shout.ts': `export const shout = (n: string) => n.toUpperCase()\n`,
            'main.ts': `import { greet, shout } from './gen-import'\nconsole.log('PROBE:' + greet(shout('bob')))\n`,
        },
        entry: 'main.ts',
        lazy: { verdict: 'safe', probe: 'PROBE:hi BOB' },
        static: { verdict: 'safe', probe: 'PROBE:hi BOB' },
    },
    {
        name: 'consumer reads through the barrel inside a function (deferred)',
        files: {
            'base.ts': `export const BASE = 'base'\n`,
            'user.ts': `import { BASE } from './gen-import'\nexport const read = () => BASE\n`,
            'main.ts': `import { read } from './gen-import'\nconsole.log('PROBE:' + read())\n`,
        },
        entry: 'main.ts',
        lazy: { verdict: 'safe', probe: 'PROBE:base' },
        // Static re-exports still compile to getters, and the topological order
        // puts base.ts before user.ts, so initialisation completes.
        static: { verdict: 'safe', probe: 'PROBE:base' },
    },
    {
        name: 'class extends a base class taken from the barrel',
        files: {
            'base.ts': `export class Base { tag() { return 'base' } }\n`,
            'child.ts': `import { Base } from './gen-import'\nexport class Child extends Base { tag() { return 'child/' + super.tag() } }\n`,
            'main.ts': `import { Child } from './gen-import'\nconsole.log('PROBE:' + new Child().tag())\n`,
        },
        entry: 'main.ts',
        // Contracted, child depends only on base, and base has no dependencies.
        // Topological order therefore satisfies the heritage read in both modes.
        lazy: { verdict: 'safe', probe: 'PROBE:child/base' },
        static: { verdict: 'safe', probe: 'PROBE:child/base' },
    },
    {
        name: 'genuine mutual cycle read at module scope',
        files: {
            'a.ts': `import { B_VALUE } from './gen-import'\nexport const A_VALUE = 'a+' + B_VALUE\n`,
            'b.ts': `import { A_VALUE } from './gen-import'\nexport const B_VALUE = 'b+' + A_VALUE\n`,
            'main.ts': `import { A_VALUE } from './gen-import'\nconsole.log('PROBE:' + A_VALUE)\n`,
        },
        entry: 'main.ts',
        // A real cycle: one side always observes the other half-initialised.
        // The tool must not claim this is fine.
        lazy: { verdict: 'unsafe', probe: 'BROKEN' },
        static: { verdict: 'unsafe', probe: 'BROKEN' },
    },
    {
        name: 'type-only import from the barrel is not a runtime edge',
        files: {
            'shapes.ts': `export interface Shape { w: number }\nexport const area = (s: Shape) => s.w * s.w\n`,
            'consumer.ts': `import type { Shape } from './gen-import'\nexport const mk = (w: number): Shape => ({ w })\n`,
            'main.ts': `import { area, mk } from './gen-import'\nconsole.log('PROBE:' + area(mk(3)))\n`,
        },
        entry: 'main.ts',
        lazy: { verdict: 'safe', probe: 'PROBE:9' },
        static: { verdict: 'safe', probe: 'PROBE:9' },
    },
    {
        name: 'dynamic import of the barrel is deferred, never a cycle',
        files: {
            'thing.ts': `export const THING = 'thing'\n`,
            'loader.ts': `export async function load() { const m = await import('./gen-import'); return (m as any).THING }\n`,
            'main.ts': `import { load } from './gen-import'\nload().then((v) => console.log('PROBE:' + v))\n`,
        },
        entry: 'main.ts',
        lazy: { verdict: 'safe', probe: 'PROBE:thing' },
        static: { verdict: 'safe', probe: 'PROBE:thing' },
    },
    {
        name: 'default export routed through the barrel',
        files: {
            'config.ts': `const config = { port: 3000 }\nexport default config\n`,
            'main.ts': `import { config } from './gen-import'\nconsole.log('PROBE:' + config.port)\n`,
        },
        entry: 'main.ts',
        lazy: { verdict: 'safe', probe: 'PROBE:3000' },
        static: { verdict: 'safe', probe: 'PROBE:3000' },
    },
]

function check(ws: Workspace, scenario: Scenario, mode: 'lazy' | 'static'): void {
    const flags = mode === 'lazy' ? ['--lazy'] : ['--no-lazy']
    const gen = ws.gen(flags)
    assert.equal(gen.status, 0, `CLI failed:\n${gen.stderr}`)

    const expected = scenario[mode]
    assert.equal(
        barrelVerdict(gen.stdout),
        expected.verdict,
        `barrel verdict mismatch in ${mode} mode\n${gen.stdout}`,
    )

    for (const loader of ['tsc', 'tsx'] as const) {
        const result = loader === 'tsc' ? ws.runViaTsc(scenario.entry) : ws.runViaTsx(scenario.entry)

        if (expected.probe === 'BROKEN') {
            const corrupted = !result.ok || result.stdout.includes('undefined')
            assert.equal(
                corrupted,
                true,
                `${mode}/${loader}: expected the cycle to break initialisation, but it produced a clean result\n${result.output}`,
            )
            continue
        }

        assert.equal(
            result.ok,
            true,
            `${mode}/${loader}: execution failed\n${result.output}`,
        )
        const probe = result.stdout.split('\n').find((l) => l.startsWith('PROBE:'))
        assert.equal(
            probe,
            expected.probe,
            `${mode}/${loader}: probe mismatch\nfull output:\n${result.output}`,
        )
    }
}

describe('runtime oracle: analysis verdict must match real execution', () => {
    for (const scenario of scenarios) {
        for (const mode of ['lazy', 'static'] as const) {
            test(`${scenario.name} [${mode}]`, () => {
                const ws = createWorkspace({ files: scenario.files })
                try {
                    check(ws, scenario, mode)
                } finally {
                    ws.cleanup()
                }
            })
        }
    }
})

describe('topological ordering is load-bearing for static barrels', () => {
    // With static re-exports the barrel requires each module in the order it
    // lists them. Sorting dependencies first is what keeps a one-directional
    // cycle alive; --no-topo-sort must therefore be observably worse.
    const files: Record<string, string> = {
        'zeta-base.ts': `export class Base { tag() { return 'base' } }\n`,
        'alpha-child.ts': `import { Base } from './gen-import'\nexport class Child extends Base { tag() { return 'child/' + super.tag() } }\n`,
        'main.ts': `import { Child } from './gen-import'\nconsole.log('PROBE:' + new Child().tag())\n`,
    }

    test('topo sort on: dependency is emitted before its dependent', () => {
        const ws = createWorkspace({ files })
        try {
            assert.equal(ws.gen(['--no-lazy']).status, 0)
            const barrel = ws.read('src/gen-import.ts')
            const basePos = barrel.indexOf('./zeta-base')
            const childPos = barrel.indexOf('./alpha-child')
            assert.ok(basePos !== -1 && childPos !== -1, 'both modules must be re-exported')
            assert.ok(
                basePos < childPos,
                `base must precede child despite alphabetical order:\n${barrel}`,
            )
            assert.equal(ws.runViaTsc('main.ts').stdout.trim(), 'PROBE:child/base')
        } finally {
            ws.cleanup()
        }
    })

    test('topo sort off: alphabetical order puts the dependent first', () => {
        const ws = createWorkspace({ files })
        try {
            assert.equal(ws.gen(['--no-lazy', '--no-topo-sort']).status, 0)
            const barrel = ws.read('src/gen-import.ts')
            assert.ok(
                barrel.indexOf('./alpha-child') < barrel.indexOf('./zeta-base'),
                'without topo sort the barrel should fall back to file order',
            )
        } finally {
            ws.cleanup()
        }
    })
})
