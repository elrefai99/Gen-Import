import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { GenPackageOptions } from '../@types'
import { detectModuleType, detectProjectLanguage, filterCompatiblePackages, toJsPath } from '../script'
import { buildPackageDts, buildPackageJs } from '../script'

export function genPackage(options: GenPackageOptions = {}): void {
     const rootDir = resolve(options.rootDir ?? process.cwd())
     const srcDir = resolve(rootDir, options.srcDir ?? 'src')
     const isTs = detectProjectLanguage(rootDir, srcDir) === 'ts'
     const moduleType = detectModuleType(rootDir)

     const outFileName = options.outFileName ?? (isTs ? 'gen-package.ts' : 'gen-package.js')
     const outFile = join(srcDir, outFileName)

     const writeTypeDecl = !isTs && !outFileName.endsWith('.d.ts')

     const generateJs = options.generateJs ?? false

     const pkgPath = join(rootDir, 'package.json')
     if (!existsSync(pkgPath)) {
          console.error('gen-import: no package.json found at', rootDir)
          process.exit(1)
     }

     const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
     }

     let packages = Object.keys(pkg.dependencies ?? {})
     if (options.includeDev) {
          packages = [...new Set([...packages, ...Object.keys(pkg.devDependencies ?? {})])]
     }
     if (options.includePackages?.length) {
          packages = packages.filter((p) => options.includePackages!.includes(p))
     }
     if (options.excludePackages?.length) {
          packages = packages.filter((p) => !options.excludePackages!.includes(p))
     }

     const { compatible, skipped } = filterCompatiblePackages(packages, rootDir)
     if (skipped.length) {
          console.warn(`⚠  Skipped (uses 'export =', incompatible with 'export * from'):`)
          skipped.forEach((p) => console.warn(`   ${p}`))
          console.warn(`   Import these directly in your source files, or use --exclude-pkg to suppress this warning.`)
     }
     packages = compatible

     if (isTs) {
          writeFileSync(outFile, buildPackageDts(packages, outFileName, rootDir), 'utf-8')
     } else {
          writeFileSync(outFile, buildPackageJs(packages, outFileName, moduleType), 'utf-8')
     }

     if (writeTypeDecl) {
          const dtsFile = outFile.replace(/\.js$/, '.d.ts')
          writeFileSync(dtsFile, buildPackageDts(packages, outFileName.replace(/\.js$/, '.d.ts'), rootDir), 'utf-8')
          console.log(`✓  ${relative(rootDir, dtsFile)}`)
     }

     // TS projects with explicit generateJs: also write a .js runtime companion
     if (isTs && generateJs) {
          const jsFile = toJsPath(outFile)
          writeFileSync(jsFile, buildPackageJs(packages, outFileName, moduleType), 'utf-8')
          console.log(`✓  ${relative(rootDir, jsFile)}`)
     }

     console.log(`✓  ${relative(rootDir, outFile)}`)
     console.log(`   ${packages.length} packages · ${isTs ? 'typescript' : 'javascript'} · module: ${moduleType}`)
}
