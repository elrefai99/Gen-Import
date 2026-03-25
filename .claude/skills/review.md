Run a full code review on the files provided (or the current git diff if no files are specified).

## Instructions

1. **Determine scope**
   - If the user passed file paths as arguments (`$ARGUMENTS`), review those files.
   - If no arguments, run `git diff HEAD` to get uncommitted changes, and `git diff main...HEAD` for all branch changes.

2. **Read every file in scope** before reviewing.

3. **Check against these rules:**
   - TypeScript correctness: no `any`, no unsafe `!`, proper types used
   - Default skip patterns stay as `['__tests__', '.test.', '.spec.']` — no hardcoded output filenames
   - Output file is always skipped by path comparison (`file === outFile`), not by name pattern
   - `pureReexports` paths are relative to `rootDir`
   - CLI flags correctly override config file values (not the other way around)
   - No runtime dependencies added beyond `typescript`
   - Symbol deduplication uses a `Set<string>` across all files
   - `export type { ... }` used for type-only symbols, `export { ... }` for values

4. **Output each finding:**
   ```
   [SEVERITY] File:line — Description
     Why: explain the problem
     Fix: concrete suggestion
   ```
   Severity levels: `[CRITICAL]` · `[HIGH]` · `[MEDIUM]` · `[LOW]` · `[SUGGESTION]`

5. **End with a summary table:**
   ```
   --- Review Summary ---
   Files reviewed: N
   Critical: N | High: N | Medium: N | Low: N | Suggestions: N
   Verdict: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
   ```
