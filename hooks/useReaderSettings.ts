'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/** 阅读主题：对应 app/globals.css 的 .reader-theme--* */
export type ReaderTheme = 'dark' | 'sepia' | 'black' | 'green';
/** 阅读栏宽 */
export type ReaderWidth = 'narrow' | 'medium' | 'wide';
/** 正文字族 */
export type ReaderFont = 'serif' | 'sans';

export interface ReaderSettings {
  fontSize: number;      // 14 - 28
  lineHeight: number;    // 1.4 - 2.4
  paragraphSpacing: number; // 0 - 2 (em)
  theme: ReaderTheme;
  width: ReaderWidth;
  font: ReaderFont;
}

export const READER_DEFAULTS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.9,
  paragraphSpacing: 1.0,
  theme: 'dark',
  width: 'medium',
  font: 'serif',
};

export const READER_LIMITS = {
  fontSize: [14, 28] as const,
  lineHeight: [1.4, 2.4] as const,
  paragraphSpacing: [0, 2] as const,
};

const STORAGE_KEY = 'inkstream:reader-settings:v1';

export const WIDTH_MAX: Record<ReaderWidth, string> = {
  narrow: '38rem',
  medium: '48rem',
  wide: '64rem',
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function normalize(raw: unknown): ReaderSettings {
  const src = (raw ?? {}) as Partial<ReaderSettings>;
  const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return {
    fontSize: clamp(Number(src.fontSize) || READER_DEFAULTS.fontSize, ...READER_LIMITS.fontSize),
    lineHeight: clamp(Number(src.lineHeight) || READER_DEFAULTS.lineHeight, ...READER_LIMITS.lineHeight),
    paragraphSpacing: clamp(
      Number.isFinite(src.paragraphSpacing) ? Number(src.paragraphSpacing) : READER_DEFAULTS.paragraphSpacing,
      ...READER_LIMITS.paragraphSpacing,
    ),
    theme: pick<ReaderTheme>(src.theme, ['dark', 'sepia', 'black', 'green'], READER_DEFAULTS.theme),
    width: pick<ReaderWidth>(src.width, ['narrow', 'medium', 'wide'], READER_DEFAULTS.width),
    font: pick<ReaderFont>(src.font, ['serif', 'sans'], READER_DEFAULTS.font),
  };
}

/**
 * 阅读设置：state + localStorage 持久化 + 键盘/滑动手势。
 * SSR 安全：首帧用默认值，mount 后再读 localStorage，避免 hydration mismatch。
 */
export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(READER_DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings(normalize(JSON.parse(raw)));
    } catch {
      /* 隐私模式 / 脏数据：静默回落默认值 */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* 配额满：不影响阅读 */
    }
  }, [settings, hydrated]);

  const update = useCallback(<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings(prev => normalize({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(READER_DEFAULTS), []);

  /** 由 settings 推出的 CSS 变量，直接挂到阅读容器 style 上 */
  const cssVars = useMemo<React.CSSProperties>(() => ({
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': String(settings.lineHeight),
    '--reader-para-spacing': `${settings.paragraphSpacing}em`,
    '--reader-max-width': WIDTH_MAX[settings.width],
    '--reader-font-family': settings.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
  }) as React.CSSProperties, [settings]);

  return { settings, update, reset, cssVars, hydrated };
}

/** 阅读进度：0-100，基于滚动位置，节流到 rAF */
export function useReadingProgress(containerRef: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;

    const compute = () => {
      raf = 0;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max <= 0 ? 100 : clamp((el.scrollTop / max) * 100, 0, 100));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };

    compute();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return progress;
}

export { STORAGE_KEY as READER_STORAGE_KEY };
