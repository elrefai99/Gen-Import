// gen-import.config.js
// Persistent defaults for `node ../../dist/cli.js` in this project.
// CLI flags always override these values.
module.exports = {
  srcDir: 'src',
  // Skip the entry point — it should not be part of the public barrel.
  skipPatterns: ['src/app.js'],
}
// NOTE: express uses `export =` (CommonJS), incompatible with `export * from 'express'`.
// Use --exclude-pkg express (already in the gen/gen:packages scripts) and import express
// directly in source files.
