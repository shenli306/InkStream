'use client';

import React from 'react';
import { Minus, Plus, RotateCcw, Type, Sun, AlignJustify, Palette } from 'lucide-react';
import {
  ReaderSettings, ReaderTheme, ReaderWidth, ReaderFont,
  READER_LIMITS, useReaderSettings,
} from '../hooks/useReaderSettings';

interface ReaderSettingsPanelProps {
  settings: ReaderSettings;
  update: ReturnType<typeof useReaderSettings>['update'];
  reset: () => void;
  onClose: () => void;
}

const THEMES: { id: ReaderTheme; label: string; swatch: string; ring: string }[] = [
  { id: 'dark',  label: '暗色', swatch: '#1a1d23', ring: '#8b9dc3' },
  { id: 'sepia', label: '纸黄', swatch: '#f4ecd8', ring: '#a3763f' },
  { id: 'black', label: '纯黑', swatch: '#000000', ring: '#6b7280' },
  { id: 'green', label: '护眼', swatch: '#c9e4c5', ring: '#3f7a4a' },
];

const WIDTHS: { id: ReaderWidth; label: string }[] = [
  { id: 'narrow', label: '窄' },
  { id: 'medium', label: '中' },
  { id: 'wide',   label: '宽' },
];

const FONTS: { id: ReaderFont; label: string; sample: string }[] = [
  { id: 'serif', label: '衬线', sample: '宋' },
  { id: 'sans',  label: '无衬线', sample: '黑' },
];

function Stepper({
  value, min, max, step, unit, onChange, ariaLabel,
}: {
  value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void; ariaLabel: string;
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(2)));
  return (
    <div className="flex items-center gap-1 surface-elevated rounded-sm p-1" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="w-7 h-7 flex items-center justify-center rounded-xs text-content-secondary hover:bg-hover hover:text-content-primary disabled:opacity-30 transition-colors"
        aria-label={`${ariaLabel} 减小`}
      >
        <Minus size={14} />
      </button>
      <span className="min-w-[3.5rem] text-center text-xs font-mono tabular-nums text-content-primary">
        {value}{unit}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        className="w-7 h-7 flex items-center justify-center rounded-xs text-content-secondary hover:bg-hover hover:text-content-primary disabled:opacity-30 transition-colors"
        aria-label={`${ariaLabel} 增大`}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-xs text-content-secondary shrink-0">
        <span className="text-content-tertiary">{icon}</span>
        {label}
      </span>
      {children}
    </div>
  );
}

export const ReaderSettingsPanel: React.FC<ReaderSettingsPanelProps> = ({ settings, update, reset, onClose }) => {
  return (
    <div
      className="reader-settings-panel animate-scale-in"
      role="dialog"
      aria-label="阅读设置"
      aria-modal="false"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-content-primary">阅读设置</h3>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 text-[11px] text-content-tertiary hover:text-accent transition-colors"
        >
          <RotateCcw size={11} /> 恢复默认
        </button>
      </div>

      <div className="divide-y divide-[color:var(--border-faint)]">
        <Row icon={<Type size={13} />} label="字号">
          <Stepper
            value={settings.fontSize} min={READER_LIMITS.fontSize[0]} max={READER_LIMITS.fontSize[1]}
            step={1} unit="px" ariaLabel="字号"
            onChange={v => update('fontSize', v)}
          />
        </Row>

        <Row icon={<AlignJustify size={13} />} label="行距">
          <Stepper
            value={settings.lineHeight} min={READER_LIMITS.lineHeight[0]} max={READER_LIMITS.lineHeight[1]}
            step={0.1} unit="" ariaLabel="行距"
            onChange={v => update('lineHeight', v)}
          />
        </Row>

        <Row icon={<AlignJustify size={13} />} label="段距">
          <Stepper
            value={settings.paragraphSpacing} min={READER_LIMITS.paragraphSpacing[0]} max={READER_LIMITS.paragraphSpacing[1]}
            step={0.25} unit="em" ariaLabel="段距"
            onChange={v => update('paragraphSpacing', v)}
          />
        </Row>

        <Row icon={<Palette size={13} />} label="主题">
          <div className="flex items-center gap-1.5">
            {THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => update('theme', t.id)}
                className="w-7 h-7 rounded-full border transition-all"
                style={{
                  background: t.swatch,
                  borderColor: settings.theme === t.id ? t.ring : 'var(--border-faint)',
                  boxShadow: settings.theme === t.id ? `0 0 0 2px ${t.ring}55` : 'none',
                  transform: settings.theme === t.id ? 'scale(1.08)' : 'scale(1)',
                }}
                title={t.label}
                aria-label={`主题：${t.label}`}
                aria-pressed={settings.theme === t.id}
              />
            ))}
          </div>
        </Row>

        <Row icon={<Sun size={13} />} label="栏宽">
          <div className="inline-flex surface-elevated rounded-sm p-0.5" role="group" aria-label="栏宽">
            {WIDTHS.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => update('width', w.id)}
                className={`px-2.5 py-1 text-[11px] rounded-xs transition-colors ${
                  settings.width === w.id
                    ? 'bg-accent text-content-inverse font-medium'
                    : 'text-content-tertiary hover:text-content-primary'
                }`}
                aria-pressed={settings.width === w.id}
              >
                {w.label}
              </button>
            ))}
          </div>
        </Row>

        <Row icon={<Type size={13} />} label="字族">
          <div className="inline-flex surface-elevated rounded-sm p-0.5" role="group" aria-label="字族">
            {FONTS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => update('font', f.id)}
                className={`px-2.5 py-1 text-[11px] rounded-xs transition-colors ${
                  settings.font === f.id
                    ? 'bg-accent text-content-inverse font-medium'
                    : 'text-content-tertiary hover:text-content-primary'
                }`}
                style={{ fontFamily: f.id === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)' }}
                aria-pressed={settings.font === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <p className="mt-2 text-[10px] text-content-disabled leading-relaxed">
        快捷键：← → 翻章 · 空格/PageDown 下翻 · Esc 关闭设置或退出阅读
      </p>
    </div>
  );
};
