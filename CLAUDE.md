# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (compiles src/ → dist/)
pnpm build        # or: npm run build

# Run locally without building
npx ts-node src/cli.ts [options]

# Full test run (builds first, then runs the suite against dist/)
pnpm test

# Run tests only, without rebuilding (what CI runs after its own build step)
pnpm test:only

# Run a single test file
npx tsx --test test/integration/cli.test.ts

# Exercise the CLI against dist/ directly
node dist/cli.js
node dist/cli.js --app-config
node dist/cli.js --map
```

`prepublishOnly` runs `build` automatically before publishing. Always run `pnpm build` before publishing — `dist/` is in `.gitignore` but published to npm via `package.json`'s `files` field (`.npmignore` additionally excludes source, docs, and dotfiles).

Requires Node.js >=16.

## CI

GitHub Actions workflow (`.github/workflows/check.yml`) runs on every push to any branch: installs with pnpm 9, builds with Node 20 (`pnpm build`), then runs `pnpm test:only`. There are no separate lint steps — `tsc` (via build) and the `node:test` suite are the CI gates.

## Source layout

```
src/
  @types/index.d.ts     — all shared interfaces/types: CLI option types (GenImportOptions,
                          GenAppConfigOptions, ExportMapOptions, CliArgs), graph types
                          (ModuleGraph, Edge, EdgeKind, Scc, SccResult), barrel-safety types
                          (BarrelAnalysis, BarrelSafety), diagnostic types (Diagnostic,
                          DiagnosticCode, DiagnosticSeverity), and FileInfo/CycleReport
  index.ts              — public barrel: re-exports core/* plus selected analysis/script
                          helpers (buildDepGraph, detectCycles, topoSort, buildModuleGraph,
                          tarjanScc, analyzeBarrel, scanFile, diagnostics helpers, etc.) and
                          DEFAULT_SKIP_PATTERNS / DEFAULT_MODULE_FILE_PATTERN(S)
  cli.ts                — thin CLI wrapper; parses argv, loads gen-import.config.js, dispatches
                          to genImport / genAppConfig / genExportMap / watchSrc
  core/
    import.ts            — genImport(): the main barrel generator
    app-config.ts         — genAppConfig(): zero-import aggregator barrel
    export-map.ts          — genExportMap(): export/import visualization (console/json/mermaid)
    watch.ts               — watchSrc(): debounced fs.watch loop behind --watch
  analysis/
    scan.ts               — per-file AST scan: classifies every import/export/require/dynamic
                            import into an EdgeKind, and detects "eager" reads (module body,
                            class heritage, decorators, static fields) vs deferred ones
    graph.ts               — buildModuleGraph(): resolves specifiers to files and builds a
                            ModuleGraph of Edges; contractBarrel()/withBarrelExports() model a
                            barrel file's re-exports as edges to their real owning files
    scc.ts                 — tarjanScc(), topoOrder(), cyclicSccs(), shortestCycle(),
                            cycleEdges(), condensation() — generic graph algorithms over
                            ModuleGraph
    barrel.ts              — analyzeBarrel()/analyzeBarrelGraph(): classifies a barrel as
                            safe / type-safe / ordered / unsafe; selectSafeExports() computes
                            which exports --safe-barrels must demote/drop to break a cycle
    diagnostics.ts          — turns cycle/barrel analysis into GI001–GI009 Diagnostic objects
                            with human-readable advice; formatDiagnostics() renders them
    index.ts               — barrel re-exporting the above for internal + public use
  script/index.ts        — remaining shared helpers: walk, detectModuleType,
                          detectProjectLanguage, toJsPath, createTsProgram, analyzeFiles
                          (TypeChecker-based export classification), findNameCollisions,
                          buildDepGraph/detectCycles/topoSort (thin wrappers over analysis/*),
                          all buildXOutput barrel renderers (plain, lazy, globals, lazy-globals),
                          readPreviousExports, parseBarrelExports
  utils/index.ts         — re-exports walk/detectModuleType/detectProjectLanguage/toJsPath from
                          script/, plus DEFAULT_SKIP_PATTERNS and DEFAULT_MODULE_FILE_PATTERN
  gen-import.ts           — auto-generated barrel (dogfoods the tool); do not edit
  gen-app-config.ts       — auto-generated aggregator barrel; do not edit
test/
  unit/analysis.test.ts            — scanFile edge classification, scc algorithms
  integration/cli.test.ts          — CLI exit codes, --strict modes, generated file contents
  integration/runtime-oracle.test.ts — compiles/runs generated barrels via tsc and tsx to
                                       verify circular-dependency predictions hold at runtime
  regression/tsx-lazy-barrel.test.ts — regression coverage for the tsx/esbuild module.exports
                                       reassignment quirk (see script/index.ts lazy builders)
  helpers/workspace.ts              — createWorkspace(): scaffolds a temp project, runs the
                                       built CLI against it, and can execute output via tsc or tsx
```

`.gitignore` excludes `dist/` and `node_modules/` (source `.ts` files under `src/` are tracked; only compiled `.js`/`.d.ts` output goes to `dist/`). The tool compiles to `dist/` (CommonJS, ES2020) via `tsc`.

## Architecture

### Module graph & barrel-safety pipeline (`src/analysis/`)

This is the core analysis engine and the least discoverable part of the codebase — it spans five files that must be read together:

1. **`scan.ts`** walks a single file's AST and emits `RawEdge`s, one per import/export/`require()`/dynamic `import()`. Each edge gets an `EdgeKind` (`value-static`, `type-only`, `dynamic`, `require`, `side-effect`) and an `eager` flag: `eager` means the imported binding is read while the module body itself evaluates (top-level statement, class heritage clause, decorator argument, static field) rather than deferred inside a function — eager reads are what actually crash on a circular require.
2. **`graph.ts`**'s `buildModuleGraph()` resolves every edge's specifier to a real file (via `ts.resolveModuleName`) and produces a `ModuleGraph` (`{ nodes, out: Map<file, Edge[]>, barrels }`). `contractBarrel()`/`withBarrelExports()` rewrite a barrel file's own edges so that "imports from the barrel" become "imports from whichever source file actually owns that exported name" — this is what lets cycle detection see through a barrel to the real dependency.
3. **`scc.ts`** is generic graph theory over `ModuleGraph`: `tarjanScc()` finds strongly-connected components (restricted to `INIT_EDGE_KINDS` — the edge kinds that run at module-init time), `topoOrder()` flattens SCCs into a safe emission order, `shortestCycle()`/`cycleEdges()` extract a human-readable cycle path for diagnostics.
4. **`barrel.ts`**'s `analyzeBarrelGraph()` runs the barrel's contracted graph through `tarjanScc()` and classifies it into a `BarrelSafety`: `safe` (no cycle), `type-safe` (cycle only through erased type imports), `ordered` (cycle exists but every read is deferred, so init still completes), or `unsafe` (cycle with an eager read — fails at runtime). `selectSafeExports()` is what `--safe-barrels` calls to compute which exports must be demoted (types kept, values dropped) or fully dropped to break an unsafe/ordered cycle.
5. **`diagnostics.ts`** turns cycle/barrel analysis results into `Diagnostic` objects with a stable `DiagnosticCode` and concrete advice text (e.g. pointing at the exact file:line of the eager read, or suggesting NestJS `forwardRef` when the cycle is between `.module.ts`/`.service.ts` files).

**Diagnostic codes** (severity in parens):

| Code | Meaning |
|---|---|
| GI001 (error) | Circular dependency with an init-time (eager) read — crashes at runtime |
| GI002 (error) | Barrel is inside a cycle with an init-time read |
| GI003 (warn) | Circular dependency, but all reads are deferred — resolves at call time |
| GI004 (warn) | Barrel is inside a cycle, but all reads deferred — fragile, breaks if any read becomes eager |
| GI005 (info) | Type-only cycle — erased before runtime, harmless unless `verbatimModuleSyntax` is enabled |
| GI006 (warn) | Export name collision across source files — only the first occurrence is re-exported |
| GI007 (info) | Direct-import recommendation (e.g. an export withheld by `--safe-barrels`) |
| GI008 (info) | Dynamic-import / already-deferred acknowledgement |
| GI009 (info) | NestJS `forwardRef` recommended for a decorator-time cycle |

`--strict[=<mode>]` maps `mode` to a subset of these codes (`cycles`→GI001, `barrels`→GI002/GI004, `collisions`→GI006, `all`→all four) and exits 1 if any matching diagnostic fires.

### Generation pipeline (`src/core/` + `src/script/index.ts`)

**`genImport(options)`** — `src/core/import.ts`, the main entry point:
1. Collects `.ts`/`.js` files from `srcDir`, filtering by `skipPatterns`/`pureReexports`/`.d.ts`; always skips the output file itself and the legacy `gen-package.ts`/`gen-app-config.ts` filenames to prevent circular re-exports
2. Splits into regular files and module files (matching `moduleFilePatterns`, default `.module.ts`/`.routes.ts`/`.router.ts`/`.route.ts`) — module files are appended last since NestJS-style files reference services/repos not yet exported
3. Creates a single `ts.Program`, reused for `analyzeFiles` (export classification) and `buildModuleGraph` (dependency edges)
4. Runs the barrel-safety pipeline above (`analyzeBarrelGraph`), collects cycle + barrel diagnostics, and — unless `--no-topo-sort` — topologically sorts files by SCC order before writing
5. If `--safe-barrels`, calls `selectSafeExports()` and re-analyzes the resulting barrel to confirm it's now safe
6. Diffs against the previous barrel content (`readPreviousExports`) and reports newly added exports
7. Writes the barrel (plain/lazy × normal/globals, chosen by `--lazy`/`--globals`), then prints diagnostics, a summary box, and an **Import/Export Graph** box (all via `boxen`+`chalk`)
8. Exits 1 if any diagnostic matches the active `--strict` mode

**`genAppConfig(options)`** — `src/core/app-config.ts`:
1. **Auto-update** (`autoUpdate: true` default, TS projects only): re-scans source files (skipping the barrel itself), diffs export names against what's already in `gen-import.ts`, and rewrites it in place if anything was added/removed — preserving whichever variant (lazy/non-lazy, globals/non-globals) the existing file already used
2. Writes `gen-app-config.ts`/`.js` (+ `.d.ts` companion for JS projects) as a single `export * from './gen-import'` — downstream code imports only from this file, never from individual source paths

**`genExportMap(options)`** — `src/core/export-map.ts`: independent of the barrel-safety pipeline. Analyzes exports per file and (unless `--no-imports`) resolved import edges between files, then renders `console` (tree view), `json`, or `mermaid` (flowchart) output. Always also writes `docs/export-map.json` regardless of the chosen format/outFile.

**`watchSrc(options)`** — `src/core/watch.ts`: debounced (150ms default) recursive `fs.watch` loop; `cli.ts` wires it to re-run whichever of the three generators were requested on every change, ignoring the generated files themselves.

**`src/script/index.ts`** still owns the lower-level, non-graph helpers used by all `core/` modules: `walk`, `detectModuleType`/`detectProjectLanguage` (reads `package.json` `"type"` / presence of `tsconfig.json` or `.ts` files), `createTsProgram`, `analyzeFiles` (uses `TypeChecker.getExportsOfModule` to classify each export as type-only vs value), `findNameCollisions`, and the barrel-content renderers (`buildDtsOutput`/`buildJsOutput` and their lazy/globals variants).

**`src/cli.ts`**
- Parses `process.argv` manually (no third-party arg parser) — deliberate, per `AGENTS.md`: avoid adding a CLI parsing dependency without a clear reason
- Loads `gen-import.config.js` (or `.cjs`) from the project root via `require()`
- CLI flags always override config file values
- Config-file `skipPatterns`/`pureReexports` are merged into both `genImport` and `genAppConfig` calls

## Key design decisions

- **No runtime dependencies** except `typescript`, `boxen`, and `chalk`. `typescript` is used directly for AST analysis via `ts.createProgram`/`ts.TypeChecker`, and for module resolution via `ts.resolveModuleName` in `buildModuleGraph`.
- **Single `ts.Program` per run** — created once in `genImport`/`genAppConfig`/`genExportMap` and reused across export analysis and graph building to avoid double parsing.
- **Eager vs. deferred reads are the crux of the safety model** — a cycle is only dangerous if some binding on it is read while a module body evaluates (`classifyReference()` in `scan.ts` walks up the AST to detect class heritage, decorators, static fields, or bare top-level statements). A cycle where every read happens inside a function body is `ordered`/fine, not `unsafe`.
- **Barrels are modeled by contraction, not by treating them as opaque nodes** — `contractBarrel()` rewrites "X imports from the barrel" into "X imports from whichever file really owns that binding," so cycle detection reflects the real runtime dependency, not the barrel indirection.
- **`generateJs` auto-detection** — defaults to `false` for TS projects, `true` for JS. Can always be overridden explicitly.
- **`lazy` defaults to `moduleType === 'cjs'`** and is force-disabled (with a warning) on ESM TS projects, since lazy re-exports rely on CJS `require()` getters.
- **`pureReexports`** paths must be relative to `rootDir` (not `srcDir`).
- **Module file deferral** — NestJS `*.module.ts` (and `.routes.ts`/`.router.ts`/`.route.ts`) files are appended last since they reference services/repos not yet exported; this avoids circular-require errors at runtime independent of the cycle-detection pipeline.
- **`genAppConfig` as a zero-import aggregator** — downstream code imports only from `gen-app-config`, which re-exports from the source barrel. No file ever needs to import from individual source paths.
- **The `gen-package.ts`/`.js` filenames are still reserved/skipped** by `genImport` for backward compatibility even though the `genPackage()` generator itself has been removed from the codebase — don't reintroduce a dependency on it existing.

## Config file

Users can place `gen-import.config.js` (or `gen-import.config.cjs` for ESM projects) in the project root. It exports an object with keys: `srcDir`, `outFileName`, `moduleFilePattern`, `skipPatterns` (string[]), `pureReexports` (string[]), `generateJs` (bool). CLI flags always override config values. The CLI merges config-file `skipPatterns` and `pureReexports` into both `genImport` and `genAppConfig` calls.

## Programmatic API

`src/index.ts` exports `genImport`, `genAppConfig`, and `genExportMap` for programmatic use, plus the graph/analysis internals for anyone building custom tooling on top: `buildModuleGraph`, `buildDepGraph`, `detectCycles`, `topoSort`, `createTsProgram`, `tarjanScc`, `topoOrder`, `analyzeBarrel`/`analyzeBarrelGraph`, `scanFile`, `collectCycleDiagnostics`/`collectBarrelDiagnostics`/`formatDiagnostics`, and the corresponding types (`Edge`, `EdgeKind`, `ModuleGraph`, `Scc`, `BarrelAnalysis`, `Diagnostic`, etc.) from `src/@types/index.d.ts`.

`GenAppConfigOptions` has an extra field vs the config file: `genImportFile` (absolute path override for the source barrel location).

## Testing

No framework dependency — tests use Node's built-in `node:test` + `node:assert/strict`, run via `tsx --test`. `test/helpers/workspace.ts`'s `createWorkspace()` scaffolds a temp project on disk, runs the **built** CLI (`dist/cli.js`) against it via `spawnSync`, and can additionally compile+run the generated output through `tsc` or execute it directly through `tsx` — this is how `runtime-oracle.test.ts` verifies that a barrel classified as `unsafe`/`safe` by static analysis actually crashes/works when really executed.

## Examples

`examples/express-app/` is a working Express project that dogfoods the tool. Its `src/gen-import.ts` and `src/gen-app-config.ts` show the exact barrel output format for a TS project with dependencies.

## Skills

Slash commands defined in `.claude/skills/` and `.claude/commands/`:
- `/build` — builds and verifies `dist/cli.js` and `dist/index.js` exist
- `/release [patch|minor|major]` — bumps version, builds, confirms with user, then publishes to npm
- `/fix-issues [file...]` — diagnoses and fixes code/security issues in the given files (or current git diff)
- `/review [file...]` — full code review on given files or current diff

Note: `.claude/commands/fix-issues.md` and `.claude/commands/review.md` currently contain checklist items (DTOs, `AppError`, Mongoose, `asyncHandler`) that don't apply to this codebase — they appear to be leftover from a different project. Prefer the checklists in `.claude/skills/fix-issues.md` and `.claude/skills/review.md`, which are scoped to this repo's actual conventions (skip patterns, `pureReexports`, symbol dedup, config/CLI precedence).
