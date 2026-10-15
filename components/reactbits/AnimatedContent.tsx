'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * AnimatedContent —— 内容进场/退场编排喵~
 *
 * 移植自 react-bits (DavidHDev/react-bits, MIT) 的 AnimatedContent 思路。
 * 原版依赖 framer-motion 做 stagger + spring；这里用 IntersectionObserver
 * 触发 + CSS 变量延迟，保持零依赖。
 *
 * 行为：子节点挂载后按 index * stagger 依次淡入上浮；
 * appear 的 direction 决定从哪个方向来。
 */

type Direction = 'up' | 'down' | 'left' | 'right';

interface AnimatedContentProps {
  children: React.ReactNode;
  className?: string;
  /** 每项之间的延迟 ms */
  stagger?: number;
  /** 起始偏移距离 px */
  distance?: number;
  direction?: Direction;
  /** 是否在挂载时立即播放（否则等滚进视口） */
  immediate?: boolean;
  style?: React.CSSProperties;
}

const OFFSET: Record<Direction, [number, number]> = {
  up: [0, 1],
  down: [0, -1],
  left: [1, 0],
  right: [-1, 0],
};

export const AnimatedContent: React.FC<AnimatedContentProps> = ({
  children,
  className = '',
  stagger = 40,
  distance = 18,
  direction = 'up',
  immediate = true,
  style,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (immediate) {
      // 下一帧再置为可见，确保初始样式已渲染，过渡才会触发喵~
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [immediate]);

  const [dx, dy] = OFFSET[direction];

  return (
    <div
      ref={ref}
      className={`animated-content ${visible ? 'animated-content--visible' : ''} ${className}`}
      style={
        {
          '--ac-stagger': `${stagger}ms`,
          '--ac-distance': `${distance}px`,
          '--ac-dx': dx,
          '--ac-dy': dy,
          ...style,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
};

export default AnimatedContent;
