# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (compiles src/ → dist/)
pnpm build        # or: npm run build

# Run locally without building
npx ts-node src/cli.ts [options]

# Test the CLI against the repo itself (after build)
node dist/cli.js
node dist/cli.js --app-config
```

No test scripts are configured. `prepublishOnly` runs `build` automatically before publishing. Always run `pnpm build` before publishing — `dist/` is in `.gitignore` but published to npm via `.npmignore`.

Requires Node.js >=16.

## CI

GitHub Actions workflow (`.github/workflows/check.yml`) runs on every push: installs with pnpm 9, builds with Node 20. There are no lint or test steps — the build (`tsc`) is the only CI gate.

## Source layout

```
src/
  @types/index.d.ts   — all shared interfaces (GenImportOptions, GenPackageOptions,
                         GenAppConfigOptions, FileInfo, CliArgs, CycleReport)
  index.ts            — public barrel: re-exports from core/* + exposes DEFAULT_SKIP_PATTERNS,
                         DEFAULT_MODULE_FILE_PATTERN, DEFAULT_MODULE_FILE_PATTERNS;
                         also selectively re-exports graph/cycle helpers from script/
  cli.ts              — thin CLI wrapper; parses argv, loads gen-import.config.js, calls core fns
  core/
    import.ts         — genImport()
    packages.ts       — genPackage()  (programmatic API only — not wired into the CLI)
    app-config.ts     — genAppConfig()
  script/
    index.ts          — all shared helpers (walk, detectModuleType, detectProjectLanguage,
                         toJsPath, analyzeFiles, createTsProgram, buildDepGraph, detectCycles,
                         topoSort, buildDtsOutput, buildJsOutput, buildGlobalDtsOutput,
                         buildGlobalJsOutput, buildGlobalDts, buildPackageDts, buildPackageJs,
                         readPreviousExports, parseBarrelExports)
  gen-import.ts       — auto-generated barrel (dogfoods the tool); do not edit
  gen-app-config.ts   — auto-generated aggregator barrel; do not edit
```

`.gitignore` excludes `*.js` from `src/`. The tool compiles to `dist/` (CommonJS, ES2020) via `tsc`.

## Architecture

**`src/script/index.ts`** — all shared pure helpers, imported by all three `core/` modules:

| Helper | Purpose |
|---|---|
| `walk(dir)` | Recursive `readdirSync` file collector |
| `detectModuleType(rootDir)` | Reads `package.json` `"type"` field → `'esm' \| 'cjs'` |
| `detectProjectLanguage(rootDir, srcDir)` | Returns `'ts'` if `tsconfig.json` exists or any `.ts` file found in `srcDir`, else `'js'` |
| `toJsPath(filePath)` | Converts `.d.ts` / `.ts` path → `.js` |
| `createTsProgram(files, rootDir)` | Creates a `ts.Program` reused across analysis and graph building |
| `analyzeFiles(files, rootDir, srcDir, program?)` | Uses `TypeChecker.getExportsOfModule` to classify each export as type-only (`Interface \| TypeAlias` without `Value` flag) or value — returns `FileInfo[]` |
| `buildDepGraph(files, program)` | Builds an adjacency map of internal `import`/`export` dependencies (skips external packages) |
| `detectCycles(graph)` | DFS-based cycle detection returning `CycleReport[]` |
| `topoSort(files, graph)` | Kahn's algorithm; appends unresolved files (cycle fallback) |
| `buildDtsOutput` / `buildJsOutput` | Render barrel file content for source barrels |
| `buildGlobalDtsOutput` / `buildGlobalJsOutput` / `buildGlobalDts` | `--globals` variants that also register exports on Node.js `global` |
| `readPreviousExports(outFile)` | Parses existing barrel for `export { ... }` names — used to diff and report new exports |
| `parseBarrelExports(filePath)` | Like `readPreviousExports` but also handles `export * from` (recorded as sentinel `'*'`); used by `genAppConfig` auto-update |

**`genImport(options)`** — `src/core/import.ts`
1. Collects `.ts` files from `srcDir`, filters by `skipPatterns` / `pureReexports` / `.d.ts`
2. Always skips `gen-package.ts`, `gen-app-config.ts`, and the output file itself to prevent circular re-exports
3. Splits into regular files and module files (matching `moduleFilePatterns`, default: `.module.ts`, `.routes.ts`, `.router.ts`, `.route.ts`) — module files appended last to avoid circular-require with NestJS-style `*.module.ts`
4. Creates a single `ts.Program` reused for both `analyzeFiles` and `buildDepGraph`
5. Runs cycle detection and (unless `--no-topo-sort`) topological sort before writing
6. Diffs against previous barrel content and logs newly added exports
7. Prints a summary box (boxen+chalk) and an **Import/Export Graph** box showing each source file → its exports (`[T]` type, `[V]` value, `[D]` default) → output barrel

**`genPackage(options)`** — `src/core/packages.ts`
Reads `dependencies` (+ optionally `devDependencies`) from `package.json`, applies include/exclude filters. Mirrors `genImport` language detection:
- **TS projects** → `gen-package.ts` with `export * from '<pkg>'`; `generateJs` defaults to `false`
- **JS projects** → `gen-package.js` runtime file + `gen-package.d.ts` type companion
- **CJS limitation**: packages using `export =` (e.g. `express`) are incompatible with `export * from`. Use `--exclude-pkg <name>` for such packages and import them directly in source files.
- **Not exposed in the CLI** — only available via programmatic API

**`genAppConfig(options)`** — `src/core/app-config.ts`
1. **Auto-update** (when `autoUpdate: true`, default): scans source files (skipping `genImportPath` to prevent circularity), compares against names already in `gen-import.ts`, appends only new exports
2. Mirrors `genImport`/`genPackage` language detection for output file:
   - **TS projects** → `gen-app-config.ts` (importable by ts-node / tsx / tsc); `generateJs` defaults to `false`
   - **JS projects** → `gen-app-config.js` runtime file + `gen-app-config.d.ts` type companion
3. Content is a single re-export: `export * from './gen-import'`

**`src/cli.ts`**
- Parses `process.argv` manually (no third-party arg parser)
- Loads `gen-import.config.js` (or `.cjs`) from the project root via `require()`
- CLI flags override config file values
- Config-file `skipPatterns` and `pureReexports` are merged into both `genImport` and `genAppConfig` calls
- `genPackage` is **not** exposed as a CLI command — use it programmatically

## Key design decisions

- **No runtime dependencies** except `typescript`, `boxen`, and `chalk`.  `typescript` is used directly for AST analysis via `ts.createProgram` + `ts.TypeChecker`.
- **Single `ts.Program` per run** — created once in `genImport` and passed to both `analyzeFiles` and `buildDepGraph` to avoid double parsing.
- **`generateJs` auto-detection** — defaults to `false` for TS projects, `true` for JS. Can always be overridden explicitly.
- **`pureReexports`** paths must be relative to `rootDir` (not `srcDir`).
- **Module file deferral** — NestJS `*.module.ts` (and `.routes.ts`, `.router.ts`, `.route.ts`) files reference services/repos not yet exported; deferring them prevents circular-require errors at runtime.
- **`genAppConfig` as a zero-import aggregator** — downstream code imports only from `gen-app-config`, which re-exports from the source barrel. No file ever needs to import from individual source paths.
- **`gen-package.ts` auto-excluded from source scans** — both `genImport` and `genAppConfig` auto-update always skip the package barrel to prevent its re-exported package symbols from appearing as project-source symbols in `gen-import.ts`.

## Config file

Users can place `gen-import.config.js` (or `gen-import.config.cjs` for ESM projects) in the project root. It exports an object with keys: `srcDir`, `outFileName`, `moduleFilePattern`, `skipPatterns` (string[]), `pureReexports` (string[]), `generateJs` (bool). CLI flags always override config values. The CLI merges config-file `skipPatterns` and `pureReexports` into both `genImport` and `genAppConfig` calls.

## Programmatic API

`src/index.ts` exports `genImport`, `genPackage`, and `genAppConfig` for programmatic use — all accept the typed options interfaces from `src/@types/index.d.ts`. `GenAppConfigOptions` has two additional fields vs the config file: `genImportFile` and `genPackageFile` (absolute paths to override the default barrel locations).

Graph/cycle utilities (`buildDepGraph`, `detectCycles`, `topoSort`, `createTsProgram`, `DepGraph`) and `CycleReport` are also exported from the public barrel for programmatic use.

## Examples

`examples/express-app/` is a working Express project that dogfoods the tool. Its `src/gen-import.ts` and `src/gen-app-config.ts` show the exact barrel output format for a TS project with dependencies.

## Skills

Slash commands defined in `.claude/skills/` and `.claude/commands/`:
- `/build` — builds and verifies `dist/cli.js` and `dist/index.js` exist
- `/release [patch|minor|major]` — bumps version, builds, confirms with user, then publishes to npm
- `/fix-issues [file...]` — diagnoses and fixes code/security issues in the given files (or current git diff)
- `/review [file...]` — full code review on given files or current diff
