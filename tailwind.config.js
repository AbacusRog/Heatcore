/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        lineStrong: 'var(--line-strong)',
        accent: 'var(--accent)',
        accentInk: 'var(--accent-ink)',
        accentSoft: 'var(--accent-soft)',
        pos: 'var(--pos)',
        posSoft: 'var(--pos-soft)',
        neg: 'var(--neg)',
        negSoft: 'var(--neg-soft)',
        warn: 'var(--warn)',
        warnSoft: 'var(--warn-soft)',
        cMat: 'var(--c-mat)',
        cExtra: 'var(--c-extra)',
        cLab: 'var(--c-lab)',
        cProfit: 'var(--c-profit)',
        // Heatcore Solutions logo colours, used on quotes and invoices.
        heat: {
          navy: '#0D2740',
          blue: '#0A5FB4',
          orange: '#F26A0A',
          red: '#D93A0C',
          ink: '#B83A06',
          tint: '#EEF4FB',
        },
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
