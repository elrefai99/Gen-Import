import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../helpers/workspace'

const CLEAN = {
    'a.ts': `export const A = 1\n`,
    'b.ts': `export const B = 2\n`,
}

const CYCLIC = {
    'a.ts': `import { B_VALUE } from './gen-import'\nexport const A_VALUE = 'a' + B_VALUE\n`,
    'b.ts': `import { A_VALUE } from './gen-import'\nexport const B_VALUE = 'b' + A_VALUE\n`,
}

function withWorkspace(files: Record<string, string>, fn: (ws: ReturnType<typeof createWorkspace>) => void, opts = {}) {
    const ws = createWorkspace({ files, ...opts })
    try {
        fn(ws)
    } finally {
        ws.cleanup()
    }
}

describe('exit codes', () => {
    test('clean project exits 0 without --strict', () => {
        withWorkspace(CLEAN, (ws) => assert.equal(ws.gen().status, 0))
    })

    test('cyclic project still exits 0 without --strict', () => {
        // Generation is not gated on findings unless the user asks for it.
        withWorkspace(CYCLIC, (ws) => assert.equal(ws.gen().status, 0))
    })

    test('--strict=cycles exits 1 on an init-time cycle', () => {
        withWorkspace(CYCLIC, (ws) => {
            const r = ws.gen(['--strict=cycles'])
            assert.equal(r.status, 1)
            assert.match(r.stdout + r.stderr, /GI001/)
        })
    })

    test('--strict=cycles exits 0 on a clean project', () => {
        withWorkspace(CLEAN, (ws) => assert.equal(ws.gen(['--strict=cycles']).status, 0))
    })

    test('--strict-cycles is still honoured as the legacy alias', () => {
        withWorkspace(CYCLIC, (ws) => assert.equal(ws.gen(['--strict-cycles']).status, 1))
    })

    test('--strict=collisions ignores cycles', () => {
        withWorkspace(CYCLIC, (ws) => assert.equal(ws.gen(['--strict=collisions']).status, 0))
    })

    test('--strict=collisions exits 1 on duplicate export names', () => {
        withWorkspace(
            { 'one.ts': `export const dup = 1\n`, 'two.ts': `export const dup = 2\n` },
            (ws) => {
                const r = ws.gen(['--strict=collisions'])
                assert.equal(r.status, 1)
                assert.match(r.stdout + r.stderr, /GI006/)
            },
        )
    })

    test('a deferred cycle does not block --strict=cycles', () => {
        // Deferred reads resolve at call time, so blocking on them would make
        // --strict unadoptable without fixing anything real.
        withWorkspace(
            {
                'a.ts': `import { b } from './gen-import'\nexport const a = () => b()\n`,
                'b.ts': `import { a } from './gen-import'\nexport const b = () => a()\n`,
            },
            (ws) => assert.equal(ws.gen(['--strict=cycles']).status, 0),
        )
    })
})

describe('--safe-barrels', () => {
    test('withholds the cycle participants and prints direct-import lines', () => {
        withWorkspace(CYCLIC, (ws) => {
            const r = ws.gen(['--no-lazy', '--safe-barrels'])
            assert.equal(r.status, 0)
            assert.match(r.stdout, /GI007/)
            assert.match(r.stdout, /import \{ A_VALUE \} from '\.\/a'/)

            const barrel = ws.read('src/gen-import.ts')
            assert.doesNotMatch(barrel, /A_VALUE/, 'withheld export must not appear in the barrel')
        })
    })

    test('is a no-op on an acyclic project', () => {
        withWorkspace(CLEAN, (ws) => {
            assert.equal(ws.gen(['--safe-barrels']).status, 0)
            const barrel = ws.read('src/gen-import.ts')
            assert.match(barrel, /\bA\b/)
            assert.match(barrel, /\bB\b/)
        })
    })

    test('keeps type exports while withholding values', () => {
        withWorkspace(
            {
                'a.ts': `import { B_VALUE } from './gen-import'\nexport interface AShape { n: number }\nexport const A_VALUE = 'a' + B_VALUE\n`,
                'b.ts': `import { A_VALUE } from './gen-import'\nexport const B_VALUE = 'b' + A_VALUE\n`,
            },
            (ws) => {
                assert.equal(ws.gen(['--no-lazy', '--safe-barrels']).status, 0)
                const barrel = ws.read('src/gen-import.ts')
                assert.match(barrel, /export type \{ AShape \}/, 'types are erased and always safe to re-export')
                assert.doesNotMatch(barrel, /\bA_VALUE\b/)
            },
        )
    })
})

