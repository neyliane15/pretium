import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

/** Cor a partir de CSS variable em canais RGB, com suporte a opacidade. */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2') },
        sunken: v('sunken'),
        overlay: v('overlay'),
        border: { DEFAULT: v('border'), strong: v('border-strong') },
        grid: v('grid'),
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle'), inverse: v('fg-inverse') },
        brand: v('brand'),
        primary: { DEFAULT: v('primary'), hover: v('primary-hover'), fg: v('primary-fg'), soft: v('primary-soft') },
        accent: { DEFAULT: v('accent'), fg: v('accent-fg'), soft: v('accent-soft') },
        petrol: { DEFAULT: v('petrol'), 2: v('petrol-2') },
        graphite: v('graphite'),
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        ring: v('ring'),
        tooltip: { DEFAULT: v('tooltip'), fg: v('tooltip-fg'), border: v('tooltip-border') },
        sidebar: {
          DEFAULT: v('sidebar'),
          2: v('sidebar-2'),
          fg: v('sidebar-fg'),
          muted: v('sidebar-muted'),
          border: v('sidebar-border'),
        },
        chart: {
          1: v('chart-1'), 2: v('chart-2'), 3: v('chart-3'),
          4: v('chart-4'), 5: v('chart-5'), 6: v('chart-6'),
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['"Space Grotesk"', 'Inter', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },
      // Escala em px absolutos (html = 13px). Ver docs/DESIGN.md §2.
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['12px', { lineHeight: '18px' }],
        base: ['13px', { lineHeight: '20px' }],
        md: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '26px' }],
        '2xl': ['22px', { lineHeight: '30px' }],
        '3xl': ['28px', { lineHeight: '36px' }],
      },
      borderRadius: {
        none: '0',
        xs: '2px',
        sm: '3px',
        DEFAULT: '4px',
        md: '5px',
        lg: '8px',
        full: '9999px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        none: 'none',
      },
      spacing: {
        '4.5': '18px',
        topbar: '48px',
        sidebar: '232px',
        'sidebar-collapsed': '56px',
      },
      height: { control: '30px', 'control-sm': '24px', 'control-lg': '36px', row: '28px' },
      width: { control: '30px', 'control-sm': '24px', 'control-lg': '36px' },
      minWidth: { control: '30px' },
      borderColor: { DEFAULT: v('border') },
      ringColor: { DEFAULT: v('ring') },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.98) translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'drawer-in': { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        progress: { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '16px 0' } },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'scale-in': 'scale-in 140ms cubic-bezier(.2,.8,.2,1)',
        'slide-in': 'slide-in 160ms cubic-bezier(.2,.8,.2,1)',
        'drawer-in': 'drawer-in 180ms cubic-bezier(.2,.8,.2,1)',
        progress: 'progress 600ms linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
