import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const REPO_ROOT = resolve(__dirname, '..', '..')
export const CLI = join(REPO_ROOT, 'dist', 'cli.js')
const TSC = join(REPO_ROOT, 'node_modules', '.bin', 'tsc')
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx')

export interface WorkspaceOptions {
    /** Source files, keyed by path relative to src/. */
    files: Record<string, string>
    /** package.json "type". Defaults to CommonJS. */
    moduleType?: 'commonjs' | 'module'
    /** Extra compilerOptions merged into the generated tsconfig. */
    compilerOptions?: Record<string, unknown>
    /** Omit tsconfig.json — makes the tool treat the project as JavaScript. */
    noTsconfig?: boolean
    /** Extra files written relative to the project root rather than src/. */
    rootFiles?: Record<string, string>
}

export interface Workspace {
    dir: string
    srcDir: string
    /** Run the gen-import CLI; never throws, so exit codes can be asserted. */
    gen(args?: string[]): { status: number; stdout: string; stderr: string }
    /** Compile with tsc and execute the result under plain node. */
    runViaTsc(entry: string): RunResult
    /** Execute the TypeScript source directly under tsx (esbuild). */
    runViaTsx(entry: string): RunResult
    read(relPath: string): string
    exists(relPath: string): boolean
    write(relPath: string, content: string): void
    cleanup(): void
}

export interface RunResult {
    ok: boolean
    stdout: string
    stderr: string
    /** Combined output — convenient for asserting on error text. */
    output: string
}

// spawnSync rather than execFileSync: warnings go to stderr even on a
// successful run, and execFileSync only surfaces stderr when the process fails.
function run(cmd: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
    const res = spawnSync(cmd, args, {
        cwd,
        encoding: 'utf-8',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

export function createWorkspace(options: WorkspaceOptions): Workspace {
    const dir = mkdtempSync(join(tmpdir(), 'gen-import-test-'))
    const srcDir = join(dir, 'src')
    mkdirSync(srcDir, { recursive: true })

    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'fixture', version: '1.0.0', type: options.moduleType ?? 'commonjs' }, null, 2),
    )
    if (!options.noTsconfig) writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify(
            {
                compilerOptions: {
                    target: 'ES2020',
                    module: options.moduleType === 'module' ? 'ES2020' : 'CommonJS',
                    moduleResolution: options.moduleType === 'module' ? 'bundler' : 'node',
                    strict: false,
                    skipLibCheck: true,
                    esModuleInterop: true,
                    experimentalDecorators: true,
                    rootDir: 'src',
                    outDir: 'out',
                    ...options.compilerOptions,
                },
                include: ['src'],
            },
            null,
            2,
        ),
    )

    for (const [relPath, content] of Object.entries(options.files)) {
        const full = join(srcDir, relPath)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, content)
    }

    for (const [relPath, content] of Object.entries(options.rootFiles ?? {})) {
        const full = join(dir, relPath)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, content)
    }

    return {
        dir,
        srcDir,
        gen: (args = []) => run(process.execPath, [CLI, ...args], dir),
        runViaTsc(entry: string): RunResult {
            const build = run(TSC, ['-p', 'tsconfig.json'], dir)
            // Type errors are expected in several fixtures (a cycle makes TS
            // complain too). Emit still happens, so only a missing output is fatal.
            const outEntry = join(dir, 'out', entry.replace(/\.ts$/, '.js'))
            if (!existsSync(outEntry)) {
                return { ok: false, stdout: '', stderr: build.stderr || build.stdout, output: build.stdout + build.stderr }
            }
            const res = run(process.execPath, [outEntry], dir)
            return { ok: res.status === 0, stdout: res.stdout, stderr: res.stderr, output: res.stdout + res.stderr }
        },
        runViaTsx(entry: string): RunResult {
            const res = run(TSX, [join('src', entry)], dir)
            return { ok: res.status === 0, stdout: res.stdout, stderr: res.stderr, output: res.stdout + res.stderr }
        },
        read: (relPath: string) => readFileSync(join(dir, relPath), 'utf-8'),
        exists: (relPath: string) => existsSync(join(dir, relPath)),
        write(relPath: string, content: string) {
            const full = join(dir, relPath)
            mkdirSync(dirname(full), { recursive: true })
            writeFileSync(full, content)
        },
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
    }
}
