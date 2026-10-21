/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0c2348',
        paper: '#ffffff',
        card: '#ffffff',
        line: '#e4ebf5',
        pine: '#1d6fe5',
        clay: '#c43b4e',
        sea: '#1d6fe5',
        mist: '#f4f7fb',
        glow: '#49d6ff',
      },
      fontFamily: {
        sans: ['Manrope', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 40px rgba(12, 35, 72, 0.06)',
      },
    },
  },
  plugins: [],
};
