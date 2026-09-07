/** @type {import('tailwindcss').Config} */
module.exports = {
  // Theming is driven by CSS custom properties in app/globals.css (:root +
  // [data-theme] + prefers-color-scheme), not Tailwind's dark: variant.
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-raised': 'var(--surface-raised)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        signal: 'var(--signal)',
      },
    },
  },
  plugins: [],
}
