'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, Loader2, List, Settings2, ArrowUpToLine,
} from 'lucide-react';
import { Chapter } from '../types';
import { useReaderSettings, useReadingProgress } from '../hooks/useReaderSettings';
import { ReaderSettingsPanel } from './ReaderSettingsPanel';
import { ChapterDrawer } from './ChapterDrawer';

interface ReaderProps {
  title: string;
  chapter: Chapter | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  isLoading: boolean;
  /** 全书章节，供目录抽屉使用；不传则隐藏目录按钮 */
  chapters?: Chapter[];
  currentIndex?: number;
  onJumpTo?: (index: number) => void;
}

/** 把纯文本正文切成段落：兼容 \n\n、\r\n、全角空格缩进、连续空行 */
function splitParagraphs(raw: string): string[] {
  if (!raw) return [];
  return raw
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}|\u3000{2,}/g)
    .flatMap(chunk => chunk.split('\n'))
    .map(s => s.replace(/^[\s\u3000]+/, '').trim())
    .filter(s => s.length > 0);
}

export const Reader: React.FC<ReaderProps> = ({
  title, chapter, onClose, onNext, onPrev, hasPrev, hasNext, isLoading,
  chapters, currentIndex = 0, onJumpTo,
}) => {
  const { settings, update, reset, cssVars } = useReaderSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const progress = useReadingProgress(scrollRef, [chapter?.url, isLoading]);

  // 换章回到顶部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setShowDrawer(false);
  }, [chapter?.url]);

  const paragraphs = useMemo(() => splitParagraphs(chapter?.content ?? ''), [chapter?.content]);

  // 键盘
  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case 'Escape':
        if (showSettings) { setShowSettings(false); }
        else if (showDrawer) { setShowDrawer(false); }
        else { onClose(); }
        break;
      case 'ArrowLeft':
        e.preventDefault(); if (hasPrev && !isLoading) onPrev(); break;
      case 'ArrowRight':
        e.preventDefault(); if (hasNext && !isLoading) onNext(); break;
      case ' ':
      case 'PageDown': {
        e.preventDefault();
        const el = scrollRef.current;
        if (el) el.scrollBy({ top: el.clientHeight * 0.85, behavior: 'smooth' });
        break;
      }
      case 'PageUp': {
        e.preventDefault();
        const el = scrollRef.current;
        if (el) el.scrollBy({ top: -el.clientHeight * 0.85, behavior: 'smooth' });
        break;
      }
      case 'f': case 'F':
        setShowSettings(v => !v); break;
      case 'c': case 'C':
        if (chapters?.length) setShowDrawer(v => !v); break;
      default: break;
    }
  }, [showSettings, showDrawer, hasPrev, hasNext, isLoading, onPrev, onNext, onClose, chapters?.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // 锁 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!chapter) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 surface-scrim backdrop-blur-sm animate-overlay-in gpu-accelerated"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`reader-shell reader-theme--${settings.theme} relative w-full flex flex-col overflow-hidden animate-modal-in gpu-accelerated`}
        style={cssVars}
      >
        {/* 顶部栏 */}
        <header className="reader-bar h-14 shrink-0 flex items-center justify-between gap-3 px-3 sm:px-6 border-b">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowDrawer(true)}
              disabled={!chapters?.length}
              className="reader-icon-btn"
              aria-label="打开目录"
              title="目录 (C)"
            >
              <List size={18} />
            </button>
          </div>

          <div className="flex flex-col items-center min-w-0 flex-1">
            <h2 className="text-sm font-bold truncate max-w-full reader-title">{title}</h2>
            <span className="text-[11px] truncate max-w-full reader-subtitle">{chapter.title}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSettings(v => !v)}
              className={`reader-icon-btn ${showSettings ? 'reader-icon-btn--active' : ''}`}
              aria-label="阅读设置"
              aria-expanded={showSettings}
              title="阅读设置 (F)"
            >
              <Settings2 size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="reader-icon-btn"
              aria-label="关闭阅读"
              title="关闭 (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* 滚动进度条（顶部细线） */}
        <div className="reader-progress-track shrink-0" aria-hidden="true">
          <div className="reader-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* 正文 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar"
          tabIndex={0}
        >
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 reader-subtitle">
              <Loader2 className="animate-spin" size={40} style={{ color: 'var(--accent)' }} />
              <p className="text-sm tracking-[0.2em]">正在加载…</p>
            </div>
          ) : (
            <article className="reader-article">
              <h1 className="reader-chapter-title">{chapter.title}</h1>
              {paragraphs.length === 0 ? (
                <p className="reader-paragraph reader-paragraph--empty">本章暂无正文内容。</p>
              ) : (
                paragraphs.map((p, i) => (
                  <p key={i} className="reader-paragraph">{p}</p>
                ))
              )}

              <div className="reader-chapter-end">
                <span className="reader-chapter-end__mark">＊ ＊ ＊</span>
                {paragraphs.length > 0 && (
                  <span className="reader-chapter-end__count">{paragraphs.length} 段 · 约 {Math.max(1, Math.round(paragraphs.join('').length / 500))} 千字</span>
                )}
              </div>

              <div className="reader-chapter-nav">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!hasPrev || isLoading}
                  className="reader-nav-btn"
                >
                  <ChevronLeft size={16} /> 上一章
                </button>
                <span className="reader-nav-index">{currentIndex + 1}{chapters?.length ? ` / ${chapters.length}` : ''}</span>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext || isLoading}
                  className="reader-nav-btn"
                >
                  下一章 <ChevronRight size={16} />
                </button>
              </div>
            </article>
          )}
        </div>

        {/* 设置面板 */}
        {showSettings && (
          <div className="absolute top-16 right-3 sm:right-6 z-20">
            <ReaderSettingsPanel
              settings={settings}
              update={update}
              reset={reset}
              onClose={() => setShowSettings(false)}
            />
          </div>
        )}

        {/* 底部浮动控制条 */}
        <div className="reader-dock shrink-0">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev || isLoading}
            className="reader-dock-btn"
            aria-label="上一章"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex flex-col items-center gap-0.5 min-w-0">
            <span className="reader-dock-progress tabular-nums">{Math.round(progress)}%</span>
            <span className="reader-dock-hint">
              {currentIndex + 1}{chapters?.length ? `/${chapters.length}` : ''}
            </span>
          </div>

          <button
            type="button"
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="reader-dock-btn"
            aria-label="回到顶部"
            title="回到顶部"
          >
            <ArrowUpToLine size={18} />
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext || isLoading}
            className="reader-dock-btn"
            aria-label="下一章"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {chapters?.length && onJumpTo ? (
        <ChapterDrawer
          open={showDrawer}
          chapters={chapters}
          activeIndex={currentIndex}
          onSelect={onJumpTo}
          onClose={() => setShowDrawer(false)}
          bookTitle={title}
        />
      ) : null}
    </div>
  );
};
