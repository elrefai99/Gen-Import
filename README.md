<div align="center">
  <img src="https://lh3.googleusercontent.com/d/1YpSkag4qd0TVzgaWSscSgsVneClHPOfl" width="200" alt="Gen-Import" />

  # Gen-Import

<p>
  Automatically generate TypeScript/JavaScript barrel files using the TypeScript compiler API.<br/>
  Cycle detection · topological sort · globals mode · rich console output.
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
- [Circular dependency detection](#circular-dependency-detection)
- [Module file deferral](#module-file-deferral)
- [Globals mode](#globals-mode)
- [Programmatic API](#programmatic-api)
- [Example output](#example-output)
- [Requirements](#requirements)

---

## What it does

`gen-import` walks your `src/` directory, analyses every exported symbol (values, types, and defaults) via the TypeScript compiler API, and writes a deduplicated barrel file. On each run it also:

- Detects **circular dependencies** across your source files and prints a clear warning
- Sorts files **topologically** so the barrel import order is safe for CommonJS
- Diffs against the previous barrel to report **newly added exports**
- Prints a **summary box** and **import/export graph** in the terminal

---

## Console output

Every run prints two styled boxes using `boxen` and `chalk`:

**Summary box** — stats for the current run:

```
╭────────────────────────  gen-import  ────────────────────────╮
│ Source files   6                                             │
│ Total exports  18                                            │
│ Language       TypeScript                                    │
│ Output file    src/gen-import.ts                             │
│ Module         cjs                                           │
│ Globals        off                                           │
│ Topo sort      on                                            │
│ Cycles         none                                          │
│ New exports    +3: UserDto, CreateUserDto, UpdateUserDto     │
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

---

## CLI reference

```
Usage:
  npx gen-import [options]

Source barrel (gen-import.ts for TS projects, gen-import.js for JS projects):
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: auto-detected)
  -m, --module-pattern <pat>  Module file pattern deferred to end (repeatable)
  -g, --globals               Register all exports on Node.js global
  --strict-cycles             Exit with code 1 if circular dependencies are detected
  --no-topo-sort              Skip topological sort and use alphabetical order
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)

App-server config:
  --app-config                Generate an aggregator barrel re-exporting from gen-import
  --app-config-out <filename> Config output filename (default: auto-detected)
  --no-auto-update            Skip auto-appending new source exports to gen-import

Shared:
  --no-js                     Skip generating .js companion files
  -h, --help                  Show this help
```

### Examples

```bash
# Custom output filename
npx gen-import --out barrel.ts

# Skip additional paths
npx gen-import --skip src/types/ --skip src/app.ts

# Mark a file already re-exported by another barrel
npx gen-import --pure-reexport src/config/index.ts

# Fail CI on circular dependencies
npx gen-import --strict-cycles

# App-config without auto-updating gen-import.ts
npx gen-import --app-config --no-auto-update
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

Built-in skip patterns (always active): `__tests__`, `.test.`, `.spec.`

---

## Circular dependency detection

`gen-import` builds a full dependency graph of your source files using the TypeScript compiler and runs DFS-based cycle detection on every run.

When cycles are found they are printed before the summary:

```
⚠  2 circular dependencies detected:
  src/a.ts → src/b.ts → src/a.ts
  src/c.ts → src/d.ts → src/c.ts
```

The summary box border turns yellow and the **Cycles** row shows the count.

Add `--strict-cycles` to exit with code 1 and fail CI when any cycle is detected:

```bash
npx gen-import --strict-cycles
```

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

## Programmatic API

```ts
import { genImport, genAppConfig, genPackage } from 'gen-import'
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
  strictCycles: false,         // default
  noTopoSort: false,           // default
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
| `strictCycles` | `boolean` | `false` | Exit with code 1 when circular dependencies are found |
| `noTopoSort` | `boolean` | `false` | Skip topological sort and use alphabetical order |

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

### Graph and cycle utilities

```ts
import { buildDepGraph, detectCycles, topoSort, createTsProgram } from 'gen-import'
import type { DepGraph, CycleReport } from 'gen-import'

const program = createTsProgram(files, rootDir)
const graph = buildDepGraph(files, program)   // Map<string, Set<string>>
const cycles = detectCycles(graph)            // CycleReport[]
const sorted = topoSort(files, graph)         // string[]
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
