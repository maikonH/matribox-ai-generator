/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { 900: '#08090c', 800: '#0d0f14', 700: '#14171f', 600: '#1b1f29', 500: '#232838' },
        surface: { DEFAULT: '#14171f', light: '#1b1f29', lighter: '#232838' },
        border: { DEFAULT: '#232838', light: '#2d3344' },
        primary: { 50: '#eefcff', 100: '#d3f8ff', 200: '#aaf0ff', 300: '#6ee4ff', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63' },
        accent: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
        success: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' },
        warning: { 400: '#fbbf24', 500: '#f59e0b' },
        error: { 400: '#f87171', 500: '#ef4444', 600: '#dc2626' },
        muted: '#8b93a7', subtext: '#6b7280'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      spacing: { '18': '4.5rem' },
      boxShadow: {
        glow: '0 0 20px -4px rgba(34, 197, 94, 0.4)',
        'glow-lg': '0 0 40px -8px rgba(34, 197, 94, 0.5)',
        card: '0 2px 8px -2px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)'
      },
      animation: { 'fade-in': 'fadeIn 0.3s ease-out', 'slide-up': 'slideUp 0.4s ease-out' },
    }
  },
  plugins: [],
};
