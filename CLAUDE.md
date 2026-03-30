# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (compiles src/ → dist/)
pnpm build        # or: npm run build

# Run locally without building
npx ts-node src/cli.ts [options]

# Test the CLI against the repo itself
node dist/cli.js
```

No test scripts are configured. `prepublishOnly` runs `build` automatically before publishing. Always run `pnpm build` before publishing — `dist/` is in `.gitignore` but published to npm via `.npmignore`.

## Source layout

```
src/
  @types/index.d.ts   — all shared interfaces (GenImportOptions, GenPackageOptions,
                         GenAppConfigOptions, FileInfo, CliArgs)
  index.ts            — programmatic core; exports genImport, genPackage, genAppConfig
  cli.ts              — thin CLI wrapper; parses argv, loads config file, calls core fns
  gen-import.ts       — auto-generated barrel (the tool dogfoods itself); do not edit
  gen-app-config.d.ts — auto-generated aggregator barrel; do not edit
  gen-package.d.ts    — auto-generated package barrel; do not edit
```

`.gitignore` excludes `*.js` from `src/`, so no compiled JS lives there in git. The tool compiles to `dist/` (CommonJS, ES2020 target) via `tsc`.

## Architecture

**`src/@types/index.d.ts`** — single source of truth for all public and internal interfaces. Both `index.ts` and `cli.ts` import from here.

**`src/index.ts`** — three exported functions sharing a set of internal helpers:

| Helper | Purpose |
|---|---|
| `walk(dir)` | Recursive `readdirSync` file collector |
| `detectModuleType(rootDir)` | Reads `package.json` `"type"` field → `'esm' \| 'cjs'` |
| `detectProjectLanguage(rootDir, srcDir)` | Returns `'ts'` if `tsconfig.json` exists or any `.ts` file is found in `srcDir`, otherwise `'js'`. **TS projects default `generateJs` to `false`** (the TS compiler produces `.js`; pre-generated barrel `.js` files are not needed). |
| `toJsPath(filePath)` | Converts `.d.ts` / `.ts` path to `.js` |
| `analyzeFiles(files, rootDir, srcDir)` | Creates a `ts.Program`, uses `TypeChecker.getExportsOfModule` to classify each export as type-only (`Interface \| TypeAlias` without `Value` flag) or value, returns `FileInfo[]` |
| `buildDtsOutput` / `buildJsOutput` | Render the barrel file content for source barrels |
| `buildPackageDts` / `buildPackageJs` | Render the barrel file content for package barrels |
| `readPreviousExports(outFile)` | Parses existing barrel for `export { ... }` names — used to diff and report new exports |
| `parseBarrelExports(filePath)` | Like `readPreviousExports` but also handles `export * from` (recorded as sentinel `'*'`); used by `genAppConfig` for auto-update logic |

**`genImport(options)`**
1. Collects `.ts` files from `srcDir`, filters by `skipPatterns` / `pureReexports` / `.d.ts`
2. Splits into regular files and module files (matching `moduleFilePattern`, default `.module.ts`) — module files are appended last to avoid circular-require issues with NestJS-style `*.module.ts`
3. Calls `analyzeFiles`, deduplicates with a `Set<string>`, writes `gen-import.d.ts` (+ `.js` for JS projects)
4. Diffs against previous barrel content and logs newly added exports

**`genPackage(options)`**
Reads `dependencies` (+ optionally `devDependencies`) from `package.json`, applies include/exclude filters. Mirrors `genImport` language detection:
- **TS projects** → `gen-package.ts` with `export * from '<pkg>'` lines; `generateJs` defaults to `false` (tsc produces the `.js`)
- **JS projects** → `gen-package.js` runtime file + `gen-package.d.ts` type companion

**`genAppConfig(options)`**
1. **Auto-update** (when `autoUpdate: true`, default): scans source files, compares against names already in `gen-import.d.ts` via `parseBarrelExports`, appends only new exports, regenerates `gen-import.js` if it exists
2. Writes `gen-app-config.d.ts` containing only two lines — `export * from './gen-import'` and `export * from './gen-package'` — **no per-file imports**
3. Writes `.js` companion pointing at the two barrel `.js` files only

**`src/cli.ts`**
- Parses `process.argv` manually (no third-party arg parser)
- Loads `gen-import.config.js` from the project root via `require()`
- CLI flags override config file values; all three option sets are merged before calling the core functions

## Key design decisions

- **No runtime dependencies** — only `typescript` (used directly for AST analysis via `ts.createProgram` + `ts.TypeChecker`).
- **`generateJs` auto-detection** — defaults to `false` for TS projects (detected via `tsconfig.json` or `.ts` files in `srcDir`), `true` for JS projects. Can always be overridden explicitly.
- **`pureReexports`** paths must be relative to `rootDir` (not `srcDir`).
- **Module file deferral** — NestJS `*.module.ts` files reference services/repos that aren't yet exported when the barrel is first processed; deferring them prevents circular-require errors at runtime.
- **`genAppConfig` as a zero-import aggregator** — downstream server code imports only from `gen-app-config`, which re-exports from the two barrels. No file in the project ever needs to import from individual source paths.
