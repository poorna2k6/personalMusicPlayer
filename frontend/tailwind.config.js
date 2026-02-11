/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Spotify-inspired palette
        'sp-black': '#121212',
        'sp-dark': '#181818',
        'sp-card': '#282828',
        'sp-hover': '#3E3E3E',
        'sp-green': '#1DB954',
        'sp-green-dark': '#1aa34a',
        'sp-text': '#FFFFFF',
        'sp-muted': '#A7A7A7',
        'sp-subtle': '#535353',
        'sp-border': '#333333',
      },
      fontFamily: {
        sans: ['Circular', 'DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
