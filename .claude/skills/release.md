Prepare and publish a new version of the package to npm.

## Instructions

1. **Check working tree** — run `git status`. Abort if there are uncommitted changes.

2. **Build** — run `pnpm build`. Fix any errors before continuing.

3. **Bump version** — determine the version bump type from `$ARGUMENTS` (`patch`, `minor`, or `major`). Default to `patch` if not specified.
   - Run `npm version <type>` (this updates `package.json` and creates a git tag).

4. **Verify dist output** — confirm `dist/cli.js`, `dist/index.js`, and `dist/index.d.ts` all exist.

5. **Confirm with the user** before publishing. Show the version that will be published and the files in `dist/`.

6. **Publish** — run `npm publish` only after explicit user confirmation.

7. **Report** the published version and npm package URL.
