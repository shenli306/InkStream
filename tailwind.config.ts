import type { Config } from "tailwindcss";

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
        "ink": "var(--bg-base)",
        "raised": "var(--bg-raised)",
        "elevated": "var(--bg-elevated)",
        "hover": "var(--bg-hover)",
        "accent": {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          border: "var(--accent-border)",
        },
        "highlight": {
          DEFAULT: "var(--highlight)",
          hover: "var(--highlight-hover)",
          soft: "var(--highlight-soft)",
          border: "var(--highlight-border)",
        },
        "content": {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          disabled: "var(--text-disabled)",
          inverse: "var(--text-inverse)",
        },
        "state": {
          success: "var(--state-success)",
          warning: "var(--state-warning)",
          danger: "var(--state-danger)",
          info: "var(--state-info)",
        },
      },
      borderColor: {
        faint: "var(--border-faint)",
        subtle: "var(--border-subtle)",
        strong: "var(--border-strong)",
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
