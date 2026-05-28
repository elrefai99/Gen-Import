# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

`gen-import` is a TypeScript CLI/package that generates barrel files and export-map visualizations for Node/TypeScript projects. It uses the TypeScript compiler API directly and compiles to CommonJS in `dist/`.

## Commands

```bash
pnpm build
npm run build
npx ts-node src/cli.ts [options]
node dist/cli.js
node dist/cli.js --app-config
node dist/cli.js --map
```

There is no test script configured. The TypeScript build is the main verification gate.

CI runs on Node 20 with pnpm 9 and executes `pnpm install` followed by `pnpm build`.

## Source Layout

```text
src/
  @types/index.d.ts      Shared public interfaces and CLI option types.
  index.ts               Public barrel exports.
  cli.ts                 CLI parser and command dispatcher.
  core/
    import.ts            genImport() source barrel generation.
    app-config.ts        genAppConfig() app config barrel generation.
    export-map.ts        genExportMap() export/import map reporting.
  script/index.ts        Shared TypeScript compiler, graph, sorting, and output helpers.
  utils/index.ts         Re-exported helper constants and utility exports.
```

Examples live in `examples/`. Docs output lives in `docs/`.

## Architecture Notes

- `src/script/index.ts` owns most shared logic: file walking, module/language detection, TypeScript program creation, export analysis, dependency graph building, cycle detection, topological sorting, and barrel rendering.
- `genImport()` scans source files, skips generated/ignored files, analyzes exports, detects cycles, optionally topologically sorts files, then writes `gen-import` output.
- `genAppConfig()` writes an app config barrel that re-exports from the generated source barrel and can auto-append newly discovered exports.
- `genExportMap()` analyzes exports and optional internal import edges, prints console/json/mermaid output, and writes `docs/export-map.json`.
- `src/cli.ts` parses arguments manually. Avoid adding a CLI parser dependency unless there is a clear reason.

## Generated Files

- Do not hand-edit generated output such as `dist/` files or generated barrel files.
- `dist/` is ignored by Git but is the package publish output via `package.json` `files`.
- Run `pnpm build` after TypeScript source changes.

## Coding Guidelines

- Keep changes scoped to the requested behavior.
- Prefer existing helpers in `src/script/index.ts` and `src/utils/index.ts` over adding duplicate logic.
- Preserve strict TypeScript compatibility.
- Keep runtime dependencies minimal. Current runtime dependencies are `typescript`, `boxen`, and `chalk`.
- Keep CLI options and option types in sync across `src/cli.ts` and `src/@types/index.d.ts`.
- When adding generated output behavior, update both TypeScript and JavaScript project paths where applicable.

## Verification

Run:

```bash
pnpm build
```

## Permissions

Global rule:

- Ask the user first before making any code change.
- Show the intended change for review when possible.
- Wait for the user to accept or reject the change before editing project code.

### Allow

- Read tracked project files needed for the task.
- Read source code under `src/`, configuration under `config/`, and docs such as `README.md`, `CLAUDE.md`, and this file.
- Create new source or documentation files when they are required for the requested change.
- Edit application code, route files, models, middleware, utilities, tests, and markdown documentation.
- Update `package.json` when the task explicitly requires script or dependency changes.
- Run safe repo-local commands such as `rg`, `ls`, `sed`, `git status`, `pnpm lint`, and `pnpm test`.

### Deny

- Do not read, print, or copy secrets from `.env`, `.env.dev`, or any credential file.
- Do not modify `.env`, `.env.dev`, or other secret-bearing files unless the user explicitly asks.
- Do not modify `node_modules/`, generated caches, or log files.
- Do not change `pnpm-lock.yaml` unless dependency work is part of the task.
- Do not delete files, rename major directories, or rewrite large parts of the codebase without explicit approval.
- Do not run destructive git or shell commands such as `git reset --hard`, `git checkout --`, or broad `rm` operations.
- Do not alter deployment/infrastructure files (`Dockerfile`, `docker-compose.yml`, `ecosystem.config.cjs`) unless the task explicitly requires it.


No lint or test commands are currently defined.
