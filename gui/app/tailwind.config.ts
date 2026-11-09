import plugin from 'tailwindcss/plugin';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import gradient from 'tailwind-gradient-mask-image';
import type { Config } from 'tailwindcss';
import { transform } from 'typescript';

const config = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // `dark:` follows the app, not the OS setting. Every remaining theme is dark.
  darkMode: ['variant', ':root &'],
  theme: {
    screens: {
      'mobile-settings': { raw: 'not (min-width: 900px)' },
      nsmol: { raw: 'not (min-width: 525px)' },
      smol: '525px',
      mobile: { raw: 'not (min-width: 800px)' },
      'xs-settings': '900px',
      xs: '800px',
      nsm: { raw: 'not (min-width: 900px)' },
      sm: '900px',
      md: '1100px',
      nmd: { raw: 'not (min-width: 1100px)' },
      'md-max': { raw: 'not (min-width: 1100px)' },
      lg: '1300px',
      xl: '1600px',
      tall: { raw: '(min-height: 860px)' },
    },
    extend: {
      colors: {
        status: {
          success: 'rgb(var(--success), <alpha-value>)',
          warning: 'rgb(var(--warning), <alpha-value>)',
          critical: 'rgb(var(--critical), <alpha-value>)',
          special: 'rgb(var(--special), <alpha-value>)',
        },
        motion: 'rgb(var(--motion), <alpha-value>)',
        window: {
          icon: 'rgb(var(--window-icon-stroke), <alpha-value>)',
        },
        background: {
          10: 'rgb(var(--background-10), <alpha-value>)',
          20: 'rgb(var(--background-20), <alpha-value>)',
          30: 'rgb(var(--background-30), <alpha-value>)',
          40: 'rgb(var(--background-40), <alpha-value>)',
          50: 'rgb(var(--background-50), <alpha-value>)',
          60: 'rgb(var(--background-60), <alpha-value>)',
          70: 'rgb(var(--background-70), <alpha-value>)',
          80: 'rgb(var(--background-80), <alpha-value>)',
          90: 'rgb(var(--background-90), <alpha-value>)',
        },
        'accent-background': {
          10: 'rgb(var(--accent-background-10), <alpha-value>)',
          20: 'rgb(var(--accent-background-20), <alpha-value>)',
          30: 'rgb(var(--accent-background-30), <alpha-value>)',
          40: 'rgb(var(--accent-background-40), <alpha-value>)',
          50: 'rgb(var(--accent-background-50), <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"SF Pro"',
          'sans-serif',
        ],
        serif: [
          '"Newsreader"',
          '"Tiempos Headline"',
          '"Charter"',
          '"Iowan Old Style"',
          '"Palatino"',
          '"Georgia"',
          'serif',
        ],
      },
      fontSize: {
        DEFAULT: 'calc(var(--font-size-standard) / 16)',
        // 12 / 13 / 15 / 17 / 22 / 28 / 40 px at the default text size (12).
        'ui-2xs': 'calc(var(--font-size) / 12 * 0.75)',
        'ui-xs': 'calc(var(--font-size) / 12 * 0.8125)',
        'ui-sm': 'calc(var(--font-size) / 12 * 0.9375)',
        'ui-md': 'calc(var(--font-size) / 12 * 1.0625)',
        'ui-lg': 'calc(var(--font-size) / 12 * 1.375)',
        'ui-xl': 'calc(var(--font-size) / 12 * 1.75)',
        'ui-hero': 'calc(var(--font-size) / 12 * 2.5)',
      },
      fontWeight: {
        DEFAULT: '400',
      },
      color: {
        DEFAULT: 'rgb(var(--default-color), <alpha-value>)',
      },
      keyframes: {
        bounce: {
          '0%, 100%': {
            transform: 'translateY(0)',
            'animation-timing-function': 'cubic-bezier(0, 0, 0.2, 1)',
          },
          '50%': {
            transform: 'translateY(-25%)',
            'animation-timing-function': 'cubic-bezier(0.8, 0, 1, 1)',
          },
        },
        'timer-tick': {
          '0%, 40%': {
            transform: 'scale(1)',
          },
          '20%': {
            transform: 'scale(1.3)',
          },
        },
        'spin-ccw': {
          '0%': {
            transform: 'rotate(0deg)',
          },
          '100%': {
            transform: 'rotate(-360deg)',
          },
        },
        skiing: {
          '0%, 100%': {
            transform: 'rotate(0deg) translateX(0%) translateY(0%)',
          },
          '10%': {
            transform: 'rotate(12deg) translateX(-5%) translateY(5%)',
          },
          '20%': {
            transform: 'rotate(10deg) translateX(0%) translateY(0%)',
          },
          '30%': {
            transform: 'rotate(12deg) translateX(5%) translateY(-5%)',
          },
          '40%': {
            transform: 'rotate(10deg) translateX(0%) translateY(0%)',
          },
          '50%': {
            transform: 'rotate(12deg) translateX(-5%) translateY(5%)',
          },
          '60%': {
            transform: 'rotate(10deg) translateX(0%) translateY(0%)',
          },
          '70%': {
            transform: 'rotate(12deg) translateX(5%) translateY(-5%)',
          },
          '80%': {
            transform: 'rotate(10deg) translateX(0%) translateY(0%)',
          },
          '90%': {
            transform: 'rotate(10deg) translateX(-5%) translateY(5%)',
          },
        },
      },
      animation: {
        'spin-ccw': 'spin-ccw 1s linear infinite',
        'timer-tick': 'timer-tick 1s linear infinite',
        skiing: 'skiing 1s linear infinite',
      },
      letterSpacing: {
        'mac-caption': '0.015em',
        'mac-subhead': '-0.006em',
        'mac-body': '-0.011em',
        'mac-title3': '-0.014em',
        'mac-title1': '-0.021em',
      },
      borderRadius: {
        'mac-card': '24px',
        'mac-tile': '12px',
        'mac-dock': '18px',
        'mac-control': '9px',
        'mac-inner': '7px',
      },
      transitionTimingFunction: {
        'mac-glide': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
    data: {
      checked: 'checked=true',
    },
  },
  plugins: [
    forms,
    gradient,
    typography,
    plugin(function ({ addUtilities }) {
      const textConfig = (fontSize: any, fontWeight: any) => ({
        fontSize,
        fontWeight,
      });

      addUtilities({
        '.text-main-title': textConfig('calc(var(--font-size-title) / 16)', 700),
        '.text-section-title': textConfig('calc(var(--font-size-vr) / 16)', 600),
        '.text-standard': textConfig('calc(var(--font-size-standard) / 16)', 400),
        '.text-standard-bold': textConfig('calc(var(--font-size-standard) / 16)', 600),
        '.text-description': textConfig('calc(var(--font-size-standard) / 16)', 400),
        '.text-description-light': textConfig(
          'calc(var(--font-size-standard) / 16)',
          300
        ),
        '.text-btn-bold': textConfig('calc(var(--font-size-standard) / 16)', 600),
        '.text-vr-accesible': textConfig('calc(var(--font-size-vr) / 16)', 400),
        '.text-vr-accesible-bold': textConfig('calc(var(--font-size-vr) / 16)', 600),
      });
    }),
    plugin(function ({ addVariant }) {
      addVariant('checked-hover', ['&:hover', '&[data-checked=true]']);
    }),
  ],
} satisfies Config;

export default config;
