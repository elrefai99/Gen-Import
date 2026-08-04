import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'outline' | 'danger'
  size?: 'default' | 'sm' | 'icon'
}

export function Button({ className, variant = 'default', size = 'default', ...props }: Props) {
  return <button className={cn(
    'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:opacity-50',
    variant === 'default' && 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white',
    variant === 'ghost' && 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
    variant === 'outline' && 'border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900',
    variant === 'danger' && 'bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400',
    size === 'default' && 'h-9 px-4 py-2', size === 'sm' && 'h-8 px-3 text-xs', size === 'icon' && 'h-9 w-9',
    className,
  )} {...props} />
}
