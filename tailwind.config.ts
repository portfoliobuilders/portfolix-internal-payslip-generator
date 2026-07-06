import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './store/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 60/30/10 design tokens
        paper: '#FFFFFF',
        surface: '#F8F9FA',
        ink: '#131A24',
        muted: '#6B7280',
        hairline: '#E5E7EB',
        emerald: {
          brand: '#059669',
          deep: '#065F46',
          tint: '#ECFDF5',
        },
        amber: {
          brand: '#B45309',
          tint: '#FFFBEB',
          edge: '#FCD34D',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
