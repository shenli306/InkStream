'use client';

import React, { useCallback, useRef, useState } from 'react';

/**
 * SpotlightCard —— 光标跟随高光卡片喵~
 *
 * 移植自 react-bits (DavidHDev/react-bits, MIT, ~49k stars) 的 SpotlightCard。
 * 原本用 framer-motion 做光斑运动；这里改成纯 CSS 变量 + rAF，
 * 避免为一个小效果引入整个动画引擎。
 *
 * 用法：
 *   <SpotlightCard className="...">
 *     <div>内容</div>
 *   </SpotlightCard>
 */

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  /** 光斑半径 px，默认 220 */
  spotlightRadius?: number;
  /** 光斑颜色 rgba，默认靛蓝 */
  spotlightColor?: string;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightRadius = 220,
  spotlightColor = 'rgba(99, 102, 241, 0.25)',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    // 用 rAF 合并同一帧内的多次 mousemove，避免布局抖动喵~
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--spotlight-x', `${e.clientX - rect.left}px`);
      card.style.setProperty('--spotlight-y', `${e.clientY - rect.top}px`);
      frameRef.current = null;
    });

    setOpacity(1);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setOpacity(0);
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`spotlight-card ${className}`}
      style={
        {
          '--spotlight-radius': `${spotlightRadius}px`,
          '--spotlight-color': spotlightColor,
          '--spotlight-opacity': opacity,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
};

export default SpotlightCard;
