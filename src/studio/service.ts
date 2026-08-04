import { existsSync, readdirSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { StudioSnapshot } from '../@types'
import { StudioAnalyzer } from './analyzer'

const IGNORED_DIRECTORIES = new Set([
    '.git', '.gen-import', '.next', '.nuxt', '.output', '.turbo', '.vite',
    'coverage', 'dist', 'build', 'out', 'node_modules', 'vendor',
])

export class StudioService {
    private readonly analyzer: StudioAnalyzer
    private readonly watchers = new Map<string, FSWatcher>()
    private readonly listeners = new Set<(snapshot: StudioSnapshot) => void>()
    private snapshotValue: StudioSnapshot
    private debounceTimer?: NodeJS.Timeout
    private analyzing = false
    private analyzeAgain = false

    constructor(private readonly rootDir: string) {
        this.analyzer = new StudioAnalyzer(rootDir)
        this.snapshotValue = this.analyzer.analyze()
    }

    get snapshot(): StudioSnapshot {
        return this.snapshotValue
    }

    start(): void {
        this.refreshWatchers()
    }

    subscribe(listener: (snapshot: StudioSnapshot) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    refresh(): StudioSnapshot {
        if (this.analyzing) {
            this.analyzeAgain = true
            return this.snapshotValue
        }
        this.analyzing = true
        try {
            this.snapshotValue = this.analyzer.analyze()
            for (const listener of this.listeners) listener(this.snapshotValue)
            return this.snapshotValue
        } finally {
            this.analyzing = false
            if (this.analyzeAgain) {
                this.analyzeAgain = false
                this.scheduleRefresh()
            }
        }
    }

    close(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        for (const watcher of this.watchers.values()) watcher.close()
        this.watchers.clear()
        this.listeners.clear()
    }

    private scheduleRefresh(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined
            this.refreshWatchers()
            this.refresh()
        }, 180)
    }

    private refreshWatchers(): void {
        if (!existsSync(this.rootDir)) return
        const directories: string[] = []
        const visit = (directory: string): void => {
            directories.push(directory)
            let entries
            try {
                entries = readdirSync(directory, { withFileTypes: true })
            } catch {
                return
            }
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue
                visit(join(directory, entry.name))
            }
        }
        visit(this.rootDir)

        const wanted = new Set(directories)
        for (const [directory, watcher] of this.watchers) {
            if (wanted.has(directory)) continue
            watcher.close()
            this.watchers.delete(directory)
        }
        for (const directory of directories) {
            if (this.watchers.has(directory)) continue
            try {
                const watcher = watch(directory, (_event, fileName) => {
                    const changed = fileName ? String(fileName).replace(/\\/g, '/') : ''
                    if ([...IGNORED_DIRECTORIES].some((ignored) => changed.split('/').includes(ignored))) return
                    if (/^(?:gen-import|gen-app-config|gen-package)\.(?:d\.ts|[cm]?[jt]sx?)$/.test(changed)) return
                    this.scheduleRefresh()
                })
                watcher.on('error', () => {
                    watcher.close()
                    this.watchers.delete(directory)
                })
                this.watchers.set(directory, watcher)
            } catch {
                // A directory can disappear between enumeration and watch registration.
            }
        }
    }
}
