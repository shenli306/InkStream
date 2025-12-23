import React, { useEffect, useState } from 'react';
import { AppState } from '../types';

interface CuteProgressProps {
    state: AppState;
    progress: number;
    message: string;
}

const KAOMOJI = {
    [AppState.ANALYZING]: ['( ◕ 💧 ◕ )', '(◕ ᴥ ◕)', '(｡•́︿•̀｡)', '(o_ _)o'],
    [AppState.DOWNLOADING]: ['( 🏃 💨 )', '(ง •̀_•́)ง', '( ᕦ ᕤ )', '(>_<)'],
    [AppState.PARSING]: ['( ✂️ ヮ ✂️ )', '( 📖 ヮ 📖 )', '( 🤓 )', '(・_・)'],
    [AppState.PACKING]: ['( 🎁 ヮ 🎁 )', '(つ ✨ ヮ ✨ )つ', '( 📦 )', '(ﾉ^ヮ^)ﾉ*:･ﾟ✧'],
    default: ['(・ω・)', '(◕‿◕)', '(｡･ω･｡)']
};

const COLORS = {
    [AppState.ANALYZING]: 'text-cyan-400',
    [AppState.DOWNLOADING]: 'text-emerald-400',
    [AppState.PARSING]: 'text-amber-400',
    [AppState.PACKING]: 'text-pink-400',
    default: 'text-white'
};

export const CuteProgress: React.FC<CuteProgressProps> = ({ state, progress, message }) => {
    const [emojiIndex, setEmojiIndex] = useState(0);
    const [bounce, setBounce] = useState(false);

    useEffect(() => {
        // Rotate emojis every 1.5s
        const interval = setInterval(() => {
            setEmojiIndex(prev => prev + 1);
            setBounce(true);
            setTimeout(() => setBounce(false), 500);
        }, 1500);
        return () => clearInterval(interval);
    }, [state]);

    const getKaomoji = () => {
        const list = KAOMOJI[state as keyof typeof KAOMOJI] || KAOMOJI.default;
        return list[emojiIndex % list.length];
    };

    const getColor = () => COLORS[state as keyof typeof COLORS] || COLORS.default;

    return (
        <div className="w-full bg-black/40 backdrop-blur-md py-6 px-8 rounded-3xl flex flex-col items-center justify-center border border-white/10 shadow-2xl overflow-hidden relative group">

            {/* Dynamic Background Glow */}
            <div className={`absolute inset-0 opacity-20 transition-colors duration-500 bg-gradient-to-r ${state === AppState.DOWNLOADING ? 'from-emerald-500/0 via-emerald-500 to-emerald-500/0' :
                    state === AppState.PACKING ? 'from-pink-500/0 via-pink-500 to-pink-500/0' :
                        'from-indigo-500/0 via-indigo-500 to-indigo-500/0'
                } translate-x-[-100%] group-hover:translate-x-[100%] animate-[shimmer_3s_infinite]`}></div>

            {/* Kaomoji Container */}
            <div className={`text-5xl md:text-6xl mb-4 font-black transition-all duration-300 ${getColor()} ${bounce ? 'scale-125 -translate-y-2' : 'scale-100'}`}>
                {getKaomoji()}
            </div>

            {/* State Text */}
            <div className="flex flex-col items-center gap-1 z-10">
                <span className={`text-base font-bold tracking-widest uppercase ${getColor()} mb-1`}>
                    {state === AppState.ANALYZING && "Checking..."}
                    {state === AppState.DOWNLOADING && "Downloading..."}
                    {state === AppState.PARSING && "Processing..."}
                    {state === AppState.PACKING && "Packaging..."}
                </span>
                <span className="text-xs text-white/60 font-medium max-w-[200px] truncate text-center">
                    {message}
                </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-[200px] h-3 bg-white/10 rounded-full mt-4 overflow-hidden relative border border-white/5">
                <div
                    className={`h-full rounded-full transition-all duration-300 relative overflow-hidden ${state === AppState.PACKING ? 'bg-gradient-to-r from-pink-500 to-rose-500' :
                            state === AppState.DOWNLOADING ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                                'bg-gradient-to-r from-indigo-500 to-purple-500'
                        }`}
                    style={{ width: `${progress}%` }}
                >
                    <div className="absolute inset-0 bg-white/30 w-full h-full animate-[shimmer_1s_infinite] translate-x-[-100%]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}></div>
                </div>
            </div>

            {/* Percentage */}
            <span className="mt-2 text-xs font-mono text-white/40">
                {progress}%
            </span>

            {/* Floating Particles (Simple CSS circles) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className={`absolute rounded-full opacity-40 animate-pulse ${getColor().replace('text-', 'bg-')}`}
                        style={{
                            width: Math.random() * 10 + 4 + 'px',
                            height: Math.random() * 10 + 4 + 'px',
                            top: Math.random() * 100 + '%',
                            left: Math.random() * 100 + '%',
                            animationDuration: Math.random() * 2 + 1 + 's',
                            animationDelay: Math.random() + 's'
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
