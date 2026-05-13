/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'Noto Sans SC', 'sans-serif'],
        display: ['Sora', 'Noto Sans SC', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 24px 80px rgba(15, 23, 42, 0.12)',
        soft: '0 16px 40px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        ink: '#0f172a',
        mist: '#eef4ff',
        sea: '#0f766e',
        sand: '#f8fafc',
        ember: '#f97316',
      },
      animation: {
        drift: 'drift 12s ease-in-out infinite',
        rise: 'rise 0.5s ease-out',
      },
      keyframes: {
        drift: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
