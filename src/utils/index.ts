export { walk, detectModuleType, detectProjectLanguage, toJsPath } from '../script'

export const DEFAULT_SKIP_PATTERNS: string[] = ['__tests__', '.test.', '.spec.']
export const DEFAULT_MODULE_FILE_PATTERN: string = '.module.ts'
