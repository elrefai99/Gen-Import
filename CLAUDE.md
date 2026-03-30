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
node dist/cli.js --packages --app-config
```

No test scripts are configured. `prepublishOnly` runs `build` automatically before publishing. Always run `pnpm build` before publishing — `dist/` is in `.gitignore` but published to npm via `.npmignore`.

## Source layout

```
src/
  @types/index.d.ts   — all shared interfaces (GenImportOptions, GenPackageOptions,
                         GenAppConfigOptions, FileInfo, CliArgs)
  index.ts            — public barrel: re-exports from core/* + exposes DEFAULT_SKIP_PATTERNS,
                         DEFAULT_MODULE_FILE_PATTERN
  cli.ts              — thin CLI wrapper; parses argv, loads gen-import.config.js, calls core fns
  core/
    import.ts         — genImport()
    packages.ts       — genPackage()
    app-config.ts     — genAppConfig()
  script/
    index.ts          — all shared helpers (walk, detectModuleType, detectProjectLanguage,
                         toJsPath, analyzeFiles, buildDtsOutput, buildJsOutput,
                         buildPackageDts, buildPackageJs, readPreviousExports, parseBarrelExports)
  gen-import.ts       — auto-generated barrel (dogfoods the tool); do not edit
  gen-app-config.ts   — auto-generated aggregator barrel; do not edit
  gen-package.d.ts    — auto-generated package barrel; do not edit
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
| `analyzeFiles(files, rootDir, srcDir)` | Creates `ts.Program`, uses `TypeChecker.getExportsOfModule` to classify each export as type-only (`Interface \| TypeAlias` without `Value` flag) or value — returns `FileInfo[]` |
| `buildDtsOutput` / `buildJsOutput` | Render barrel file content for source barrels |
| `buildPackageDts` / `buildPackageJs` | Render barrel file content for package barrels |
| `readPreviousExports(outFile)` | Parses existing barrel for `export { ... }` names — used to diff and report new exports |
| `parseBarrelExports(filePath)` | Like `readPreviousExports` but also handles `export * from` (recorded as sentinel `'*'`); used by `genAppConfig` auto-update |

**`genImport(options)`** — `src/core/import.ts`
1. Collects `.ts` files from `srcDir`, filters by `skipPatterns` / `pureReexports` / `.d.ts`
2. Always skips `gen-package.ts` (the package barrel) to prevent circular re-exports
3. Splits into regular files and module files (matching `moduleFilePattern`, default `.module.ts`) — module files appended last to avoid circular-require with NestJS-style `*.module.ts`
4. Calls `analyzeFiles`, deduplicates with a `Set<string>`, writes `gen-import.ts` for TS projects / `gen-import.js` + `gen-import.d.ts` companion for JS projects
5. Diffs against previous barrel content and logs newly added exports

**`genPackage(options)`** — `src/core/packages.ts`
Reads `dependencies` (+ optionally `devDependencies`) from `package.json`, applies include/exclude filters. Mirrors `genImport` language detection:
- **TS projects** → `gen-package.ts` with `export * from '<pkg>'`; `generateJs` defaults to `false`
- **JS projects** → `gen-package.js` runtime file + `gen-package.d.ts` type companion
- **CJS limitation**: packages using `export =` (e.g. `express`) are incompatible with `export * from`. Use `--exclude-pkg <name>` for such packages and import them directly in source files.

**`genAppConfig(options)`** — `src/core/app-config.ts`
1. **Auto-update** (when `autoUpdate: true`, default): scans source files (skipping `genPackagePath` and `genImportPath` to prevent circularity), compares against names already in `gen-import.ts`, appends only new exports
2. Mirrors `genImport`/`genPackage` language detection for output file:
   - **TS projects** → `gen-app-config.ts` (importable by ts-node / tsx / tsc); `generateJs` defaults to `false`
   - **JS projects** → `gen-app-config.js` runtime file + `gen-app-config.d.ts` type companion
3. Content is always two lines — `export * from './gen-import'` and `export * from './gen-package'`

**`src/cli.ts`**
- Parses `process.argv` manually (no third-party arg parser)
- Loads `gen-import.config.js` from the project root via `require()`
- CLI flags override config file values
- Config-file `skipPatterns` and `pureReexports` are merged into both `genImport` and `genAppConfig` calls (so entry-point exclusions declared in the config file also apply to auto-update scanning)

## Key design decisions

- **No runtime dependencies** — only `typescript` (used directly for AST analysis via `ts.createProgram` + `ts.TypeChecker`).
- **`generateJs` auto-detection** — defaults to `false` for TS projects, `true` for JS. Can always be overridden explicitly.
- **`pureReexports`** paths must be relative to `rootDir` (not `srcDir`).
- **Module file deferral** — NestJS `*.module.ts` files reference services/repos not yet exported; deferring them prevents circular-require errors at runtime.
- **`genAppConfig` as a zero-import aggregator** — downstream code imports only from `gen-app-config`, which re-exports from the two barrels. No file ever needs to import from individual source paths.
- **`gen-package.ts` auto-excluded from source scans** — both `genImport` and `genAppConfig` auto-update always skip the package barrel to prevent its re-exported package symbols from appearing as project-source symbols in `gen-import.ts`.
