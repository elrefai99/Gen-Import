import { watch as fsWatch } from 'node:fs'
import { resolve } from 'node:path'
import chalk from 'chalk'

export interface WatchOptions {
     srcDir: string
     ignore?: string[]
     debounceMs?: number
     onChange: () => void
}
export function watchSrc(options: WatchOptions): () => void {
     const srcDir = resolve(options.srcDir)
     const ignore = options.ignore ?? []
     const debounceMs = options.debounceMs ?? 150
     let timer: NodeJS.Timeout | null = null
     let running = false

     const trigger = (filename: string | null): void => {
          if (filename) {
               const name = String(filename)
               if (ignore.some((p) => name.includes(p))) return
               if (!/\.(ts|js)$/.test(name)) return
          }
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
               if (running) return
               running = true
               try {
                    options.onChange()
               } catch (err) {
                    console.error(chalk.red('✗  watch regeneration failed:'), err)
               } finally {
                    running = false
               }
          }, debounceMs)
     }

     console.log(
          chalk.cyan(`\n👁  Watching ${srcDir} for changes… `) +
          chalk.gray('(Ctrl+C to stop)\n'),
     )

     const watcher = fsWatch(srcDir, { recursive: true }, (_event, filename) => {
          trigger(filename ? String(filename) : null)
     })

     const stop = (): void => {
          if (timer) clearTimeout(timer)
          watcher.close()
     }

     process.on('SIGINT', () => {
          stop()
          console.log(chalk.gray('\n👋  Stopped watching.'))
          process.exit(0)
     })

     return stop
}
