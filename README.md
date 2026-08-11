<div align="center">
  # Gen-Import

<p>
  Automatically generate TypeScript/JavaScript barrel files using the TypeScript compiler API.<br/>
  Circular-dependency & barrel-safety analysis · lazy re-exports · topological sort · watch mode · export maps.
</p>

<p>
  <a href="https://www.npmjs.com/package/gen-import"><img src="https://img.shields.io/npm/v/gen-import" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/gen-import"><img src="https://img.shields.io/npm/dm/gen-import" alt="npm downloads" /></a>
  <img src="https://img.shields.io/node/v/gen-import" alt="node version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

</div>

---

## Table of contents

- [What it does](#what-it-does)
- [Console output](#console-output)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Generated files](#generated-files)
- [CLI reference](#cli-reference)
- [Config file](#config-file)
- [Circular dependency & barrel safety analysis](#circular-dependency--barrel-safety-analysis)
- [Lazy re-exports](#lazy-re-exports)
- [Module file deferral](#module-file-deferral)
- [Globals mode](#globals-mode)
- [Watch mode](#watch-mode)
- [Export map](#export-map)
- [Programmatic API](#programmatic-api)
- [Example output](#example-output)
- [Requirements](#requirements)

---

## What it does

`gen-import` walks your `src/` directory, analyses every exported symbol (values, types, and defaults) via the TypeScript compiler API, and writes a deduplicated barrel file. On each run it also:

- Builds a full **module dependency graph** (static imports, `export *`, dynamic `import()`, `require()`, class heritage, decorators) and detects **circular dependencies**
- Classifies the barrel itself as **safe / type-safe / ordered / unsafe**, and explains exactly which line breaks it at runtime
- Sorts files **topologically** so the barrel import order is safe for CommonJS
- Optionally emits **lazy (getter-based) re-exports** so the barrel itself never causes a circular-require crash
- Detects **export name collisions** across source files
- Diffs against the previous barrel to report **newly added exports**
- Prints **diagnostics** (with fix suggestions), a **summary box**, and an **import/export graph**, using `boxen` + `chalk`

---

## Console output

Every run prints diagnostics (if any), then two styled boxes.

**Diagnostics** — one line per finding, worst severity first, with a concrete fix:

```
error GI002  src/gen-import.ts is inside a cycle with an init-time read — this fails at runtime
    src/user/user.service.ts → src/user/user.repository.ts → src/user/user.service.ts
    fix: Breaks at src/user/user.repository.ts:4 — class heritage clause (`class X extends Y`).
         Run with --safe-barrels to withhold the offending exports and print direct-import lines.
```

**Summary box** — stats for the current run:

```
╭────────────────────────  gen-import  ────────────────────────╮
│ Source files   6                                             │
│ Total exports  18                                            │
│ Language       TypeScript                                    │
│ Output file    src/gen-import.ts                             │
│ Module         cjs                                            │
│ Globals        off                                           │
│ Lazy           on                                             │
│ Topo sort      on                                             │
│ Import edges   11                                             │
│ Cycles         none                                           │
│ Barrel         safe                                           │
│ Collisions     none                                           │
│ New exports    +3: UserDto, CreateUserDto, UpdateUserDto      │
╰──────────────────────────────────────────────────────────────╯
```

**Import / Export Graph** — shows every source file, its exports, and the barrel it feeds into:

```
╭──────────────────  Import / Export Graph  ──────────────────╮
│ ./config/env ──► src/gen-import.ts                          │
│   ├─ [V] PORT                                               │
│   ├─ [V] NODE_ENV                                           │
│   └─ [V] JWT_SECRET                                         │
│                                                             │
│ ./user/user.dto ──► src/gen-import.ts                       │
│   ├─ [T] UserDto                                            │
│   ├─ [T] CreateUserDto                                      │
│   └─ [T] UpdateUserDto                                      │
│                                                             │
│ ./middleware/auth.middleware ──► src/gen-import.ts          │
│   └─ [V] authMiddleware                                     │
│                                                             │
│ ./user/user.service ──► src/gen-import.ts                   │
│   └─ [V] UserService                                        │
│                                                             │
│ ./user/user.router ──► src/gen-import.ts                    │
│   └─ [V] userRouter                                         │
╰─────────────────────────────────────────────────────────────╯
```

Legend: `[T]` type export · `[V]` value export · `[D]` default export (aliased)

---

## Installation

```bash
npm install --save-dev gen-import
# or
pnpm add -D gen-import
# or
yarn add -D gen-import
```

---

## Quick start

```bash
# Generate source barrel only
npx gen-import

# Source barrel + globals mode (register all exports on Node.js global)
npx gen-import --globals

# Source barrel + app-config barrel
npx gen-import --app-config

# Withhold exports that would put the barrel in a cycle, instead of failing at runtime
npx gen-import --safe-barrels

# Watch src/ and regenerate on every change
npx gen-import --watch

```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "gen": "gen-import --app-config"
  }
}
```

Then import from the barrel instead of individual files:

```ts
// Before
import { UserService } from './user/user.service'
import { UserDto } from './user/user.dto'
import { authMiddleware } from './middleware/auth.middleware'

// After
import { UserService, UserDto, authMiddleware } from './gen-import'
```

---

## Generated files

| File | Command | Description |
|---|---|---|
| `src/gen-import.ts` | _(default)_ | Source barrel re-exporting all source exports (TS projects) |
| `src/gen-import.js` | _(default)_ | JS runtime barrel (JS projects) |
| `src/gen-import.d.ts` | _(default)_ | Type declaration companion (JS projects only) |
| `src/gen-app-config.ts` | `--app-config` | Aggregator that re-exports from `gen-import` (TS projects) |
| `src/gen-app-config.js` | `--app-config` | JS runtime companion for the aggregator |
| `src/gen-app-config.d.ts` | `--app-config` | Type declaration companion for aggregator (JS projects only) |
| `docs/export-map.json` | `--map` | JSON export/import map, always written alongside the requested `--map-format` output |

---

## CLI reference

```
Usage:
  npx gen-import [options]

Source barrel (gen-import.ts for TS projects, gen-import.js for JS projects):
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: auto-detected)
  -m, --module-pattern <pat>  Module file pattern deferred to end (default: .module.ts)
  -g, --globals               Register all exports on Node.js global (no per-file imports needed)
  --safe-barrels              Withhold exports that would put the barrel inside a dependency cycle
                              (types are kept — they are erased before runtime; dropped value
                              exports are reported with the direct-import line to use instead)
  --strict[=<mode>]           Exit 1 on blocking findings. mode: cycles | barrels | collisions | all
                              (default all). cycles=GI001, barrels=GI002/GI004, collisions=GI006
  --strict-cycles             Deprecated alias for --strict=cycles
  --no-topo-sort              Skip topological sort and use alphabetical order (legacy behaviour)
  --lazy                      Force lazy re-exports to prevent circular-dep errors
                              (default for CJS; CJS-only, ignored with a warning on ESM)
  --no-lazy                   Force static re-exports (default for ESM)
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)
  -w, --watch                 Watch src and auto-regenerate barrels on every change

Shared:
  --no-js                     Skip generating .js companion files
  -h, --help                  Show this help

App-server config:
  --app-config                Generate an aggregator barrel re-exporting from gen-import
  --app-config-out <filename> Config output filename (default: auto-detected)
  --no-auto-update            Skip auto-appending new source exports to gen-import

Export map (visualization):
  --map                       Generate export map visualization
  --map-format <fmt>          Output format: console (default), json, mermaid
  --map-out <file>            Write map to file instead of stdout
  --no-imports                Skip import relationship analysis (exports only)
```

### Examples

```bash
# Custom output filename
npx gen-import --out barrel.ts

# Skip additional paths
npx gen-import --skip src/types/ --skip src/app.ts

# Mark a file already re-exported by another barrel
npx gen-import --pure-reexport src/config/index.ts

# Fail CI only on runtime-breaking cycles (skip warnings on collisions/ordered barrels)
npx gen-import --strict=cycles

# Fail CI on any blocking finding (cycles, unsafe barrels, name collisions)
npx gen-import --strict

# Withhold cycle-causing exports instead of failing, and report the direct imports to use
npx gen-import --safe-barrels

# App-config without auto-updating gen-import.ts
npx gen-import --app-config --no-auto-update

# Generate a mermaid export map and write it to a file
npx gen-import --map --map-format mermaid --map-out docs/exports.md
```

---

## Config file

Place `gen-import.config.js` (or `gen-import.config.cjs` for ESM projects) in your project root. CLI flags always override config values.

```js
// gen-import.config.js
module.exports = {
  srcDir: 'src',
  outFileName: 'gen-import.ts',
  skipPatterns: [
    'src/types/',
    'src/app.ts',
    'src/app.module.ts',
  ],
  pureReexports: [
    'src/config/index.ts',
  ],
}
```

| Field | Type | Description |
|---|---|---|
| `srcDir` | `string` | Source directory relative to root |
| `outFileName` | `string` | Barrel output filename |
| `moduleFilePattern` | `string \| string[]` | Module file patterns deferred to end of barrel |
| `skipPatterns` | `string[]` | Substrings — any file path containing one is skipped |
| `pureReexports` | `string[]` | Paths relative to `rootDir` to skip (they re-export externally) |
| `generateJs` | `boolean` | Force or suppress `.js` companion generation |
| `globals` | `boolean` | Register all value exports on Node.js `global` |
| `lazy` | `boolean` | Force lazy (getter-based) or static re-exports |
| `safeBarrels` | `boolean` | Withhold exports that would put the barrel in a cycle |
| `strict` | `'off' \| 'cycles' \| 'barrels' \| 'collisions' \| 'all'` | Exit 1 on the matching class of blocking finding |
| `noTopoSort` | `boolean` | Skip topological sort and use alphabetical order |
| `watch` | `boolean` | Watch `srcDir` and regenerate on every change |

Any field from the [`genImport` options table](#genimport) may be set here — the whole file is spread into the `genImport` call, with CLI flags applied on top. Only `srcDir`, `skipPatterns`, `pureReexports`, `moduleFilePattern`, and `generateJs` are also forwarded to `--app-config`'s source scan.

Built-in skip patterns (always active): `__tests__`, `.test.`, `.spec.`

---

## Circular dependency & barrel safety analysis

`gen-import` builds a full module dependency graph (static/dynamic imports, `require()`, `export *`, class heritage, decorators, static initializers) using the TypeScript compiler, then runs Tarjan's SCC algorithm to find cycles and classify the barrel's safety.

**Barrel safety** (shown in the summary box's `Barrel` row):

| Safety | Meaning |
|---|---|
| `safe` | The barrel isn't part of any dependency cycle |
| `type-safe` | Only a type-only cycle — erased before runtime, harmless today |
| `ordered` ⚠ | Barrel is inside a cycle, but every read is deferred — initialisation still completes, though it's fragile |
| `unsafe` ✖ | Barrel is inside a cycle with an init-time read — **this crashes at runtime** |

**Diagnostic codes:**

| Code | Severity | Meaning |
|---|---|---|
| `GI001` | error | Circular dependency with an init-time read |
| `GI002` | error | Barrel is inside a cycle with an init-time read |
| `GI003` | warn | Circular dependency, but all reads are deferred |
| `GI004` | warn | Barrel is inside a cycle, but all reads are deferred |
| `GI005` | info | Type-only cycle — harmless unless `verbatimModuleSyntax` is enabled or an `import type` is dropped |
| `GI006` | warn | Export name collision — only the first occurrence is re-exported |
| `GI007` | info | Direct import recommended (used for `--safe-barrels` withheld exports and repaired barrels) |
| `GI008` | info | Dynamic import recommended |
| `GI009` | info | NestJS `forwardRef` recommended for a decorator-time read in a cycle |

Each diagnostic names the exact file and line that breaks the cycle and suggests a fix (import directly, defer the read, or wrap it in `forwardRef`).

Two ways to act on this:

```bash
# Fail CI when a blocking finding is present
npx gen-import --strict              # any of GI001, GI002, GI004, GI006
npx gen-import --strict=cycles       # GI001 only
npx gen-import --strict=barrels      # GI002, GI004
npx gen-import --strict=collisions   # GI006

# Instead of failing, withhold the exports that cause the cycle and print
# the direct-import line to use for each one (types are kept, values dropped)
npx gen-import --safe-barrels
```

---

## Lazy re-exports

For CommonJS projects, `gen-import` defaults to **lazy re-exports**: value exports are installed on `module.exports` as getters that `require()` the source file on first access, instead of being imported eagerly at the top of the barrel. This means importing the barrel from one of its own source files no longer trips a circular-require error — the read is deferred until the getter actually runs.

- Default: **on** for CJS projects, **off** for ESM (`"type": "module"`)
- `--lazy` forces it on; ignored with a warning for ESM TypeScript projects (falls back to static re-exports)
- `--no-lazy` forces static re-exports even on CJS

Type-only exports are unaffected — `export type { ... }` is always static since types are erased before runtime.

---

## Module file deferral

NestJS-style module files reference services and repositories that haven't been exported yet. `gen-import` automatically defers matching files to the end of the barrel to prevent circular-require errors at runtime.

Default deferred patterns: `.module.ts` · `.routes.ts` · `.router.ts` · `.route.ts`

Override with `--module-pattern` (repeatable) or `moduleFilePattern` in the config file.

---

## Globals mode

With `--globals`, all value exports are registered on Node.js `global` when the barrel is imported once at your app entry point — no per-file imports needed anywhere else in the codebase.

```ts
// src/main.ts — import once at the very top
import './gen-import'

// Any other file — no import statement needed
const svc = new UserService()
```

Generate with:

```bash
npx gen-import --globals
```

TypeScript's `declare global` block is emitted so you get full IDE type-checking on all globals.

---

## Watch mode

`--watch` (or `-w`) watches `srcDir` recursively and re-runs the requested commands (barrel, app-config, export map) on every change, debounced by 150ms. It ignores changes to the generated barrel files themselves to avoid a regeneration loop.

```bash
npx gen-import --watch
npx gen-import --app-config --watch
```

Stop with <kbd>Ctrl+C</kbd>.

---

## Export map

`--map` analyses every source file's exports and import relationships and prints (or writes) a report. A `docs/export-map.json` copy is always written in addition to the requested format.

```bash
# Console report (default)
npx gen-import --map

# JSON, written to stdout or a file
npx gen-import --map --map-format json --map-out docs/exports.json

# Mermaid flowchart, ready to paste into a markdown file
npx gen-import --map --map-format mermaid --map-out docs/exports.md

# Skip import-relationship analysis, exports only (faster on large trees)
npx gen-import --map --no-imports
```

Console output:

```
📦 Export Map — 6 files, 18 exports, 11 import edges

  user/user.service.ts  (1 exports, imported by 2)
    ├─ values: UserService
    └─ imported by:
         ← user/user.router.ts
         ← gen-import.ts
```

---

## Programmatic API

```ts
import { genImport, genAppConfig, genPackage, genExportMap, watchSrc } from 'gen-import'
```

### genImport

```ts
genImport({
  rootDir: process.cwd(),      // default
  srcDir: 'src',               // default
  outFileName: 'gen-import.ts',
  moduleFilePattern: ['.module.ts', '.routes.ts'],
  skipPatterns: ['src/types/'],
  pureReexports: ['src/config/index.ts'],
  generateJs: false,           // default: false for TS, true for JS
  globals: false,              // default
  lazy: undefined,             // default: true for CJS, false for ESM
  safeBarrels: false,          // default
  strict: 'off',               // default; or 'cycles' | 'barrels' | 'collisions' | 'all'
  strictCycles: false,         // deprecated, equivalent to strict: 'cycles'
  noTopoSort: false,           // default
  watch: false,                // default
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root (must contain `tsconfig.json` for TS detection) |
| `srcDir` | `string` | `'src'` | Source directory relative to `rootDir` |
| `outFileName` | `string` | auto | Output filename inside `srcDir` |
| `skipPatterns` | `string[]` | `[]` | Extra path substrings to skip (merged with built-ins) |
| `pureReexports` | `string[]` | `[]` | Files already re-exported elsewhere (relative to `rootDir`) |
| `moduleFilePattern` | `string \| string[]` | `['.module.ts', '.routes.ts', '.router.ts', '.route.ts']` | Patterns for files deferred to end of barrel |
| `generateJs` | `boolean` | `false` | For TS projects: also emit a `.js` companion |
| `globals` | `boolean` | `false` | Register all value exports on Node.js `global` |
| `lazy` | `boolean` | `true` for CJS, `false` for ESM | Emit getter-based re-exports to avoid circular-require crashes |
| `safeBarrels` | `boolean` | `false` | Withhold exports that would put the barrel in a cycle (keeps types, drops/demotes values) |
| `strict` | `StrictMode` | `'off'` | Exit with code 1 when a blocking diagnostic of the given class is found |
| `strictCycles` | `boolean` | `false` | Deprecated — equivalent to `strict: 'cycles'` |
| `noTopoSort` | `boolean` | `false` | Skip topological sort and use alphabetical order |
| `watch` | `boolean` | `false` | Watch `srcDir` and regenerate on every change |

### genAppConfig

```ts
genAppConfig({
  rootDir: process.cwd(),
  outFileName: 'gen-app-config.ts',
  genImportFile: 'gen-import.ts',
  autoUpdate: true,
  generateJs: false,
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root |
| `srcDir` | `string` | `'src'` | Source / output directory |
| `outFileName` | `string` | auto | Config output filename |
| `genImportFile` | `string` | auto | Source barrel to re-export |
| `autoUpdate` | `boolean` | `true` | Append newly found source exports to `gen-import.ts` |
| `skipPatterns` | `string[]` | `[]` | Passed through to source scanning during auto-update |
| `pureReexports` | `string[]` | `[]` | Passed through to source scanning during auto-update |
| `moduleFilePattern` | `string \| string[]` | _(defaults)_ | Passed through to source scanning during auto-update |
| `generateJs` | `boolean` | `false` for TS, `true` for JS | Also emit a `.js` companion |

### genPackage

Reads `dependencies` (and optionally `devDependencies`) from `package.json` and generates a package barrel. Available via programmatic API only — not exposed in the CLI.

```ts
genPackage({
  rootDir: process.cwd(),
  // includeDev: true,         — also include devDependencies
  // include: ['lodash'],      — allowlist specific packages
  // exclude: ['express'],     — blocklist (use for packages with export =)
})
```

> **CJS note:** packages that use `export =` (e.g. `express`, `sequelize`) are incompatible with `export * from`. Exclude them from the package barrel and import them directly in source files.

### genExportMap

```ts
import { genExportMap } from 'gen-import'
import type { ExportMapResult } from 'gen-import'

const result: ExportMapResult = genExportMap({
  rootDir: process.cwd(),
  srcDir: 'src',
  format: 'json',        // 'console' (default) | 'json' | 'mermaid'
  outFile: 'docs/exports.json',
  includeImports: true,  // default
})
```

Always writes `docs/export-map.json` in addition to printing/writing the requested `format`.

### watchSrc

```ts
import { watchSrc } from 'gen-import'

const stop = watchSrc({
  srcDir: 'src',
  ignore: ['gen-import', 'gen-app-config', 'gen-package'],
  debounceMs: 150,       // default
  onChange: () => genImport({ srcDir: 'src' }),
})

// stop() to close the watcher
```

### Graph, SCC, and diagnostics utilities

```ts
import {
  buildDepGraph, detectCycles, topoSort, createTsProgram, findNameCollisions,
  buildModuleGraph, withBarrelExports, tarjanScc, topoOrder, cyclicSccs,
  shortestCycle, cycleEdges, condensation, analyzeBarrel, analyzeBarrelGraph,
  selectSafeExports, collectCycleDiagnostics, collectBarrelDiagnostics,
  formatDiagnostics, countBySeverity,
} from 'gen-import'
import type { DepGraph, CycleReport, ModuleGraph, Scc, SccResult, BarrelAnalysis, Diagnostic } from 'gen-import'

const program = createTsProgram(files, rootDir)
const graph = buildDepGraph(files, program)         // Map<string, Set<string>>
const cycles = detectCycles(graph)                  // CycleReport[]
const sorted = topoSort(files, graph)                // string[]

// Richer module-level analysis (used internally by genImport)
const moduleGraph = buildModuleGraph(files, { rootDir, program, barrelPaths: [] })
const scc = tarjanScc(moduleGraph)
const analysis: BarrelAnalysis = analyzeBarrel(moduleGraph, barrelId, exportedFiles, { lazy: true })
```

---

## Example output

### `src/gen-import.ts` (standard mode)

```ts
/**
 * gen-import.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import
 */

export { PORT, NODE_ENV, JWT_SECRET } from './config/env';
export type { UserDto, CreateUserDto, UpdateUserDto } from './user/user.dto';
export { authMiddleware } from './middleware/auth.middleware';
export { UserRepository } from './user/user.repository';
export { UserService } from './user/user.service';
export { userRouter } from './user/user.router';
```

### `src/gen-import.ts` (lazy mode — default for CJS)

```ts
// @ts-nocheck — auto-generated barrel with lazy CJS re-exports
/**
 * gen-import.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import
 *
 * Value exports use lazy getters to prevent circular-dependency
 * errors when source files import from this barrel (CJS).
 */

export type { UserDto, CreateUserDto } from './user/user.dto';

export declare const UserService: typeof import('./user/user.service').UserService;

Object.defineProperty(module.exports, 'UserService', { get() { return require('./user/user.service').UserService }, enumerable: true, configurable: true });
```

### `src/gen-import.ts` (globals mode)

```ts
/**
 * gen-import.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import --globals
 *
 * Import once in your entry point: import './gen-import'
 * After that, all exports are available as globals — no per-file imports needed.
 */

export type { UserDto, CreateUserDto } from './user/user.dto';

import { UserService as _UserService } from './user/user.service';
import { UserRepository as _UserRepository } from './user/user.repository';

export { _UserService as UserService, _UserRepository as UserRepository };

Object.assign(global as any, { UserService: _UserService, UserRepository: _UserRepository });

declare global {
  var UserService: typeof _UserService
  var UserRepository: typeof _UserRepository
}
```

### `src/gen-app-config.ts`

```ts
/**
 * gen-app-config.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import --app-config
 * Imports only from barrel files — no per-file imports.
 */

export * from './gen-import';
```

See `examples/express-app/` for a complete working Express project.

---

## Requirements

- Node.js >= 16
- A `tsconfig.json` in the project root triggers TypeScript mode; otherwise JavaScript mode is used

---

## Author

[@elrefai99](https://github.com/elrefai99)

## License

MIT
---
• <a href="https://elrefai.me/projects">Projects</a> •
