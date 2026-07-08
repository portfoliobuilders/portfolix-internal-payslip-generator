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
          600: '#059669',
          brand: '#059669',
          deep: '#065F46',
          tint: '#ECFDF5',
        },
        amber: {
          600: '#D97706',
          brand: '#D97706',
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
      // Additive refinements — soft, ink-tinted depth for a premium feel.
      // Existing tokens above are untouched.
      boxShadow: {
        card: '0 1px 2px 0 rgb(19 26 36 / 0.03), 0 1px 3px 0 rgb(19 26 36 / 0.05)',
        'card-hover':
          '0 2px 6px -1px rgb(19 26 36 / 0.08), 0 6px 16px -6px rgb(19 26 36 / 0.06)',
        pop: '0 10px 30px -8px rgb(19 26 36 / 0.16), 0 4px 12px -6px rgb(19 26 36 / 0.10)',
        focus: '0 0 0 3px rgb(19 26 36 / 0.12)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
