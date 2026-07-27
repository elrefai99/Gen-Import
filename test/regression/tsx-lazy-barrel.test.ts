import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../helpers/workspace'

describe('regression: lazy barrel under esbuild loaders', () => {
    const files = {
        'util.ts': `export const asyncHandler = (fn: () => string) => fn\nexport type Marker = { id: string }\n`,
        'main.ts': `import { asyncHandler } from './gen-import'\nconsole.log('PROBE:' + typeof asyncHandler)\n`,
    }

    test('getters target module.exports, not exports', () => {
        const ws = createWorkspace({ files })
        try {
            assert.equal(ws.gen(['--lazy']).status, 0)
            const barrel = ws.read('src/gen-import.ts')

            assert.match(
                barrel,
                /Object\.defineProperty\(module\.exports, 'asyncHandler'/,
                'lazy getters must be installed on module.exports',
            )
            assert.doesNotMatch(
                barrel,
                /Object\.defineProperty\(exports, '/,
                'installing on `exports` is stranded by esbuild module.exports reassignment',
            )
        } finally {
            ws.cleanup()
        }
    })

    test('require() of the barrel exposes the exports under tsx', () => {
        const ws = createWorkspace({ files })
        try {
            assert.equal(ws.gen(['--lazy']).status, 0)
            ws.write(
                'src/probe.ts',
                `const barrel = require('./gen-import')\n` +
                `console.log('KEYS:' + JSON.stringify(Object.keys(barrel)))\n` +
                `console.log('PROBE:' + typeof barrel.asyncHandler)\n`,
            )

            const result = ws.runViaTsx('probe.ts')
            assert.equal(result.ok, true, result.output)
            assert.ok(
                !result.stdout.includes('KEYS:[]'),
                `require() returned an empty object — getters landed on a detached exports\n${result.output}`,
            )
            assert.ok(result.stdout.includes('PROBE:function'), result.output)
        } finally {
            ws.cleanup()
        }
    })

    test('named import resolves under both tsx and tsc', () => {
        const ws = createWorkspace({ files })
        try {
            assert.equal(ws.gen(['--lazy']).status, 0)
            for (const loader of ['tsx', 'tsc'] as const) {
                const result = loader === 'tsx' ? ws.runViaTsx('main.ts') : ws.runViaTsc('main.ts')
                assert.equal(result.ok, true, `${loader}: ${result.output}`)
                assert.ok(
                    result.stdout.includes('PROBE:function'),
                    `${loader}: import resolved to ${result.stdout.trim()}\n${result.output}`,
                )
            }
        } finally {
            ws.cleanup()
        }
    })

    test('--globals barrel also survives the esbuild reassignment', () => {
        const ws = createWorkspace({ files })
        try {
            assert.equal(ws.gen(['--lazy', '--globals']).status, 0)
            const barrel = ws.read('src/gen-import.ts')
            assert.doesNotMatch(barrel, /Object\.defineProperty\(exports, '/)
            assert.doesNotMatch(barrel, /return exports\./)
        } finally {
            ws.cleanup()
        }
    })
})
