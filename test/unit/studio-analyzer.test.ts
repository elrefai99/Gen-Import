import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { analyzeStudioProject } from '../../src/studio'

const workspaces: string[] = []

function workspace(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'gen-import-studio-'))
    workspaces.push(root)
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
            target: 'ES2020',
            module: 'CommonJS',
            moduleResolution: 'node',
            strict: true,
        },
        include: ['src'],
    }))
    for (const [path, content] of Object.entries(files)) {
        const target = join(root, path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content)
    }
    return root
}

afterEach(() => {
    for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Studio analyzer', () => {
    test('classifies exports and records aliased symbol usages with references', () => {
        const root = workspace({
            'src/service.ts': [
                'export class UserService {}',
                'export interface UserShape { id: string }',
                'export const createUser = () => new UserService()',
                'export default function main() {}',
            ].join('\n'),
            'src/controller.ts': [
                "import run, { UserService as Service, type UserShape } from './service'",
                'const one = new Service()',
                'const two = new Service()',
                'const shape: UserShape = { id: String(one) }',
                'run()',
                'export { two, shape }',
            ].join('\n'),
        })

        const result = analyzeStudioProject(root)
        const service = result.exports.find((item) => item.file === 'src/service.ts' && item.name === 'UserService')
        const factory = result.exports.find((item) => item.name === 'createUser')
        const defaultExport = result.exports.find((item) => item.file === 'src/service.ts' && item.isDefault)

        assert.equal(service?.kind, 'class')
        assert.equal(factory?.kind, 'function')
        assert.equal(defaultExport?.displayName, 'main')
        assert.equal(service?.unused, false)
        assert.equal(service?.usages[0].alias, 'Service')
        assert.equal(service?.usages[0].references, 2)
        assert.equal(service?.usages[0].line, 1)
        assert.equal(result.stats.totalFiles, 2)
    })

    test('tracks barrels, dynamic imports, and runtime cycles', () => {
        const root = workspace({
            'src/a.ts': "import { b } from './b'\nexport const a = b + 1\n",
            'src/b.ts': "import { a } from './a'\nexport const b = a + 1\n",
            'src/index.ts': "export * from './a'\nexport { b as renamed } from './b'\n",
            'src/lazy.ts': "export async function lazy() { return import('./a') }\n",
        })

        const result = analyzeStudioProject(root)
        assert.equal(result.cycles.length, 1)
        assert.deepEqual(result.cycles[0].files, ['src/a.ts', 'src/b.ts'])
        assert.ok(result.imports.some((edge) => edge.kind === 're-export' && edge.source === 'src/index.ts'))
        assert.ok(result.imports.some((edge) => edge.kind === 'dynamic-import' && edge.source === 'src/lazy.ts'))
        assert.equal(result.exports.find((item) => item.file === 'src/b.ts' && item.name === 'b')?.unused, false)
        assert.ok(result.folders.some((folder) => folder.path === 'src' && folder.files.length === 4))
    })

    test('resolves tsconfig path aliases', () => {
        const root = workspace({
            'src/lib/value.ts': 'export const VALUE = 42\n',
            'src/use.ts': "import { VALUE } from '@lib/value'\nexport const answer = VALUE\n",
        })
        writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                target: 'ES2020',
                module: 'CommonJS',
                moduleResolution: 'node',
                baseUrl: '.',
                paths: { '@lib/*': ['src/lib/*'] },
            },
            include: ['src'],
        }))

        const result = analyzeStudioProject(root)
        assert.ok(result.imports.some((edge) => edge.source === 'src/use.ts' && edge.target === 'src/lib/value.ts'))
        assert.equal(result.exports.find((item) => item.name === 'VALUE')?.usages.length, 1)
    })
})
