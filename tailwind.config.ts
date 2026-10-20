import type { Config } from "tailwindcss";

// 颜色工具：把通道型设计令牌接进 Tailwind。
// 不透明色走 <alpha-value>，bg-accent/30 这类修饰符才真正生成；
// 自带 alpha 的语义色（text-* / border-*）不能走 <alpha-value>：
// 一旦用函数式颜色，Tailwind 会强制塞 var(--tw-text-opacity, 1) 把基准 alpha 抹成 1，
// 所以这类直接拼通道 + 基准 alpha，改透明度请改 --x-alpha。
const channel = (rgbVar: string): string => `rgb(var(${rgbVar}) / <alpha-value>)`;
const tokenAlpha = (name: string): string =>
  `rgb(var(--${name}-rgb) / var(--${name}-alpha))`;

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./App.tsx",
  ],
  theme: {
    extend: {
      // 字体族接到设计令牌（app/tokens.css），这样 font-sans / font-serif 才真正生效
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        // 中文排版刻度：行高比 Tailwind 默认更松，大标题更紧
        "display": ["var(--text-display)", { lineHeight: "0.96", letterSpacing: "-0.035em" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "1.28", letterSpacing: "-0.015em" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.32" }],
        "xl": ["var(--text-xl)", { lineHeight: "1.45" }],
        "lg": ["var(--text-lg)", { lineHeight: "1.6" }],
        "base": ["var(--text-base)", { lineHeight: "1.65" }],
        "sm": ["var(--text-sm)", { lineHeight: "1.55" }],
        "xs": ["var(--text-xs)", { lineHeight: "1.45" }],
        "2xs": ["var(--text-2xs)", { lineHeight: "1.4" }],
      },
      colors: {
        // 语义色：bg-ink / bg-raised / text-content-primary 这类写法直接可用
        // 注意：不要用 base 作键名 —— Tailwind 会把它同时当成 from/via/to 的渐变停止位
        //
        // 两种接法，别混用：
        //   channel()   不透明色 → /10 这类修饰符直接生成
        //   tokenAlpha() 自带 alpha 的色（text-*、border-*）→ 用基准 alpha，不带修饰符
        // 以前直接写 var(--x)（整色），Tailwind 无法塞 alpha → 15 个 xx/50 类名被静默丢弃。
        ink: channel("--bg-base-rgb"),
        raised: channel("--bg-raised-rgb"),
        elevated: channel("--bg-elevated-rgb"),
        hover: channel("--bg-hover-rgb"),
        accent: {
          DEFAULT: channel("--accent-rgb"),
          hover: channel("--accent-hover-rgb"),
          soft: "var(--accent-soft)",
          border: "var(--accent-border)",
        },
        highlight: {
          DEFAULT: channel("--highlight-rgb"),
          hover: channel("--highlight-hover-rgb"),
          soft: "var(--highlight-soft)",
          border: "var(--highlight-border)",
        },
        content: {
          primary: tokenAlpha("text-primary"),
          secondary: tokenAlpha("text-secondary"),
          tertiary: tokenAlpha("text-tertiary"),
          disabled: tokenAlpha("text-disabled"),
          inverse: channel("--text-inverse-rgb"),
        },
        state: {
          success: channel("--state-success-rgb"),
          warning: channel("--state-warning-rgb"),
          danger: channel("--state-danger-rgb"),
          info: channel("--state-info-rgb"),
        },
      },
      borderColor: {
        faint: tokenAlpha("border-faint"),
        subtle: tokenAlpha("border-subtle"),
        strong: tokenAlpha("border-strong"),
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
        overlay: "var(--shadow-overlay)",
      },
      maxWidth: {
        page: "var(--page-max)",
        content: "var(--content-max)",
        reading: "var(--reading-max)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        decelerate: "var(--ease-decelerate)",
        accelerate: "var(--ease-accelerate)",
        spring: "var(--ease-spring)",
        smooth: "var(--ease-smooth)",
      },
      transitionDuration: {
        instant: "var(--dur-instant)",
        fast: "var(--dur-fast)",
        normal: "var(--dur-normal)",
        slow: "var(--dur-slow)",
        entrance: "var(--dur-entrance)",
      },
    },
  },
  plugins: [],
} satisfies Config;
