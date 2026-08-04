import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { StudioServer } from '../../src/studio'
import { startStudio } from '../../src/studio'

const roots: string[] = []
const servers: StudioServer[] = []

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()))
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Studio server', () => {
    test('serves the UI and live project snapshot on an automatic port', async () => {
        const root = mkdtempSync(join(tmpdir(), 'gen-import-studio-server-'))
        roots.push(root)
        mkdirSync(join(root, 'src'))
        writeFileSync(join(root, 'src', 'value.ts'), 'export const VALUE = 42\n')
        writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020' }, include: ['src'] }))

        const blocker = createServer()
        await new Promise<void>((resolveListen) => blocker.listen(0, '127.0.0.1', resolveListen))
        const occupiedPort = (blocker.address() as AddressInfo).port
        const server = await startStudio({ rootDir: root, port: occupiedPort, open: false })
        await new Promise<void>((resolveClose) => blocker.close(() => resolveClose()))
        servers.push(server)

        const health = await fetch(`${server.url}/api/health`).then((response) => response.json()) as { status: string }
        const snapshot = await fetch(`${server.url}/api/snapshot`).then((response) => response.json()) as { stats: { totalFiles: number; totalExports: number } }
        const html = await fetch(server.url).then((response) => response.text())

        assert.equal(health.status, 'ok')
        assert.notEqual(server.port, occupiedPort)
        assert.equal(snapshot.stats.totalFiles, 1)
        assert.equal(snapshot.stats.totalExports, 1)
        assert.match(html, /Gen Import Studio/)
    })
})
