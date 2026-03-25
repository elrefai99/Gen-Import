# gen-import

[![npm](https://img.shields.io/npm/v/gen-import)](https://www.npmjs.com/package/gen-import)
[![license](https://img.shields.io/npm/l/gen-import)](LICENSE)
[![node](https://img.shields.io/node/v/gen-import)](https://nodejs.org)

Generate TypeScript barrel files for your Node / Express project using the TypeScript compiler API — zero runtime dependencies beyond `typescript` itself.

`gen-import` walks your `src/` directory, analyses every exported symbol (values, types, and defaults) via the TS compiler API, and writes deduplicated barrel files. Module router files (e.g. `*.module.ts`) are automatically deferred to the end to prevent circular-dependency issues with NestJS-style setups.

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Generated files](#generated-files)
- [CLI reference](#cli-reference)
- [Config file](#config-file)
- [Programmatic API](#programmatic-api)
  - [genImport](#genimport)
  - [genPackage](#genpackage)
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

# Source barrel + package barrel
npx gen-import --packages

# All three outputs in one shot
npx gen-import --packages --app-config
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "gen": "gen-import --packages --app-config"
  }
}
```

---

## Generated files

| File | Command | Description |
|---|---|---|
| `src/gen-import.d.ts` | _(default)_ | TS declaration barrel re-exporting all source exports |
| `src/gen-import.js` | _(default)_ | JS runtime barrel (CJS or ESM, auto-detected) |
| `src/gen-package.d.ts` | `--packages` | TS declaration barrel for npm dependencies |
| `src/gen-package.js` | `--packages` | JS runtime barrel for npm dependencies |
| `src/gen-app-config.d.ts` | `--app-config` | Server config — re-exports both barrels, **no per-file imports** |
| `src/gen-app-config.js` | `--app-config` | JS companion for the server config |

---

## CLI reference

```
Usage:
  npx gen-import [options]

Source barrel  (gen-import.d.ts + gen-import.js):
  -r, --root <dir>            Project root (default: cwd)
  -s, --src <dir>             Source directory relative to root (default: src)
  -o, --out <filename>        Output filename inside src (default: gen-import.d.ts)
  -m, --module-pattern <pat>  Pattern for module files deferred to end (default: .module.ts)
  --skip <pattern>            Skip files whose path contains this string (repeatable)
  --pure-reexport <path>      Mark a file as already re-exported elsewhere (repeatable)

Package barrel  (gen-package.d.ts + gen-package.js):
  -p, --packages              Also generate the package barrel from package.json deps
  --packages-only             Only generate the package barrel, skip source barrel
  --pkg-out <filename>        Package barrel output filename (default: gen-package.d.ts)
  --include-pkg <name>        Only include this package (repeatable)
  --exclude-pkg <name>        Exclude this package (repeatable)
  --include-dev               Also include devDependencies

App-server config  (gen-app-config.d.ts + gen-app-config.js):
  --app-config                Generate a server config reading only from barrel files
  --app-config-out <filename> Config output filename (default: gen-app-config.d.ts)
  --no-auto-update            Skip auto-appending new source exports to gen-import.d.ts

Shared:
  --no-js                     Skip generating .js companion files (auto-skipped for TS projects)
  -h, --help                  Show this help
```

### Examples

```bash
# Custom output filename
npx gen-import --out barrel.d.ts

# Skip additional paths
npx gen-import --skip src/types/ --skip src/app.ts

# Mark a file already re-exported by another barrel
npx gen-import --pure-reexport src/config/index.ts

# Package barrel, exclude a specific package
npx gen-import --packages --exclude-pkg typescript

# App-server config without auto-updating gen-import.d.ts
npx gen-import --app-config --no-auto-update
```

---

## Config file

Place `gen-import.config.js` in your project root to set persistent defaults. CLI flags always override config values.

```js
// gen-import.config.js
module.exports = {
  srcDir: 'src',
  outFileName: 'gen-import.d.ts',
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
import { genImport, genPackage, genAppConfig } from 'gen-import'
```

### genImport

Scan source files and write a deduplicated barrel.

```ts
genImport({
  rootDir: '/path/to/project', // default: process.cwd()
  srcDir: 'src',               // default: 'src'
  outFileName: 'gen-import.d.ts',
  moduleFilePattern: '.module.ts',
  skipPatterns: ['src/types/'],
  pureReexports: ['src/config/index.ts'],
  generateJs: true,            // default: true
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root (must contain `tsconfig.json`) |
| `srcDir` | `string` | `'src'` | Source directory relative to `rootDir` |
| `outFileName` | `string` | `'gen-import.d.ts'` | Output filename inside `srcDir` |
| `skipPatterns` | `string[]` | `[]` | Extra path substrings to skip (merged with built-ins) |
| `pureReexports` | `string[]` | `[]` | Files already re-exported elsewhere (relative to `rootDir`) |
| `moduleFilePattern` | `string` | `'.module.ts'` | Pattern for files deferred to end of barrel |
| `generateJs` | `boolean` | `false` for TS projects, `true` for JS | Also emit a `.js` companion file |

Built-in skip patterns (always active): `__tests__`, `.test.`, `.spec.`

---

### genPackage

Read `package.json` dependencies and write a package barrel.

```ts
genPackage({
  rootDir: '/path/to/project',
  outFileName: 'gen-package.d.ts',
  includePackages: ['express', 'typeorm'], // whitelist — omit to include all
  excludePackages: ['typescript'],
  includeDev: false,
  generateJs: true,
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root |
| `srcDir` | `string` | `'src'` | Directory to write output into |
| `outFileName` | `string` | `'gen-package.d.ts'` | Output filename inside `srcDir` |
| `includePackages` | `string[]` | _(all deps)_ | Whitelist specific packages |
| `excludePackages` | `string[]` | `[]` | Always exclude these packages |
| `includeDev` | `boolean` | `false` | Also include `devDependencies` |
| `generateJs` | `boolean` | `false` for TS projects, `true` for JS | Also emit a `.js` companion file |

---

### genAppConfig

Generate a server-config barrel that **reads only from the two barrel files** — no per-file imports anywhere. Optionally auto-appends new source exports to `gen-import.d.ts`.

```ts
genAppConfig({
  rootDir: '/path/to/project',
  outFileName: 'gen-app-config.d.ts', // default
  genImportFile: 'gen-import.d.ts',   // barrel to re-export source exports from
  genPackageFile: 'gen-package.d.ts', // barrel to re-export package exports from
  autoUpdate: true,    // scan sources, append new exports to gen-import.d.ts
  generateJs: true,
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root |
| `srcDir` | `string` | `'src'` | Source / output directory |
| `outFileName` | `string` | `'gen-app-config.d.ts'` | Config output filename |
| `genImportFile` | `string` | `'gen-import.d.ts'` | Source barrel to re-export |
| `genPackageFile` | `string` | `'gen-package.d.ts'` | Package barrel to re-export |
| `autoUpdate` | `boolean` | `true` | Append newly found source exports to `gen-import.d.ts` |
| `skipPatterns` | `string[]` | `[]` | Pass-through for source scanning during auto-update |
| `pureReexports` | `string[]` | `[]` | Pass-through for source scanning during auto-update |
| `moduleFilePattern` | `string` | `'.module.ts'` | Pass-through for source scanning during auto-update |
| `generateJs` | `boolean` | `false` for TS projects, `true` for JS | Also emit a `.js` companion file |

---

## How it works

### Source barrel

1. **Walks** `srcDir` recursively, collecting `.ts` files.
2. **Filters** out `.d.ts` files, test files, the output file itself, `skipPatterns`, and `pureReexports`.
3. **Analyses** each file with the TypeScript compiler API (`ts.createProgram` + `TypeChecker`) to extract exported symbols — values, type-only (`Interface | TypeAlias`), and default exports.
4. **Orders** module files (matching `moduleFilePattern`) after regular files to prevent circular-require issues with NestJS-style modules.
5. **Deduplicates** symbol names with a `Set` and writes `export { ... }` / `export type { ... }` statements.
6. **Reports** a diff of newly added exports since the last run.

### Package barrel

Reads `dependencies` (and optionally `devDependencies`) from `package.json` and writes `export * from '<package>'` for each entry.

### App-server config

1. **Auto-update** (when `autoUpdate: true`) — scans source files, compares against what is already in `gen-import.d.ts`, and appends only the new exports. Also regenerates the `gen-import.js` companion.
2. **Writes** `gen-app-config.d.ts` with two lines — `export * from './gen-import'` and `export * from './gen-package'`. No individual source-file imports.
3. **Writes** the `.js` companion using `require` (CJS) or `export *` (ESM), pointing at the two barrel `.js` files only.

---

## Example output

### `src/gen-import.d.ts`

```ts
/**
 * gen-import.d.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import
 */

export type { UserDto, CreateUserDto } from './User/user.dto';
export { UserService } from './User/user.service';
export { UserRepository } from './User/user.repository';
export { default as userConfig } from './config/user.config';
export { UserModule } from './User/user.module';
```

### `src/gen-package.d.ts`

```ts
/**
 * gen-package.d.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import --packages
 */

export * from 'express';
export * from 'typeorm';
export * from 'class-validator';
```

### `src/gen-app-config.d.ts`

```ts
/**
 * gen-app-config.d.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import --app-config
 * Imports only from barrel files — no per-file imports.
 */

export * from './gen-import';
export * from './gen-package';
```

---

## Requirements

- Node.js >= 16
- A `tsconfig.json` in your project root
- TypeScript source files in your `src` directory

---

## Author

[@elrefai99](https://github.com/elrefai99)

## License

MIT
