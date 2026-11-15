/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontSize: {
        // Elder-first: base body text ≥ 18px (WCAG AA large text threshold)
        base: ['1.125rem', { lineHeight: '1.75rem' }], // 18px
        lg:   ['1.25rem',  { lineHeight: '1.875rem' }],
        xl:   ['1.5rem',   { lineHeight: '2rem' }],
      },
      minHeight: {
        touch: '48px', // minimum touch target (elder-accessible-ui)
      },
      minWidth: {
        touch: '48px',
      },
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
};
