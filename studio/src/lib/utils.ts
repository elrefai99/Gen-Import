export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function compactNumber(value: number): string {
  return Intl.NumberFormat('en', { notation: value > 999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

export function shortPath(path: string, max = 42): string {
  if (path.length <= max) return path
  return `…/${path.slice(-(max - 2))}`
}
