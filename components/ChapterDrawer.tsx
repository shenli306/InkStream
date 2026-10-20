'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ListOrdered } from 'lucide-react';
import { Chapter } from '../types';

interface ChapterDrawerProps {
  open: boolean;
  chapters: Chapter[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  bookTitle: string;
}

export const ChapterDrawer: React.FC<ChapterDrawerProps> = ({
  open, chapters, activeIndex, onSelect, onClose, bookTitle,
}) => {
  const [q, setQ] = useState('');
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return chapters.map((c, i) => ({ c, i }));
    return chapters
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.title.toLowerCase().includes(kw));
  }, [chapters, q]);

  useEffect(() => {
    if (!open) return;
    // 打开后定位当前章
    const t = window.setTimeout(() => activeRef.current?.scrollIntoView({ block: 'center' }), 60);
    return () => window.clearTimeout(t);
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] surface-scrim backdrop-blur-[2px] animate-overlay-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="chapter-drawer animate-drawer-in"
        role="dialog"
        aria-label="目录"
        aria-modal="true"
      >
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-faint shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ListOrdered size={15} className="text-accent shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-content-primary truncate">{bookTitle}</p>
              <p className="text-[11px] text-content-tertiary">
                共 {chapters.length} 章 · 当前 {activeIndex + 1}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-sm text-content-tertiary hover:bg-hover hover:text-content-primary transition-colors shrink-0"
            aria-label="关闭目录"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 surface-elevated rounded-sm px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-accent/40">
            <Search size={13} className="text-content-tertiary shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜索章节标题…"
              className="bg-transparent outline-none text-xs text-content-primary placeholder:text-content-disabled w-full"
              aria-label="搜索章节"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="清空搜索" className="text-content-disabled hover:text-content-primary">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-content-disabled py-8">没有匹配的章节</p>
          ) : (
            filtered.map(({ c, i }) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={`${c.url}-${i}`}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => { onSelect(i); onClose(); }}
                  className={`w-full text-left px-3 py-2 rounded-sm text-xs transition-colors flex items-start gap-2 ${
                    isActive
                      ? 'bg-accent-soft text-accent font-medium border border-accent-border'
                      : 'text-content-secondary hover:bg-hover hover:text-content-primary border border-transparent'
                  }`}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="font-mono text-[10px] text-content-disabled tabular-nums shrink-0 w-7 text-right pt-0.5">
                    {i + 1}
                  </span>
                  <span className="line-clamp-2 leading-snug">{c.title}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
