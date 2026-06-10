import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta accesible (propuesta B: alto contraste oscuro)
        bg:      '#080e1c',
        bg2:     '#0f1628',
        card:    '#141d38',
        line:    '#2a3860',
        ink:     '#f4f8ff',
        muted:   '#b8c4e8',
        faint:   '#8090c8',
        accent:  '#ff6040',
        accent2: '#ffc030',
        success: '#44ee9f',
        gold:    '#ffd84a',
        info:    '#5fb5ff',
      },
      // Texto 1px más grande en los tamaños pequeños (legibilidad / presbicia)
      fontSize: {
        xs:   ['0.8125rem', { lineHeight: '1rem' }],     // 13px
        sm:   ['0.9375rem', { lineHeight: '1.25rem' }],  // 15px
        base: ['1.0625rem', { lineHeight: '1.5rem' }],   // 17px
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body:    ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
