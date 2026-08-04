import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { StudioOptions, StudioSnapshot } from '../@types'
import { StudioService } from './service'

const CONTENT_TYPES: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
}

export interface StudioServer {
    host: string
    port: number
    url: string
    getSnapshot(): StudioSnapshot
    close(): Promise<void>
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
    const body = JSON.stringify(value)
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
    })
    response.end(body)
}

function studioAssetsDirectory(): string {
    const candidates = [
        resolve(__dirname, '..', 'studio-ui'),
        resolve(process.cwd(), 'dist', 'studio-ui'),
        resolve(__dirname, '..', '..', 'studio', 'dist'),
    ]
    return candidates.find((candidate) => existsSync(join(candidate, 'index.html'))) ?? candidates[0]
}

function serveAsset(response: ServerResponse, assetsDir: string, pathname: string): void {
    let relativePath: string
    try {
        relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
    } catch {
        sendJson(response, 400, { error: 'Malformed URL path.' })
        return
    }
    const root = resolve(assetsDir)
    const requested = resolve(root, normalize(relativePath))
    const insideAssets = requested === root || requested.startsWith(`${root}${sep}`)
    if (!insideAssets) {
        sendJson(response, 403, { error: 'Asset path is outside the Studio bundle.' })
        return
    }
    const safeRequested = requested
    let file = join(root, 'index.html')
    try {
        if (existsSync(safeRequested) && statSync(safeRequested).isFile()) file = safeRequested
    } catch {
        // A build artifact can be replaced between the existence and stat checks.
    }
    if (!existsSync(file)) {
        sendJson(response, 503, { error: 'Studio UI is missing. Run `pnpm build` before starting Studio.' })
        return
    }
    response.writeHead(200, {
        'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(file).pipe(response)
}

function openBrowser(url: string): void {
    let command: string
    let args: string[]
    if (process.platform === 'win32') {
        command = 'cmd'
        args = ['/c', 'start', '', url]
    } else if (process.platform === 'darwin') {
        command = 'open'
        args = [url]
    } else {
        command = 'xdg-open'
        args = [url]
    }
    try {
        const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
        child.unref()
    } catch {
        // The URL is still printed, so a missing desktop opener is non-fatal.
    }
}

function listen(server: Server, host: string, preferredPort: number): Promise<number> {
    return new Promise((resolvePort, reject) => {
        let candidate = preferredPort
        let attempts = 0
        const tryListen = (): void => {
            const onError = (error: NodeJS.ErrnoException): void => {
                server.off('listening', onListening)
                if (error.code === 'EADDRINUSE' && attempts < 20) {
                    attempts++
                    candidate = preferredPort + attempts
                    tryListen()
                    return
                }
                if (error.code === 'EADDRINUSE') {
                    candidate = 0
                    server.once('error', reject)
                    server.once('listening', onListening)
                    server.listen(candidate, host)
                    return
                }
                reject(error)
            }
            const onListening = (): void => {
                server.off('error', onError)
                resolvePort((server.address() as AddressInfo).port)
            }
            server.once('error', onError)
            server.once('listening', onListening)
            server.listen(candidate, host)
        }
        tryListen()
    })
}

export async function startStudio(options: StudioOptions = {}): Promise<StudioServer> {
    const rootDir = resolve(options.rootDir ?? process.cwd())
    const host = options.host ?? '127.0.0.1'
    const preferredPort = options.port ?? 3000
    const service = new StudioService(rootDir)
    const assetsDir = studioAssetsDirectory()
    const eventClients = new Set<ServerResponse>()

    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (url.pathname === '/api/health') {
            sendJson(response, 200, {
                status: 'ok',
                version: service.snapshot.version,
                generatedAt: service.snapshot.generatedAt,
            })
            return
        }
        if (url.pathname === '/api/snapshot') {
            sendJson(response, 200, service.snapshot)
            return
        }
        if (url.pathname === '/api/refresh' && request.method === 'POST') {
            sendJson(response, 200, service.refresh())
            return
        }
        if (url.pathname === '/api/search') {
            const query = (url.searchParams.get('q') ?? '').trim().toLowerCase()
            const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200)
            const files = query
                ? service.snapshot.files.filter((file) => file.path.toLowerCase().includes(query)).slice(0, limit)
                : []
            const exports = query
                ? service.snapshot.exports.filter((item) =>
                    item.name.toLowerCase().includes(query) || item.displayName.toLowerCase().includes(query),
                ).slice(0, limit)
                : []
            sendJson(response, 200, { files, exports })
            return
        }
        if (url.pathname === '/api/events') {
            response.writeHead(200, {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
                connection: 'keep-alive',
            })
            response.write(`event: ready\ndata: ${service.snapshot.version}\n\n`)
            eventClients.add(response)
            request.on('close', () => eventClients.delete(response))
            return
        }
        serveAsset(response, assetsDir, url.pathname)
    })

    const unsubscribe = service.subscribe((snapshot) => {
        for (const client of eventClients) client.write(`event: update\ndata: ${snapshot.version}\n\n`)
    })
    const port = await listen(server, host, preferredPort)
    service.start()
    const browserHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host
    const url = `http://${browserHost}:${port}`
    console.log(`\n  Gen Import Studio  ${url}`)
    console.log(`  Indexed ${service.snapshot.stats.totalFiles} files and ${service.snapshot.stats.totalExports} exports in ${service.snapshot.scanDurationMs}ms`)
    console.log('  Watching for project changes. Press Ctrl+C to stop.\n')
    if (options.open !== false) openBrowser(url)

    let closed = false
    const close = async (): Promise<void> => {
        if (closed) return
        closed = true
        unsubscribe()
        service.close()
        for (const client of eventClients) client.end()
        eventClients.clear()
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }
    const stop = (): void => { void close().finally(() => process.exit(0)) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)

    return {
        host,
        port,
        url,
        getSnapshot: () => service.snapshot,
        close: async () => {
            process.off('SIGINT', stop)
            process.off('SIGTERM', stop)
            await close()
        },
    }
}
