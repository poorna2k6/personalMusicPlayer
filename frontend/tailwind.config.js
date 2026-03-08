/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50:  'var(--s50)',
          100: 'var(--s100)',
          200: 'var(--s200)',
          300: 'var(--s300)',
          400: 'var(--s400)',
          500: 'var(--s500)',
          600: 'var(--s600)',
          700: 'var(--s700)',
          800: 'var(--s800)',
          900: 'var(--s900)',
          950: 'var(--s950)',
        },
      },
    },
  },
  plugins: [],
};
