Run a full code review on the files provided (or the current git diff if no files are specified).

## Instructions

1. **Determine scope**
   - If the user passed file paths as arguments (`$ARGUMENTS`), review those files.
   - If no arguments, run `git diff HEAD` to get the current uncommitted changes, and `git diff main...HEAD` to get all changes on this branch vs main.

2. **Read every file in scope** — do not review code you have not read.

3. **Apply the code-reviewer agent checklist** across all files:
   - Module pattern compliance (router → validateDTO → controller → service)
   - Import convention (`@/gen-import` for cross-module)
   - Error handling (AppError, asyncHandler, no raw throw)
   - Async safety (no floating promises)
   - Logging (createLogger, no sensitive fields)
   - TypeScript correctness (no `any`, no unsafe `!`)
   - Response shape consistency
   - Performance & DB usage (projections, no N+1, paginate())
   - Rate limiting placement
   - Cookie security

4. **Output findings** using this format for each issue:
   ```
   [SEVERITY] File:line — Description
     Why: explain the problem
     Fix: concrete suggestion
   ```
   Severity levels: `[CRITICAL]` · `[HIGH]` · `[MEDIUM]` · `[LOW]` · `[SUGGESTION]`

5. **End with a summary table**:
   ```
   --- Review Summary ---
   Files reviewed: N
   Critical: N | High: N | Medium: N | Low: N | Suggestions: N
   Verdict: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
   ```

Focus on real problems. Do not flag style issues that ESLint handles. Do not suggest changes outside the reviewed scope.
