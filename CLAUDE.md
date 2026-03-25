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

There are no test scripts configured. The `prepublishOnly` hook runs `build` automatically before publishing.

## Architecture

This is a two-file TypeScript CLI package published to npm as `gen-import`.

**`src/index.ts`** — the programmatic core, exports `genImport(options)`:
1. Walks `srcDir` recursively collecting `.ts` files
2. Filters out test files, the output file itself, `skipPatterns`, and `pureReexports`
3. Splits files into regular vs. module files (matching `moduleFilePattern`), then processes regular files first to avoid circular-dependency issues with NestJS-style `*.module.ts` files
4. Uses the TypeScript compiler API (`ts.createProgram` + `ts.TypeChecker`) to extract exported symbols per file, classifying each as type-only (`Interface | TypeAlias` without `Value` flag) or value
5. Deduplicates symbol names across files using a `Set<string>` and writes a barrel file with `export type { ... }` and `export { ... }` statements
6. Diffs against the previously written barrel file to report newly added exports

**`src/cli.ts`** — thin CLI wrapper:
- Parses `process.argv` manually (no third-party arg parser)
- Loads `gen-import.config.js` from the project root via `require()`
- CLI flags override config file values; both are merged before calling `genImport()`

**Output** (`dist/`) is committed to npm but not to git (`.npmignore` publishes `dist/`; `.gitignore` excludes it). Always run `pnpm build` before publishing.

## Key design decisions

- **No runtime dependencies** beyond `typescript` itself — the TypeScript compiler API is used directly for AST analysis.
- Default output filename in `genImport()` is `'gen-import.ts'` but the CLI help and README show `'the-import.ts'` — these differ intentionally; the config file or `--out` flag controls which name is used.
- `pureReexports` files are skipped entirely from analysis (they already re-export via another barrel); their path must be relative to `rootDir`.
