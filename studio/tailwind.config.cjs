/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: 'hsl(var(--primary))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        destructive: 'hsl(var(--destructive))',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(0,0,0,.04), 0 8px 30px rgba(0,0,0,.04)',
      },
    },
  },
  plugins: [],
}
