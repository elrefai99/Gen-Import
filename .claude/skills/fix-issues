Identify and fix all issues in the files provided (or current git diff if no files are specified).

## Instructions

1. **Determine scope**
   - If the user passed file paths as arguments (`$ARGUMENTS`), work on those files.
   - If no arguments, run `git diff HEAD` to find modified files.

2. **Read every file in scope** before making edits.

3. **Run diagnostics** via `mcp__ide__getDiagnostics` for TypeScript errors, then check for:

   **Logic issues:**
   - Output file skipped by name pattern instead of by resolved path comparison
   - Default skip patterns containing hardcoded output filenames
   - CLI flags not overriding config file values
   - `pureReexports` paths not being relative to `rootDir`
   - Symbol deduplication missing (same name exported from two files)
   - `export type` used for value exports or vice versa

   **TypeScript issues:**
   - `any` types that can be replaced with proper types
   - Unsafe non-null assertions (`!`) without a guard
   - Missing return types on exported functions

4. **Fix each issue** with the minimal change required. Do not refactor surrounding code.

5. After fixes, run `mcp__ide__getDiagnostics` again to confirm no new errors.

6. **Report:**
   ```
   Fixed N issues in M files:
   - [SEVERITY] File:line — what was fixed

   Remaining (manual attention needed):
   - [SEVERITY] File:line — why not auto-fixed
   ```
