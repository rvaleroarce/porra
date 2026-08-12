import type { Config } from 'tailwindcss';

/** Color del tema: se resuelve en tiempo de ejecución desde src/index.css. */
const tema = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Los valores viven en src/index.css, no aquí: es lo que permite que
      // la app cambie de claro a oscuro según lo que tenga el móvil sin
      // recompilar ni duplicar clases.
      colors: {
        bg:      tema('bg'),
        bg2:     tema('bg2'),
        card:    tema('card'),
        line:    tema('line'),
        ink:     tema('ink'),
        muted:   tema('muted'),
        faint:   tema('faint'),
        accent:  tema('accent'),
        accent2: tema('accent2'),
        success: tema('success'),
        gold:    tema('gold'),
        info:    tema('info'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body:    ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
