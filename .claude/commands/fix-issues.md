Identify and fix all issues in the files provided (or current git diff if no files are specified).

## Instructions

1. **Determine scope**
   - If the user passed file paths as arguments (`$ARGUMENTS`), work on those files.
   - If no arguments, run `git diff HEAD` to find all modified files, then work on those.

2. **Read every file in scope** before making any edits.

3. **Run diagnostics first** — check IDE diagnostics via `mcp__ide__getDiagnostics` for TypeScript compiler errors, then also check manually for:

   **Code issues to fix:**
   - Missing `asyncHandler` wrapper on async controllers
   - Raw `new Error()` instead of `AppError` static factories
   - Direct cross-module imports (not through `@/gen-import`)
   - Missing `validateDTO` middleware in routers for routes that accept a body
   - Unhandled promise branches (missing `return` after `next(error)`)
   - `any` types that can be replaced with proper types
   - Floating promises (unawaited async calls)
   - Missing `createLogger` instantiation in service files
   - Unbounded `.find()` queries without `paginate()` utility
   - Mongoose queries without field projection where projection is needed

   **Security issues to fix:**
   - Auth cookies missing `httpOnly`, `secure`, or `sameSite` flags
   - Sensitive data (passwords, tokens) in log statements
   - Missing rate limiter on auth routes
   - User input used directly in DB queries without DTO whitelist
   - Stack traces or internal details exposed in error responses

4. **Fix each issue** using the Edit tool. For each fix:
   - Make the minimal change required — do not refactor surrounding code.
   - Preserve all existing logic unless it is the bug.
   - Do not add comments unless the fix itself is non-obvious.

5. **After all fixes**, run `mcp__ide__getDiagnostics` again to confirm no new TypeScript errors were introduced.

6. **Report what was fixed**:
   ```
   Fixed N issues in M files:
   - [SEVERITY] File:line — what was fixed
   - ...

   Remaining (requires manual attention or out of scope):
   - [SEVERITY] File:line — why it was not auto-fixed
   ```

Do not fix issues outside the determined scope. Do not make speculative improvements.
