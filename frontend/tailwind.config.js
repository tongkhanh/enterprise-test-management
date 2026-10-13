/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#f6f7fb', foreground: '#171829', border: '#e5e7ef',
        primary: { DEFAULT: '#5b4ef2', foreground: '#ffffff', 50: '#f2f1ff', 100: '#e8e5ff', 700: '#4739d8' },
        muted: { DEFAULT: '#f1f2f6', foreground: '#6d7184' },
        danger: { DEFAULT: '#dc3f4f', 50: '#fff1f2' },
      },
      boxShadow: { panel: '0 1px 2px rgba(22, 24, 41, .04), 0 12px 32px rgba(41, 35, 90, .06)' },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
