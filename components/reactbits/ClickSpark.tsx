'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ClickSpark —— 点击迸发粒子喵~
 *
 * 移植自 react-bits (DavidHDev/react-bits, MIT) 的 ClickSpark。
 * 原版用 canvas；这里用 DOM + CSS keyframes，避免 canvas 生命周期管理。
 *
 * 用于「确认书源」按钮：点击时迸出一圈火花，作为动作完成反馈。
 */

interface Spark {
  id: number;
  /** 视口坐标，配合 position:fixed 使用喵~ */
  pageX: number;
  pageY: number;
  angle: number;
}

interface ClickSparkProps {
  children: React.ReactNode;
  /** 每次迸发的火花数 */
  sparkCount?: number;
  /** 火花飞行距离 px */
  sparkRadius?: number;
  /** 火花颜色 */
  sparkColor?: string;
  className?: string;
  disabled?: boolean;
}

export const ClickSpark: React.FC<ClickSparkProps> = ({
  children,
  sparkCount = 8,
  sparkRadius = 28,
  sparkColor = '#818cf8',
  className = '',
  disabled = false,
}) => {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const nextId = useRef(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(id => window.clearTimeout(id));
    };
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (disabled) return;
      const base = nextId.current;
      nextId.current += sparkCount;

      const batch: Spark[] = Array.from({ length: sparkCount }, (_, i) => ({
        id: base + i,
        pageX: e.clientX,
        pageY: e.clientY,
        angle: (360 / sparkCount) * i,
      }));

      setSparks(prev => [...prev, ...batch]);

      // 动画结束后回收这一批火花喵~
      const timer = window.setTimeout(() => {
        setSparks(prev => prev.filter(s => !batch.some(b => b.id === s.id)));
      }, 640);
      timersRef.current.push(timer);
    },
    [disabled, sparkCount]
  );

  return (
    <span
      ref={hostRef}
      onClick={handleClick}
      className={`click-spark ${className}`}
      style={
        {
          '--spark-radius': `${sparkRadius}px`,
          '--spark-color': sparkColor,
        } as React.CSSProperties
      }
    >
      {children}
      {sparks.length > 0 && (
        <span className="click-spark__layer" aria-hidden="true">
          {sparks.map(spark => (
            <span
              key={spark.id}
              className="click-spark__particle"
              style={
                {
                  // 用视口坐标（position: fixed）定位，
                  // 这样即使父级是 display:contents 也不会错位喵~
                  left: `${spark.pageX}px`,
                  top: `${spark.pageY}px`,
                  '--spark-angle': `${spark.angle}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      )}
    </span>
  );
};

export default ClickSpark;
