import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta del prototipo — mantener exacto
        bg:      '#0b1020',
        bg2:     '#121a33',
        card:    '#161f3d',
        line:    '#26315a',
        ink:     '#eaf0ff',
        muted:   '#8b97c4',
        faint:   '#5663a0',
        accent:  '#ff5a36',
        accent2: '#ffb627',
        success: '#3ddc97',
        gold:    '#ffd24a',
        info:    '#4ea8ff',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body:    ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
