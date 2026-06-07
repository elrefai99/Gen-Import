// @ts-nocheck — auto-generated barrel with lazy CJS re-exports
/**
 * gen-import.ts — AUTO-GENERATED, do not edit manually.
 * Regenerate: npx gen-import
 *
 * Value exports use lazy getters to prevent circular-dependency
 * errors when source files import from this barrel (CJS).
 */

export type { WatchOptions } from './core/watch';
export type { DepGraph } from './script';

export declare const watchSrc: typeof import('./core/watch').watchSrc;
export declare const walk: typeof import('./script').walk;
export declare const detectModuleType: typeof import('./script').detectModuleType;
export declare const detectProjectLanguage: typeof import('./script').detectProjectLanguage;
export declare const toJsPath: typeof import('./script').toJsPath;
export declare const buildLazyGlobalDtsOutput: typeof import('./script').buildLazyGlobalDtsOutput;
export declare const buildGlobalDtsOutput: typeof import('./script').buildGlobalDtsOutput;
export declare const buildGlobalJsOutput: typeof import('./script').buildGlobalJsOutput;
export declare const buildGlobalDts: typeof import('./script').buildGlobalDts;
export declare const readPreviousExports: typeof import('./script').readPreviousExports;
export declare const createTsProgram: typeof import('./script').createTsProgram;
export declare const analyzeFiles: typeof import('./script').analyzeFiles;
export declare const buildDepGraph: typeof import('./script').buildDepGraph;
export declare const detectCycles: typeof import('./script').detectCycles;
export declare const topoSort: typeof import('./script').topoSort;
export declare const buildLazyDtsOutput: typeof import('./script').buildLazyDtsOutput;
export declare const buildDtsOutput: typeof import('./script').buildDtsOutput;
export declare const buildJsOutput: typeof import('./script').buildJsOutput;
export declare const parseBarrelExports: typeof import('./script').parseBarrelExports;
export declare const DEFAULT_SKIP_PATTERNS: typeof import('./utils').DEFAULT_SKIP_PATTERNS;
export declare const DEFAULT_MODULE_FILE_PATTERN: typeof import('./utils').DEFAULT_MODULE_FILE_PATTERN;
export declare const genExportMap: typeof import('./core/export-map').genExportMap;
export declare const genAppConfig: typeof import('./core/app-config').genAppConfig;
export declare const genImport: typeof import('./core/import').genImport;
export declare const DEFAULT_MODULE_FILE_PATTERNS: typeof import('./index').DEFAULT_MODULE_FILE_PATTERNS;
export declare const CycleReport: typeof import('./index').CycleReport;

Object.defineProperty(exports, 'watchSrc', { get() { return require('./core/watch').watchSrc }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'walk', { get() { return require('./script').walk }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'detectModuleType', { get() { return require('./script').detectModuleType }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'detectProjectLanguage', { get() { return require('./script').detectProjectLanguage }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'toJsPath', { get() { return require('./script').toJsPath }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildLazyGlobalDtsOutput', { get() { return require('./script').buildLazyGlobalDtsOutput }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildGlobalDtsOutput', { get() { return require('./script').buildGlobalDtsOutput }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildGlobalJsOutput', { get() { return require('./script').buildGlobalJsOutput }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildGlobalDts', { get() { return require('./script').buildGlobalDts }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'readPreviousExports', { get() { return require('./script').readPreviousExports }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'createTsProgram', { get() { return require('./script').createTsProgram }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'analyzeFiles', { get() { return require('./script').analyzeFiles }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildDepGraph', { get() { return require('./script').buildDepGraph }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'detectCycles', { get() { return require('./script').detectCycles }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'topoSort', { get() { return require('./script').topoSort }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildLazyDtsOutput', { get() { return require('./script').buildLazyDtsOutput }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildDtsOutput', { get() { return require('./script').buildDtsOutput }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'buildJsOutput', { get() { return require('./script').buildJsOutput }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'parseBarrelExports', { get() { return require('./script').parseBarrelExports }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'DEFAULT_SKIP_PATTERNS', { get() { return require('./utils').DEFAULT_SKIP_PATTERNS }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'DEFAULT_MODULE_FILE_PATTERN', { get() { return require('./utils').DEFAULT_MODULE_FILE_PATTERN }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'genExportMap', { get() { return require('./core/export-map').genExportMap }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'genAppConfig', { get() { return require('./core/app-config').genAppConfig }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'genImport', { get() { return require('./core/import').genImport }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'DEFAULT_MODULE_FILE_PATTERNS', { get() { return require('./index').DEFAULT_MODULE_FILE_PATTERNS }, enumerable: true, configurable: true });
Object.defineProperty(exports, 'CycleReport', { get() { return require('./index').CycleReport }, enumerable: true, configurable: true });
