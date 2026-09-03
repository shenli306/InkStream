import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Trash2, Upload } from 'lucide-react';
import {
  SOURCE_ENABLED_CONFIG,
  importLegadoSources,
  loadLegadoSources,
  loadSourceConfig,
  PROVIDERS,
  removeLegadoSource,
  SOURCE_DESCRIPTIONS,
  setSourceEnabled,
  SOURCE_UNAVAILABLE_REASONS,
} from '../services/source';
import '../source-selector.css';

interface SourceSelectorProps {
  onConfirm: () => void;
  onCancel: () => void;
}

type AnimationPhase = 'entering' | 'open' | 'closing';

const getInitialSources = () => {
  loadSourceConfig();
  const importedNames = new Set(loadLegadoSources().map(source => source.bookSourceName));
  return PROVIDERS.map(provider => ({
    name: provider.name,
    enabled: SOURCE_ENABLED_CONFIG[provider.name] !== false,
    imported: importedNames.has(provider.name),
    unavailableReason: SOURCE_UNAVAILABLE_REASONS[provider.name],
    description: SOURCE_DESCRIPTIONS[provider.name],
  }));
};

const SourceSelectorComponent: React.FC<SourceSelectorProps> = ({ onConfirm, onCancel }) => {
  const [sources, setSources] = useState(getInitialSources);
  const [phase, setPhase] = useState<AnimationPhase>('entering');
  const [importError, setImportError] = useState('');
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPhase('open'));
    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const close = useCallback((callback: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase('closing');
    closeTimerRef.current = window.setTimeout(callback, 280);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(onCancel);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, onCancel]);

  const toggleSource = useCallback((name: string) => {
    setSources(previous => previous.map(source => {
      if (source.name !== name) return source;
      if (source.unavailableReason) return source;
      const enabled = !source.enabled;
      setSourceEnabled(name, enabled);
      return { ...source, enabled };
    }));
  }, []);

  const importSource = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      importLegadoSources(await file.text());
      setSources(getInitialSources());
      setImportError('');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '书源导入失败');
    }
  }, []);

  const removeSource = useCallback((name: string) => {
    removeLegadoSource(name);
    setSources(getInitialSources());
  }, []);

  const isOpen = phase === 'open';
  const isClosing = phase === 'closing';

  return (
    <div
      className={`source-selector source-selector--${phase} relative w-full flex items-center justify-center`}
      aria-label="书源配置"
    >
      <div className="source-selector__ambient" aria-hidden="true" />

      <button
        type="button"
        className="source-selector__confirm"
        onClick={() => close(onConfirm)}
        disabled={isClosing}
        aria-label="确认书源配置"
        title="确认书源配置"
      >
        <span className="source-selector__confirm-core">
          <Check size={22} aria-hidden="true" />
        </span>
      </button>

      <div className="source-selector__rail source-selector__rail--top" aria-hidden="true" />
      <div className="source-selector__rail source-selector__rail--bottom" aria-hidden="true" />

      <div className="source-selector__panel">
        <div className="source-selector__panel-surface">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-indigo-500/20" />
            <h3 className="text-white/60 font-bold text-center text-[10px] uppercase tracking-[0.25em]">
              书源配置
            </h3>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-pink-500/50 to-pink-500/20" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.map((source, index) => (
              <div
                key={source.name}
                className="source-selector__item flex items-center justify-between px-4 py-3.5 rounded-xl border border-white/5 bg-white/[0.04] hover:bg-white/[0.07] hover:border-indigo-500/30"
                style={{ '--source-item-delay': `${Math.min(index * 35, 175)}ms` } as React.CSSProperties}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`source-selector__status ${source.enabled ? 'source-selector__status--enabled' : ''}`} />
                  <span className="min-w-0">
                    <span className="block text-sm text-white/80 truncate">{source.name}</span>
                    {(source.unavailableReason || source.description) && (
                      <span className={`block mt-0.5 text-[10px] truncate ${source.unavailableReason ? 'text-rose-300/75' : 'text-white/35'}`}>
                        {source.unavailableReason || source.description}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {source.imported && (
                    <button
                      type="button"
                      onClick={() => removeSource(source.name)}
                      className="source-selector__remove"
                      aria-label={`删除${source.name}`}
                      title="删除导入书源"
                      disabled={!isOpen}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSource(source.name)}
                    aria-pressed={source.enabled}
                    aria-label={`${source.enabled ? '禁用' : '启用'}${source.name}`}
                    className={`source-selector__toggle ${source.enabled ? 'source-selector__toggle--enabled' : ''}`}
                    disabled={!isOpen || Boolean(source.unavailableReason)}
                  >
                    <span className="source-selector__toggle-knob" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={importSource}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="source-selector__import"
              disabled={!isOpen}
            >
              <Upload size={15} aria-hidden="true" />
              导入阅读书源
            </button>
            <span className="text-xs text-white/40">点击左侧光圈确认</span>
          </div>
          {importError && <p role="alert" className="mt-3 text-center text-xs text-rose-300">{importError}</p>}
        </div>
      </div>
    </div>
  );
};

export const SourceSelector = memo(SourceSelectorComponent);
