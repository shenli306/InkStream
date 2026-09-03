import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';

export interface DanmakuItem {
  id: string;
  text: string;
  top: number; // Percentage 0-100
  duration: number; // Seconds
  startTime: number;
}

interface DanmakuOverlayProps {
  items: DanmakuItem[];
  isAdmin: boolean;
  onDelete: (id: string) => void;
  onAnimationEnd: (id: string) => void;
}

export const DanmakuOverlay: React.FC<DanmakuOverlayProps> = ({ items, isAdmin, onDelete, onAnimationEnd }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[50] overflow-hidden select-none">
      {items.map((item) => (
        <div
          key={item.id}
          className={`absolute whitespace-nowrap font-bold text-2xl tracking-wide transition-colors duration-200 ${
            isAdmin ? 'pointer-events-auto hover:text-red-400 cursor-pointer hover:scale-110' : ''
          }`}
          style={{
            top: `${item.top}%`,
            left: '100%',
            fontFamily: '"SimHei", "Microsoft YaHei", sans-serif',
            willChange: 'transform',
            animation: `danmaku-move ${item.duration}s linear forwards`,
            background: 'linear-gradient(to bottom, #00FFFF, #00BFFF)', // Cyan Gradient
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            // Note: text-shadow usually conflicts with text-fill-color transparent in standard CSS.
            // To keep stroke + gradient, we need a trick or just use filter drop-shadow for outline.
            // Let's use filter for stroke to allow gradient text.
            filter: 'drop-shadow(1px 1px 0 #000) drop-shadow(-1px -1px 0 #000) drop-shadow(1px -1px 0 #000) drop-shadow(-1px 1px 0 #000)',
            textShadow: 'none'
          }}
          onAnimationEnd={() => onAnimationEnd(item.id)}
          onClick={() => isAdmin && onDelete(item.id)}
          title={isAdmin ? "点击删除这条建议喵~" : ""}
        >
          {item.text}
          {isAdmin && <X size={20} className="inline-block ml-2 mb-1 drop-shadow-md" />}
        </div>
      ))}
      <style>{`
        @keyframes danmaku-move {
          from { transform: translateX(0); }
          to { transform: translateX(calc(-100vw - 100%)); }
        }
      `}</style>
    </div>
  );
};