describe('determinism', () => {
    const files = {
        'zulu.ts': `export const zulu = 1\n`,
        'alpha.ts': `import { zulu } from './gen-import'\nexport const alpha = () => zulu\n`,
        'mike/nested.ts': `export const nested = 3\n`,
        'mike/deep/leaf.ts': `export const leaf = 4\n`,
    }

    test('repeated runs produce byte-identical output', () => {
        withWorkspace(files, (ws) => {
            ws.gen()
            const first = ws.read('src/gen-import.ts')
            ws.gen()
            ws.gen()
            assert.equal(ws.read('src/gen-import.ts'), first)
        })
    })

    test('two independent workspaces with the same sources agree', () => {
        const a = createWorkspace({ files })
        const b = createWorkspace({ files })
        try {
            a.gen()
            b.gen()
            assert.equal(a.read('src/gen-import.ts'), b.read('src/gen-import.ts'))
        } finally {
            a.cleanup()
            b.cleanup()
        }
    })
})

describe('project shapes', () => {
    test('ESM project refuses lazy getters and says why', () => {
        withWorkspace(
            CLEAN,
            (ws) => {
                const r = ws.gen(['--lazy'])
                assert.equal(r.status, 0)
                assert.match(r.stdout + r.stderr, /incompatible with "type": "module"/)
                const barrel = ws.read('src/gen-import.ts')
                assert.doesNotMatch(barrel, /require\(/, 'ESM output must not contain require()')
            },
            { moduleType: 'module' },
        )
    })

    test('JavaScript project emits a runtime .js plus a .d.ts companion', () => {
        withWorkspace(
            { 'a.js': `export const A = 1\n` },
            (ws) => {
                assert.equal(ws.gen().status, 0)
                assert.ok(ws.exists('src/gen-import.js'), 'expected gen-import.js')
                assert.ok(ws.exists('src/gen-import.d.ts'), 'expected gen-import.d.ts')
            },
            { noTsconfig: true },
        )
    })

    test('--app-config writes an aggregator that only reads the barrel', () => {
        withWorkspace(CLEAN, (ws) => {
            assert.equal(ws.gen(['--app-config']).status, 0)
            assert.match(ws.read('src/gen.config.ts'), /export \* from '\.\/gen-import'/)
        })
    })

    test('generated barrels are never re-scanned into themselves', () => {
        withWorkspace(CLEAN, (ws) => {
            ws.gen(['--app-config'])
            ws.gen(['--app-config'])
            const barrel = ws.read('src/gen-import.ts')
            assert.doesNotMatch(barrel, /gen.config/)
            assert.doesNotMatch(barrel, /from '\.\/gen-import'/)
        })
    })
})

describe('config file and filters', () => {
    test('gen-import.config.js supplies defaults', () => {
        withWorkspace(
            { 'keep.ts': `export const keep = 1\n`, 'internal/hidden.ts': `export const hidden = 2\n` },
            (ws) => {
                assert.equal(ws.gen().status, 0)
                const barrel = ws.read('src/gen-import.ts')
                assert.match(barrel, /keep/)
                assert.doesNotMatch(barrel, /hidden/, 'skipPatterns from the config file must apply')
            },
            { rootFiles: { 'gen-import.config.js': `module.exports = { skipPatterns: ['src/internal/'] }\n` } },
        )
    })

    test('--skip overrides on the command line', () => {
        withWorkspace({ 'keep.ts': `export const keep = 1\n`, 'drop.ts': `export const drop = 2\n` }, (ws) => {
            assert.equal(ws.gen(['--skip', 'src/drop.ts']).status, 0)
            const barrel = ws.read('src/gen-import.ts')
            assert.match(barrel, /keep/)
            assert.doesNotMatch(barrel, /drop/)
        })
    })

    test('collisions are reported with winner and losers', () => {
        withWorkspace({ 'one.ts': `export const dup = 1\n`, 'two.ts': `export const dup = 2\n` }, (ws) => {
            const r = ws.gen()
            assert.match(r.stdout + r.stderr, /dup/)
            assert.match(r.stdout + r.stderr, /kept from/)
            // The lazy barrel names each export twice (declaration + getter),
            // so count the declarations rather than raw occurrences.
            const barrel = ws.read('src/gen-import.ts')
            const declarations = barrel.match(/^export declare const dup\b/gm) ?? []
            assert.equal(declarations.length, 1, `the barrel must declare the name exactly once:\n${barrel}`)
            assert.equal((barrel.match(/'dup'/g) ?? []).length, 1, 'exactly one getter for the winning export')
        })
    })
})
