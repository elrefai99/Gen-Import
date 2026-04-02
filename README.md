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
| `src/gen-import.ts` | _(default)_ | TS source barrel re-exporting all source exports (TS projects) |
| `src/gen-import.js` | _(default)_ | JS runtime barrel (JS projects, or TS with `--no-js` disabled) |
| `src/gen-import.d.ts` | _(default)_ | TS declaration companion (JS projects only) |
| `src/gen-package.ts` | `--packages` | TS source barrel for npm dependencies (TS projects) |
| `src/gen-package.js` | `--packages` | JS runtime barrel for npm dependencies |
| `src/gen-package.d.ts` | `--packages` | TS declaration companion for npm packages (JS projects only) |
| `src/gen-app-config.ts` | `--app-config` | Server config barrel — re-exports both barrels (TS projects) |
| `src/gen-app-config.js` | `--app-config` | JS runtime companion for the server config |
| `src/gen-app-config.d.ts` | `--app-config` | TS declaration companion for server config (JS projects only) |

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
  --skip <pattern>            Skip files matching pattern (repeatable)
  --pure-reexport <path>      Mark a file as pure re-export to skip (repeatable)

Package barrel:
  -p, --packages              Also generate package barrel from package.json deps
  --packages-only             Only generate the package barrel, skip source barrel
  --pkg-out <filename>        Package barrel output filename (default: auto-detected)
  --include-pkg <name>        Only include this package (repeatable)
  --exclude-pkg <name>        Exclude this package (repeatable)
  --include-dev               Also include devDependencies in package barrel

App-server config:
  --app-config                Generate a server config that reads only from barrel files
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

# Package barrel, exclude a specific package
npx gen-import --packages --exclude-pkg typescript

# App-server config without auto-updating gen-import.ts
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
import { genImport, genPackage, genAppConfig } from 'gen-import'
```

### genImport

Scan source files and write a deduplicated barrel.

```ts
genImport({
  rootDir: '/path/to/project', // default: process.cwd()
  srcDir: 'src',               // default: 'src'
  outFileName: 'gen-import.ts',
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
| `outFileName` | `string` | `'gen-import.ts'` (auto-detected) | Output filename inside `srcDir` |
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
  outFileName: 'gen-package.ts',
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
| `outFileName` | `string` | `'gen-package.ts'` (auto) | Output filename inside `srcDir` |
| `includePackages` | `string[]` | _(all deps)_ | Whitelist specific packages |
| `excludePackages` | `string[]` | `[]` | Always exclude these packages |
| `includeDev` | `boolean` | `false` | Also include `devDependencies` |
| `generateJs` | `boolean` | `false` for TS projects, `true` for JS | Also emit a `.js` companion file |

---

### genAppConfig

Generate a server-config barrel that **reads only from the two barrel files** — no per-file imports anywhere. Optionally auto-appends new source exports to your source barrel (`gen-import.ts`).

```ts
genAppConfig({
  rootDir: '/path/to/project',
  outFileName: 'gen-app-config.ts', // auto-detected
  genImportFile: 'gen-import.ts',   // barrel to re-export source exports from
  genPackageFile: 'gen-package.ts', // barrel to re-export package exports from
  autoUpdate: true,    // scan sources, append new exports to gen-import.ts
  generateJs: true,
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root |
| `srcDir` | `string` | `'src'` | Source / output directory |
| `outFileName` | `string` | `'gen-app-config.ts'` (auto) | Config output filename |
| `genImportFile` | `string` | `'gen-import.ts'` (auto) | Source barrel to re-export |
| `genPackageFile` | `string` | `'gen-package.ts'` (auto) | Package barrel to re-export |
| `autoUpdate` | `boolean` | `true` | Append newly found source exports to `gen-import.ts` |
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

1. **Auto-update** (when `autoUpdate: true`) — scans source files, compares against what is already in `gen-import.ts`, and appends only the new exports. Also regenerates the `gen-import.js` companion if enabled.
2. **Writes** `gen-app-config.ts` with two lines — `export * from './gen-import'` and `export * from './gen-package'`. No individual source-file imports.
3. **Writes** the `.js` companion using `require` (CJS) or `export *` (ESM), pointing at the two barrel `.js` files only.

---

## Example output

### `src/gen-import.ts`

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

### `src/gen-package.ts`

```ts
/**
 * gen-package.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import --packages
 */

export * from 'express';
export * from 'typeorm';
export * from 'class-validator';
```

### `src/gen-app-config.ts`

```ts
/**
 * gen-app-config.ts — AUTO-GENERATED, do not edit manually.
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
