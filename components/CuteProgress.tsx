import React from 'react';
import { AppState } from '../types';

interface CuteProgressProps {
    state: AppState;
    progress: number;
    message: string;
}

/* 状态强调色（令牌层 app/tokens.css） */
const STATE_TONE: Record<string, string> = {
    [AppState.ANALYZING]: 'state-info',
    [AppState.DOWNLOADING]: 'state-success',
    [AppState.PARSING]: 'state-warning',
    [AppState.PACKING]: 'highlight',
    default: 'content-primary',
};

export const CuteProgress: React.FC<CuteProgressProps> = ({ state, progress, message }) => {
    const tone = STATE_TONE[state] ?? STATE_TONE.default;
    const toneVar = `var(--${tone})`;
    const toneSoft = `var(--${tone}-soft, color-mix(in srgb, var(--${tone}) 18%, transparent))`;

    return (
        <div className="w-full surface-glass-strong py-8 px-8 rounded-lg flex flex-col items-center justify-center shadow-overlay overflow-hidden relative group">

            {/* 动态流光背景 */}
            <div
                className="absolute inset-0 opacity-15 pointer-events-none animate-shimmer-sweep"
                style={{
                    backgroundImage: `linear-gradient(90deg, transparent, ${toneVar}, transparent)`,
                    transition: 'background-image 400ms cubic-bezier(0.4,0,0.2,1)',
                }}
            />

            {/* 加载动画 */}
            <div className="relative w-44 h-44 mb-3 gpu-accelerated transition-transform duration-300 ease-out hover:scale-105">
                <img
                    src="/loading-girl.gif"
                    alt=""
                    aria-hidden="true"
                    className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,182,193,0.35)]"
                />
            </div>

            {/* 状态文字 */}
            <div className="flex flex-col items-center gap-1.5 z-10">
                <span
                    className="text-base font-bold tracking-widest uppercase mb-1 transition-colors duration-500"
                    style={{ color: toneVar }}
                    role="status"
                    aria-live="polite"
                >
                    {state === AppState.ANALYZING && "Checking..."}
                    {state === AppState.DOWNLOADING && "Downloading..."}
                    {state === AppState.PARSING && "Processing..."}
                    {state === AppState.PACKING && "Packaging..."}
                </span>
                <span className="text-xs text-content-tertiary font-medium max-w-[220px] truncate text-center">
                    {message}
                </span>
            </div>

            {/* 进度条 */}
            <div className="w-full max-w-[220px] h-2.5 surface-elevated rounded-pill mt-5 overflow-hidden relative">
                <div
                    className="h-full rounded-pill transition-[width] duration-300 relative overflow-hidden"
                    style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${toneSoft}, ${toneVar})` }}
                    role="progressbar"
                    aria-valuenow={Math.round(progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <div className="absolute inset-0 animate-shimmer-sweep" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }} />
                </div>
            </div>

            {/* 百分比 */}
            <span className="mt-2 text-xs font-mono text-content-disabled tabular-nums">
                {progress}%
            </span>

            {/* 漂浮粒子 */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full opacity-30 animate-pulse"
                        style={{
                            width: Math.random() * 10 + 4 + 'px',
                            height: Math.random() * 10 + 4 + 'px',
                            top: Math.random() * 100 + '%',
                            left: Math.random() * 100 + '%',
                            animationDuration: Math.random() * 2 + 1 + 's',
                            animationDelay: Math.random() + 's',
                            background: toneVar,
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
