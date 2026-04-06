# gen-import

[![npm](https://img.shields.io/npm/v/gen-import)](https://www.npmjs.com/package/gen-import)
[![license](https://img.shields.io/npm/l/gen-import)](LICENSE)
[![node](https://img.shields.io/node/v/gen-import)](https://nodejs.org)

Generate TypeScript barrel files for your Node / Express project using the TypeScript compiler API — zero runtime dependencies beyond `typescript` itself.

`gen-import` walks your `src/` directory, analyses every exported symbol (values, types, and defaults) via the TS compiler API, and writes deduplicated barrel files. Module router files (e.g. `*.module.ts`, `*.router.ts`) are automatically deferred to the end to prevent circular-dependency issues with NestJS-style setups.

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Generated files](#generated-files)
- [CLI reference](#cli-reference)
- [Config file](#config-file)
- [Programmatic API](#programmatic-api)
  - [genImport](#genimport)
  - [genAppConfig](#genappconfig)
- [How it works](#how-it-works)
- [Example output](#example-output)
- [Requirements](#requirements)

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

---

## Generated files

| File | Command | Description |
|---|---|---|
| `src/gen-import.ts` | _(default)_ | TS source barrel re-exporting all source exports (TS projects) |
| `src/gen-import.js` | _(default)_ | JS runtime barrel (JS projects) |
| `src/gen-import.d.ts` | _(default)_ | TS declaration companion (JS projects only) |
| `src/gen-app-config.ts` | `--app-config` | Aggregator barrel — re-exports from `gen-import` (TS projects) |
| `src/gen-app-config.js` | `--app-config` | JS runtime companion for the aggregator barrel |
| `src/gen-app-config.d.ts` | `--app-config` | TS declaration companion for aggregator (JS projects only) |

---

## CLI reference

```
Usage:
  npx gen-import [options]

Source barrel (gen-import.ts for TS projects, gen-import.js for JS projects):
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: auto-detected)
  -m, --module-pattern <pat>  Module file pattern deferred to end (repeatable; default: .module.ts .routes.ts .router.ts .route.ts)
  -g, --globals               Register all exports on Node.js global (no per-file imports needed)
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)

App-server config:
  --app-config                Generate an aggregator barrel that re-exports from gen-import
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

# Globals mode — import once in entry point, all exports become node globals
npx gen-import --globals

# App-config without auto-updating gen-import.ts
npx gen-import --app-config --no-auto-update
```

---

## Config file

Place `gen-import.config.js` in your project root to set persistent defaults. CLI flags always override config values.

```js
// gen-import.config.js
module.exports = {
  srcDir: 'src',
  outFileName: 'gen-import.ts', // or gen-import.js for JS projects
  moduleFilePattern: '.module.ts',
  skipPatterns: [
    'src/types/',          // global Express augmentation
    'src/app.ts',          // entry point
    'src/app.config.ts',
    'src/app.module.ts',
    'src/config/dotenv',
  ],
  pureReexports: [
    'src/config/index.ts',
    'src/Queue/index.ts',
  ],
}
```

---

## Programmatic API

```ts
import { genImport, genAppConfig } from 'gen-import'
```

### genImport

Scan source files and write a deduplicated barrel.

```ts
genImport({
  rootDir: '/path/to/project', // default: process.cwd()
  srcDir: 'src',               // default: 'src'
  outFileName: 'gen-import.ts',
  moduleFilePattern: '.module.ts', // or an array of patterns
  skipPatterns: ['src/types/'],
  pureReexports: ['src/config/index.ts'],
  generateJs: false,           // default: false
  globals: false,              // default: false
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root (must contain `tsconfig.json` for TS detection) |
| `srcDir` | `string` | `'src'` | Source directory relative to `rootDir` |
| `outFileName` | `string` | `'gen-import.ts'` (auto-detected) | Output filename inside `srcDir` |
| `skipPatterns` | `string[]` | `[]` | Extra path substrings to skip (merged with built-ins) |
| `pureReexports` | `string[]` | `[]` | Files already re-exported elsewhere (relative to `rootDir`) |
| `moduleFilePattern` | `string \| string[]` | `['.module.ts', '.routes.ts', '.router.ts', '.route.ts']` | Pattern(s) for files deferred to end of barrel |
| `generateJs` | `boolean` | `false` | For TS projects: also emit a `.js` companion file |
| `globals` | `boolean` | `false` | Register all value exports on Node.js `global` via `Object.assign` |

Built-in skip patterns (always active): `__tests__`, `.test.`, `.spec.`

---

### genAppConfig

Generate an aggregator barrel that re-exports from `gen-import`. Optionally auto-appends new source exports to `gen-import.ts`.

```ts
genAppConfig({
  rootDir: '/path/to/project',
  outFileName: 'gen-app-config.ts', // auto-detected
  genImportFile: 'gen-import.ts',   // barrel to re-export source exports from
  autoUpdate: true,    // scan sources, append new exports to gen-import.ts
  generateJs: false,   // default: false for TS projects, true for JS
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root |
| `srcDir` | `string` | `'src'` | Source / output directory |
| `outFileName` | `string` | `'gen-app-config.ts'` (auto) | Config output filename |
| `genImportFile` | `string` | `'gen-import.ts'` (auto) | Source barrel to re-export |
| `autoUpdate` | `boolean` | `true` | Append newly found source exports to `gen-import.ts` |
| `skipPatterns` | `string[]` | `[]` | Pass-through for source scanning during auto-update |
| `pureReexports` | `string[]` | `[]` | Pass-through for source scanning during auto-update |
| `moduleFilePattern` | `string \| string[]` | _(defaults)_ | Pass-through for source scanning during auto-update |
| `generateJs` | `boolean` | `false` for TS, `true` for JS | Also emit a `.js` companion file |

---

## Example output

### `src/gen-import.ts` (standard mode)

```ts
/**
 * gen-import.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import
 */

export type { UserDto, CreateUserDto } from './User/user.dto';
export { UserService } from './User/user.service';
export { UserRepository } from './User/user.repository';
export { default as userConfig } from './config/user.config';
export { UserModule } from './User/user.module';
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

export type { UserDto, CreateUserDto } from './User/user.dto';

import { UserService as _UserService } from './User/user.service';
import { UserRepository as _UserRepository } from './User/user.repository';

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

---

## Requirements

- Node.js >= 16
- TypeScript source files in your `src` directory (a `tsconfig.json` triggers TS mode; otherwise JS mode is used)

---

## Author

[@elrefai99](https://github.com/elrefai99)

## License

MIT
