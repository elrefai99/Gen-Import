import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-violet-600', className)} {...props} />
}
