import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  SOURCE_ENABLED_CONFIG,
  loadSourceConfig,
  PROVIDERS,
  SOURCE_DESCRIPTIONS,
  setSourceEnabled,
  SOURCE_UNAVAILABLE_REASONS,
} from '../services/source';
import { SpotlightCard } from './reactbits/SpotlightCard';
import { AnimatedContent } from './reactbits/AnimatedContent';
import { ClickSpark } from './reactbits/ClickSpark';
import '../source-selector.css';
import './reactbits/reactbits.css';

interface SourceSelectorProps {
  onConfirm: () => void;
  onCancel: () => void;
}

type AnimationPhase = 'entering' | 'open' | 'closing';

const getInitialSources = () => {
  loadSourceConfig();
  return PROVIDERS.map(provider => ({
    name: provider.name,
    enabled: SOURCE_ENABLED_CONFIG[provider.name] !== false,
    unavailableReason: SOURCE_UNAVAILABLE_REASONS[provider.name],
    description: SOURCE_DESCRIPTIONS[provider.name],
  }));
};

const SourceSelectorComponent: React.FC<SourceSelectorProps> = ({ onConfirm, onCancel }) => {
  const [sources, setSources] = useState(getInitialSources);
  const [phase, setPhase] = useState<AnimationPhase>('entering');
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

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

  const isOpen = phase === 'open';
  const isClosing = phase === 'closing';

  return (
    <div
      className={`source-selector source-selector--${phase} relative w-full flex items-center justify-center`}
      aria-label="书源配置"
    >
      <div className="source-selector__ambient" aria-hidden="true" />

      <ClickSpark sparkCount={10} sparkRadius={34} sparkColor="#a5b4fc">
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
      </ClickSpark>

      <div className="source-selector__rail source-selector__rail--top" aria-hidden="true" />
      <div className="source-selector__rail source-selector__rail--bottom" aria-hidden="true" />

      <div className="source-selector__panel">
        <div className="source-selector__panel-surface">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-accent/50 to-accent/20" />
            <h3 className="text-content-tertiary font-bold text-center text-[10px] uppercase tracking-[0.25em]">
              书源配置
            </h3>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-highlight/50 to-highlight/20" />
          </div>

          <AnimatedContent
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            stagger={45}
            distance={22}
            direction="up"
          >
            {sources.map((source) => (
              <SpotlightCard
                key={source.name}
                className="source-selector__item flex items-center justify-between px-4 py-3.5 rounded-xl border border-faint surface-elevated hover:border-accent/30 transition-colors"
                spotlightRadius={180}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`source-selector__status ${source.enabled ? 'source-selector__status--enabled' : ''}`} />
                  <span className="min-w-0">
                    <span className="block text-sm text-content-primary truncate">{source.name}</span>
                    {(source.unavailableReason || source.description) && (
                      <span className={`block mt-0.5 text-[10px] truncate ${source.unavailableReason ? 'text-state-danger/75' : 'text-content-tertiary'}`}>
                        {source.unavailableReason || source.description}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
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
              </SpotlightCard>
            ))}
          </AnimatedContent>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs text-content-tertiary">点击左侧光圈确认</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SourceSelector = memo(SourceSelectorComponent);
