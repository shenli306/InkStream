import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { AppState } from '../types';
import { HardDriveDownload, CheckCircle2, Search, BookOpen, Music as LucideMusic, Book } from 'lucide-react';

import { Music } from '../services/musicSource';

interface MusicInfo {
  isPlaying: boolean;
  currentMusic: Music | null;
  isSearching?: boolean;
  isDownloading?: boolean;
  isDownloadComplete?: boolean;
}

type IconId = 'novel' | 'manga' | 'music';
type IconPosition = 'left' | 'center' | 'right';

interface IconData {
  id: IconId;
  position: IconPosition;
  label: string;
  gradient: string;
  shadowColor: string;
  icon: 'book' | 'manga' | 'music';
}

interface SeparatedIconsProps {
  onClick: () => void;
  onReset: () => void;
  onIconClick: (view: 'novel' | 'music' | 'manga') => void;
  activeView: 'novel' | 'music' | 'manga';
}

interface DynamicIslandProps {
  state: AppState;
  progress: number;
  message?: string;
  onClick?: () => void;
  onIconClick?: (view: 'novel' | 'music' | 'manga') => void;
  activeView?: 'novel' | 'music' | 'manga';
  musicInfo?: MusicInfo;
}

type LongPressPhase = 'idle' | 'pressing' | 'shrinking' | 'circle' | 'separating' | 'separated' | 'expanding';

const detectPlatform = (): 'ios' | 'android' | 'desktop' => {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
};

export const DynamicIsland: React.FC<DynamicIslandProps> = ({ state, progress, message, onClick, onIconClick, activeView = 'novel', musicInfo }) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const [longPressPhase, setLongPressPhase] = useState<LongPressPhase>('idle');
  const [pressProgress, setPressProgress] = useState(0);
  const pressTimerRef = useRef<number | null>(null);
  const pressStartTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    if (state === AppState.COMPLETE) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2500);
      return () => clearTimeout(timer);
    } else {
      setShowSuccess(false);
    }
  }, [state]);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const isExpanded = showSuccess || state === AppState.SEARCHING || state === AppState.DOWNLOADING || state === AppState.PARSING || state === AppState.PACKING || (activeView === 'music' && musicInfo && (musicInfo.currentMusic && musicInfo.isPlaying || musicInfo.isSearching || musicInfo.isDownloading || musicInfo.isDownloadComplete));
  const isLongPressActive = longPressPhase === 'separated';

  const smoothTransition = "transition-all duration-400 ease-[cubic-bezier(0.4,0.0,0.2,1)]";
  const expandTransition = "transition-all duration-500 cubic-bezier(0.34,1.56,0.64,1)]";

  const handlePressStart = useCallback(() => {
    if (isExpanded || isLongPressActive || longPressPhase !== 'idle') return;
    
    pressStartTimeRef.current = Date.now();
    setPressProgress(0);
    setLongPressPhase('pressing');

    const animatePress = () => {
      if (!pressStartTimeRef.current) return;
      const elapsed = Date.now() - pressStartTimeRef.current;
      const progress = Math.min(elapsed / 500, 1);
      setPressProgress(progress);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animatePress);
      } else {
        setLongPressPhase('shrinking');
      }
    };

    animationFrameRef.current = requestAnimationFrame(animatePress);

    pressTimerRef.current = window.setTimeout(() => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setLongPressPhase('shrinking');
    }, 500);
  }, [isExpanded, isLongPressActive, longPressPhase]);

  const handlePressEnd = useCallback(() => {
    if (longPressPhase === 'pressing' || longPressPhase === 'shrinking') {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      
      if (longPressPhase === 'pressing' && pressProgress < 1) {
        setLongPressPhase('idle');
        setPressProgress(0);
      } else if (longPressPhase === 'shrinking') {
        setLongPressPhase('circle');
        setTimeout(() => {
          setLongPressPhase('separating');
          setTimeout(() => {
            setLongPressPhase('separated');
          }, 400);
        }, 280);
      }
    }
  }, [longPressPhase, pressProgress]);

  const handleSeparatedClick = useCallback(() => {
    console.log('图标被点击，功能待实现');
  }, []);

  const resetLongPress = useCallback(() => {
    setLongPressPhase('expanding');
    setTimeout(() => {
      setLongPressPhase('idle');
      setPressProgress(0);
    }, 400);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  }, [onClick]);

  return (
    <div 
      className={`fixed top-[calc(env(safe-area-inset-top)+1rem)] left-1/2 -translate-x-1/2 z-[100] ${longPressPhase === 'expanding' ? expandTransition : smoothTransition}`}
      role="button"
      tabIndex={0}
      aria-label="灵动岛"
      onKeyDown={handleKeyDown}
      style={{ willChange: 'transform, width, height, border-radius', userSelect: 'none', caretColor: 'transparent' }}
    >
      {/* 主灵动岛容器 */}
      {longPressPhase !== 'separated' ? (
        <div
          onClick={onClick}
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          className={`
            overflow-hidden text-white flex items-center justify-center cursor-pointer
            ${longPressPhase === 'expanding' ? expandTransition : smoothTransition}
            ${getIslandSize(isExpanded, longPressPhase, pressProgress)}
            ${longPressPhase === 'separating' || longPressPhase === 'shrinking' || longPressPhase === 'circle' || longPressPhase === 'expanding' ? 'bg-transparent border-none shadow-none' : 'glass-island'}
            focus-visible:ring-2 focus-visible:ring-white/50
          `}
          style={{
            borderRadius: getBorderRadius(longPressPhase, pressProgress),
            willChange: 'transform, width, height, border-radius',
            touchAction: 'none',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        >
          {/* 长按进度条 - 线性 */}
          {(longPressPhase === 'pressing' || longPressPhase === 'shrinking') && (
            <div className="absolute inset-x-4 bottom-2 h-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 rounded-full"
                style={{
                  width: `${pressProgress * 100}%`,
                  transition: 'width 0.1s linear'
                }}
              />
            </div>
          )}

          {/* 进度发光效果 */}
          {longPressPhase === 'pressing' && pressProgress > 0.3 && (
            <div 
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{
                boxShadow: `inset 0 0 20px ${pressProgress * 30}px rgba(99, 102, 241, ${pressProgress * 0.4})`,
              }}
            />
          )}

          <div className="relative w-full h-full flex items-center justify-center">
            {/* Idle State Indicator - CSS动画优化性能 */}
            {longPressPhase === 'idle' && (
              <div
                className={`absolute w-20 h-1.5 rounded-full ${
                  isExpanded ? 'opacity-0 scale-50' : 'opacity-100 animate-island-pulse'
                }`}
                style={{
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.25), rgba(255,255,255,0.15))',
                }}
              />
            )}

            {/* Expanded Content - 优化淡入动画 */}
            <div
              className={`w-full h-full flex items-center px-4 gap-4 transition-all duration-400 ease-out
                ${(isExpanded && longPressPhase === 'idle') || longPressPhase === 'expanding' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}
              `}
            >
              {/* Icon Section */}
              <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                {activeView === 'music' && musicInfo?.currentMusic && musicInfo.isPlaying ? (
                  <div className={`w-9 h-9 rounded-full overflow-hidden animate-spin`} style={{ animationDuration: '3s' }}>
                    {musicInfo.currentMusic.cover ? (
                      <img src={musicInfo.currentMusic.cover} alt="cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                        <LucideMusic size={18} className="text-white" />
                      </div>
                    )}
                  </div>
                ) : activeView === 'music' && musicInfo?.isSearching ? (
                  <div className="flex items-center justify-center">
                    <svg className="w-6 h-6 animate-spin text-indigo-300" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                  </div>
                ) : activeView === 'music' && musicInfo?.isDownloading ? (
                  <div className="relative flex items-center justify-center">
                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                      <path className="text-white/20" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                      <path 
                        className="text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" 
                        strokeDasharray={`${progress}, 100`} 
                        strokeDashoffset={0}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="3"
                      />
                    </svg>
                    <Download size={14} className="absolute text-purple-300 animate-bounce" />
                  </div>
                ) : activeView === 'music' && musicInfo?.isDownloadComplete ? (
                  <div className="relative">
                    <CheckCircle2 size={24} className="text-emerald-400" style={{ animation: 'scale-in 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }} />
                    <div className="absolute inset-0 bg-emerald-400/30 blur-lg animate-pulse" style={{ animationDuration: '1s' }} />
                  </div>
                ) : (
                  <>

                    {state === AppState.DOWNLOADING && (
                      <div className="relative flex items-center justify-center">
                        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                          <path className="text-white/10" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                          <path 
                            className="text-pink-400 drop-shadow-[0_0_10px_rgba(244,114,182,0.5)]" 
                            strokeDasharray={`${progress}, 100`} 
                            strokeDashoffset={0}
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="3"
                            style={{
                              filter: `drop-shadow(0 0 ${progress * 0.15}px rgba(244,114,182,0.8))`,
                              transition: 'stroke-dasharray 0.3s ease-out, filter 0.3s ease-out'
                            }}
                          />
                        </svg>
                        <span className="absolute text-[10px] font-bold text-white">{progress}</span>
                      </div>
                    )}

                    {state === AppState.PACKING && (
                      <div className="relative">
                        <HardDriveDownload size={22} className="text-pink-400" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <div className="absolute inset-0 bg-pink-400/20 blur-xl animate-pulse" />
                      </div>
                    )}

                    {(showSuccess || state === AppState.COMPLETE) && (
                      <div className="relative">
                        <CheckCircle2 size={24} className="text-emerald-400" style={{ animation: 'scale-in 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }} />
                        <div className="absolute inset-0 bg-emerald-400/30 blur-lg animate-pulse" style={{ animationDuration: '1s' }} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Text Section */}
              <div className="flex flex-col flex-1 min-w-0 justify-center">
                {activeView === 'music' && musicInfo?.currentMusic && musicInfo.isPlaying ? (
                  <div className="marquee-container overflow-hidden">
                    <span className="marquee-text text-[13px] font-bold text-white/95 tracking-wide font-sans">
                      {musicInfo.currentMusic.name} - {musicInfo.currentMusic.artist} &nbsp;&nbsp;&nbsp;
                    </span>
                  </div>
                ) : activeView === 'music' && musicInfo?.isSearching ? (
                  <span className="text-[13px] font-bold text-white/95 truncate tracking-wide font-sans">
                    正在搜索音乐...
                  </span>
                ) : activeView === 'music' && musicInfo?.isDownloading ? (
                  <span className="text-[13px] font-bold text-white/95 truncate tracking-wide font-sans">
                    正在下载音乐...
                  </span>
                ) : activeView === 'music' && musicInfo?.isDownloadComplete ? (
                  <span className="text-[13px] font-bold text-white/95 truncate tracking-wide font-sans">
                    下载完成
                  </span>
                ) : state === AppState.IDLE ? null : (
                  <>
                    <span className="text-[13px] font-bold text-white/95 truncate tracking-wide font-sans">
                      {state === AppState.SEARCHING && (
                        <>
                          <svg className="w-4 h-4 inline-block mr-2 animate-spin align-middle" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          正在全网搜索...
                        </>
                      )}
                      {state === AppState.DOWNLOADING && "正在抓取章节内容"}
                      {state === AppState.PARSING && "正在解析章节..."}
                      {state === AppState.ANALYZING && "正在获取下载链接..."}
                      {state === AppState.PACKING && "正在打包 EPUB..."}
                      {(showSuccess || state === AppState.COMPLETE) && "打包完成"}
                      {state === AppState.ERROR && "出现错误"}
                    </span>
                    <span className="text-[11px] text-white/50 truncate font-medium">
                      {showSuccess ? "文件已开始下载" : message}
                    </span>
                  </>
                )}
              </div>
            </div>
            </div>
            </div>
        ) : (
          <SeparatedIcons onClick={handleSeparatedClick} onReset={resetLongPress} onIconClick={onIconClick} activeView={activeView} />
        )}
    </div>
  );
};

// 获取灵动岛尺寸 - 优化过渡
function getIslandSize(isExpanded: boolean, longPressPhase: LongPressPhase, pressProgress: number): string {
  if (longPressPhase === 'pressing') {
    const scale = 1 - pressProgress * 0.08;
    return `w-[120px] h-[36px] scale-[${scale}]`;
  }
  
  if (longPressPhase === 'shrinking') {
    return 'w-[140px] h-[60px]';
  }
  
  if (longPressPhase === 'circle') {
    return 'w-[36px] h-[36px]';
  }

  if (longPressPhase === 'separating' || longPressPhase === 'separated') {
    return 'w-[260px] h-[80px]';
  }

  if (longPressPhase === 'expanding') {
    return isExpanded ? 'w-[min(90vw,360px)] h-[68px] px-2' : 'w-[min(40vw,120px)] h-[36px]';
  }

  return isExpanded ? 'w-[min(90vw,360px)] h-[68px] px-2' : 'w-[min(40vw,120px)] h-[36px]';
}

// 获取圆角 - 优化过渡曲线
function getBorderRadius(longPressPhase: LongPressPhase, pressProgress: number): string {
  if (longPressPhase === 'pressing') {
    const baseRadius = 2.5;
    const targetRadius = 50;
    const currentRadius = baseRadius + (targetRadius - baseRadius) * pressProgress;
    return `${currentRadius}%`;
  }
  
  if (longPressPhase === 'shrinking') {
    return '35%';
  }

  if (longPressPhase === 'circle' || longPressPhase === 'separating' || longPressPhase === 'separated') {
    return '50%';
  }

  if (longPressPhase === 'expanding') {
    return '2.5rem';
  }

  return '2.5rem';
}

// 分离动画组件 - 优化时序和效果
interface SeparatingAnimationProps {
  onComplete: () => void;
  activeView: 'novel' | 'manga' | 'music';
}

const SeparatingAnimation: React.FC<SeparatingAnimationProps> = React.memo(({ onComplete, activeView }) => {
  const getIconComponent = (id: string) => {
    switch (id) {
      case 'novel': return <Book size={20} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />;
      case 'manga': return <BookOpen size={20} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />;
      case 'music': return <LucideMusic size={20} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />;
      default: return null;
    }
  };

  const getGradient = (id: string) => {
    switch (id) {
      case 'novel': return 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)';
      case 'manga': return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)';
      case 'music': return 'linear-gradient(135deg, #a855f7 0%, #d946ef 50%, #ec4899 100%)';
      default: return 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)';
    }
  };

  const getShadowColor = (id: string) => {
    switch (id) {
      case 'novel': return '0 0 25px rgba(6,182,212,0.8), 0 0 60px rgba(99,102,241,0.5)';
      case 'manga': return '0 0 25px rgba(99,102,241,0.8), 0 0 60px rgba(168,85,247,0.5)';
      case 'music': return '0 0 25px rgba(168,85,247,0.8), 0 0 60px rgba(236,72,153,0.5)';
      default: return '0 0 25px rgba(6,182,212,0.8), 0 0 60px rgba(99,102,241,0.5)';
    }
  };

  // Calculate icon order based on activeView
  const iconOrder: ('novel' | 'manga' | 'music')[] = ['novel', 'manga', 'music'];
  const activeIndex = iconOrder.indexOf(activeView);
  const leftIndex = (activeIndex - 1 + iconOrder.length) % iconOrder.length;
  const rightIndex = (activeIndex + 1) % iconOrder.length;

  const leftId = iconOrder[leftIndex];
  const centerId = iconOrder[activeIndex];
  const rightId = iconOrder[rightIndex];
  const [phase, setPhase] = useState<'loading' | 'show'>('loading');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setPhase('show');
          return 100;
        }
        return prev + 5;
      });
    }, 30);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase === 'show') {
      const timer = setTimeout(() => {
        onComplete();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  return (
    <div 
      className="absolute flex items-center justify-center overflow-visible"
      style={{
        width: '260px',
        height: '80px',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        willChange: 'transform, opacity',
      }}
    >
      {/* 线性进度条 */}
      {phase === 'loading' && (
        <div className="absolute w-[180px] h-1 bg-white/20 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 rounded-full"
            style={{
              width: `${progress}%`,
              transition: 'width 0.03s linear'
            }}
          />
        </div>
      )}

      {/* 图标 - 进度完成后显示 */}
      {phase === 'show' && (
        <>
          {/* 左侧圆形 */}
          <div 
            className="absolute w-[44px] h-[44px] rounded-full flex items-center justify-center"
            style={{
              left: '30px',
              top: '50%',
              marginTop: '-22px',
              background: getGradient(leftId),
              boxShadow: getShadowColor(leftId),
            }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 to-transparent opacity-50" />
            {getIconComponent(leftId)}
          </div>

          {/* 中间圆形 */}
          <div 
            className="absolute w-[44px] h-[44px] rounded-full flex items-center justify-center"
            style={{
              left: '50%',
              top: '50%',
              marginLeft: '-22px',
              marginTop: '-22px',
              background: getGradient(centerId),
              boxShadow: getShadowColor(centerId),
            }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 to-transparent opacity-50" />
            {getIconComponent(centerId)}
          </div>

          {/* 右侧圆形 */}
          <div 
            className="absolute w-[44px] h-[44px] rounded-full flex items-center justify-center"
            style={{
              right: '30px',
              top: '50%',
              marginTop: '-22px',
              background: getGradient(rightId),
              boxShadow: getShadowColor(rightId),
            }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 to-transparent opacity-50" />
            {getIconComponent(rightId)}
          </div>
        </>
      )}
    </div>
  );
});

const SeparatedIcons: React.FC<SeparatedIconsProps> = React.memo(({ onClick, onReset, onIconClick, activeView }) => {
  // Helper functions to get icon properties
  const getLabel = (id: IconId): string => {
    switch (id) {
      case 'novel': return '小说';
      case 'manga': return '漫画';
      case 'music': return '音乐';
      default: return '';
    }
  };

  const getGradient = (id: IconId): string => {
    switch (id) {
      case 'novel': return 'from-cyan-500 via-blue-500 to-indigo-600';
      case 'manga': return 'from-indigo-500 via-purple-500 to-fuchsia-500';
      case 'music': return 'from-purple-500 via-pink-500 to-rose-500';
      default: return '';
    }
  };

  const getShadowColor = (id: IconId): string => {
    switch (id) {
      case 'novel': return 'rgba(6,182,212,0.7)';
      case 'manga': return 'rgba(99,102,241,0.7)';
      case 'music': return 'rgba(168,85,247,0.7)';
      default: return 'rgba(6,182,212,0.7)';
    }
  };

  const getIconType = (id: IconId): 'book' | 'manga' | 'music' => {
    switch (id) {
      case 'novel': return 'book';
      case 'manga': return 'manga';
      case 'music': return 'music';
      default: return 'book';
    }
  };

  // Define icon order for circular arrangement
  const iconOrder: ('novel' | 'manga' | 'music')[] = ['novel', 'manga', 'music'];
  
  // Find the index of activeView in the order
  const activeIndex = iconOrder.indexOf(activeView);
  const leftIndex = (activeIndex - 1 + iconOrder.length) % iconOrder.length;
  const rightIndex = (activeIndex + 1) % iconOrder.length;

    const [icons, setIcons] = useState<IconData[]>([
      { 
        id: iconOrder[leftIndex], 
        position: 'left' as IconPosition, 
        label: getLabel(iconOrder[leftIndex]), 
        gradient: getGradient(iconOrder[leftIndex]), 
        shadowColor: getShadowColor(iconOrder[leftIndex]), 
        icon: getIconType(iconOrder[leftIndex]) 
      },
      { 
        id: iconOrder[activeIndex], 
        position: 'center' as IconPosition, 
        label: getLabel(iconOrder[activeIndex]), 
        gradient: getGradient(iconOrder[activeIndex]), 
        shadowColor: getShadowColor(iconOrder[activeIndex]), 
        icon: getIconType(iconOrder[activeIndex]) 
      },
      { 
        id: iconOrder[rightIndex], 
        position: 'right' as IconPosition, 
        label: getLabel(iconOrder[rightIndex]), 
        gradient: getGradient(iconOrder[rightIndex]), 
        shadowColor: getShadowColor(iconOrder[rightIndex]), 
        icon: getIconType(iconOrder[rightIndex]) 
      }
    ]);
  
  const [isAnimating, setIsAnimating] = useState(false);
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);

  // 10秒后自动收回
  useEffect(() => {
    autoCloseTimerRef.current = window.setTimeout(() => {
      onReset();
    }, 10000);

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, [onReset]);

  // 清除计时器
  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  // 滑动处理
  const handleTouchStart = (e: React.TouchEvent) => {
    clearAutoCloseTimer();
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || isAnimating) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handleSwipe('left');
      } else {
        handleSwipe('right');
      }
    }
    touchStartX.current = null;
  };

  // 处理滑动
  const handleSwipe = (direction: 'left' | 'right', callback?: () => void) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setSlideDirection(direction);

    setTimeout(() => {
      setIcons(prev => {
        let newIcons = [...prev];
        
        if (direction === 'right') {
          // 向右滑：左侧图标移到中间，中间的移到右侧，右侧的移到左侧
          newIcons = newIcons.map((icon) => {
            if (icon.position === 'left') return { ...icon, position: 'center' };
            if (icon.position === 'center') return { ...icon, position: 'right' };
            if (icon.position === 'right') return { ...icon, position: 'left' };
            return icon;
          });
        } else {
          // 向左滑：右侧图标移到中间，中间的移到左侧，左侧的移到右侧
          newIcons = newIcons.map((icon) => {
            if (icon.position === 'right') return { ...icon, position: 'center' };
            if (icon.position === 'center') return { ...icon, position: 'left' };
            if (icon.position === 'left') return { ...icon, position: 'right' };
            return icon;
          });
        }
        return newIcons;
      });

      setSlideDirection(null);
      
      // 动画完成后调用回调
      setTimeout(() => {
        setIsAnimating(false);
        if (callback) callback();
        
        // 获取新的中间图标并切换页面
        const newCenterIcon = icons.find(icon => icon.position === 'center');
        if (newCenterIcon && onIconClick) {
          // 根据当前位置找到切换后的中间图标
          setTimeout(() => {
            const updatedCenterIcon = icons.find(icon => icon.position === 'center');
            if (updatedCenterIcon) {
              onIconClick(updatedCenterIcon.id as 'novel' | 'music' | 'manga');
            }
          }, 50);
        }
      }, 50);
    }, 300);
  };

  // 处理图标点击 - 直接将点击的图标移到中间
  const handleIconClick = (clickedId: string) => {
    if (isAnimating) return;

    clearAutoCloseTimer();

    const clickedIcon = icons.find(icon => icon.id === clickedId);
    if (!clickedIcon) return;

    // 如果点击的不是中间图标，将它移到中间
    if (clickedIcon.position !== 'center') {
      setIsAnimating(true);
      
      setTimeout(() => {
        setIcons(prev => {
          // 将点击的图标移到中间，其他图标依次排列
          const newIcons = prev.map(icon => {
            if (icon.id === clickedId) {
              return { ...icon, position: 'center' as IconPosition };
            }
            if (icon.position === 'center') {
              // 原中间图标放到点击图标的原位置
              return { ...icon, position: clickedIcon.position };
            }
            return icon;
          });
          return newIcons;
        });

        // 动画完成后切换页面并收回图标
        setTimeout(() => {
          setIsAnimating(false);
          onIconClick?.(clickedId as 'novel' | 'music' | 'manga');
          // 立即收回图标
          onReset();
        }, 350);
      }, 50);
    }
  };

  // 获取图标位置样式 - 一字排开，与加载动画保持一致
  const getPositionStyle = (icon: IconData, index: number): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      top: '50%',
      marginTop: '-22px',
      transition: isAnimating ? 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
    };

    const isCenter = icon.position === 'center';
    const isLeft = icon.position === 'left';
    const isRight = icon.position === 'right';

    // 计算基础位置 - 与加载动画保持一致
    let left = '50%';
    let right = 'auto';
    let transform = 'translateX(-50%)';
    let scale = 1;
    let opacity = 1;
    let zIndex = 1;

    if (isCenter) {
      // 中间图标 - 居中
      left = '50%';
      right = 'auto';
      transform = 'translateX(-50%)';
      
      if (slideDirection === 'right') {
        transform = 'translateX(-20%) scale(0.9)';
        opacity = 0.8;
      } else if (slideDirection === 'left') {
        transform = 'translateX(-80%) scale(0.9)';
        opacity = 0.8;
      }
      scale = 1.1;
      zIndex = 10;
    } else if (isLeft) {
      // 左侧图标 - left: 30px
      left = '30px';
      right = 'auto';
      transform = 'translateX(0)';
      
      if (slideDirection === 'right') {
        transform = 'translateX(40%) scale(0.85)';
        opacity = 0.6;
      } else if (slideDirection === 'left') {
        transform = 'translateX(-20%) scale(0.7)';
        opacity = 0;
      }
    } else if (isRight) {
      // 右侧图标 - right: 30px
      left = 'auto';
      right = '30px';
      transform = 'translateX(0)';
      
      if (slideDirection === 'right') {
        transform = 'translateX(-20%) scale(0.7)';
        opacity = 0;
      } else if (slideDirection === 'left') {
        transform = 'translateX(-40%) scale(0.85)';
        opacity = 0.6;
      }
    }

    return {
      ...baseStyle,
      left,
      right,
      transform,
      scale,
      opacity,
      zIndex,
    };
  };

  // 渲染图标
  const renderIcon = (iconData: IconData, index: number) => {
    const IconComponent = iconData.icon === 'book' ? Book : 
                          iconData.icon === 'manga' ? BookOpen : LucideMusic;
    const isHovered = hoveredIcon === iconData.id;
    const isCenter = iconData.position === 'center';

    return (
      <button
        key={iconData.id}
        onClick={() => handleIconClick(iconData.id)}
        onMouseEnter={() => setHoveredIcon(iconData.id)}
        onMouseLeave={() => setHoveredIcon(null)}
        disabled={isAnimating}
        className="relative w-[44px] h-[44px] rounded-full flex items-center justify-center transition-all duration-300 disabled:cursor-not-allowed overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-purple-600"
        style={{
          ...getPositionStyle(iconData, index),
          background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
          boxShadow: isHovered || isCenter
            ? `0 0 50px ${iconData.shadowColor}, 0 0 80px ${iconData.shadowColor.replace('0.7', '0.3')}` 
            : `0 0 35px ${iconData.shadowColor}`,
          transform: `${getPositionStyle(iconData, index).transform} ${isHovered ? 'scale(1.1)' : 'scale(1)'}`,
          willChange: 'transform, box-shadow',
          transformOrigin: 'center',
        }}
      >
        {/* 渐变背景 */}
        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${iconData.gradient}`} />
        
        {/* 内部光晕 */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-transparent opacity-40 group-hover:opacity-60 transition-all duration-300" />
        
        {/* 旋转光效 */}
        <div className={`absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 ${isHovered || isCenter ? 'opacity-100' : ''} transition-opacity duration-500`} />
        
        {/* 脉冲光环 */}
        {(isHovered || isCenter) && (
          <div 
            className="absolute inset-[-4px] rounded-full opacity-30 animate-ping"
            style={{
              background: `radial-gradient(circle, ${iconData.shadowColor.replace('0.7', '0.4')} 0%, transparent 70%)`,
            }}
          />
        )}
        
        {/* 图标 */}
        <IconComponent 
          size={20} 
          className="relative z-10 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" 
        />
        
        {/* 标签 - 只有中间图标显示 */}
        {isCenter && (
          <span 
            className="absolute -bottom-7 text-[11px] text-white/90 font-medium whitespace-nowrap tracking-wide transition-all duration-300"
            style={{
              opacity: isHovered ? 1 : 0.8,
            }}
          >
            {iconData.label}
          </span>
        )}
        
        {/* 外发光 */}
        <div 
          className="absolute inset-0 rounded-full transition-shadow duration-300"
          style={{
            boxShadow: `0 0 25px 3px ${iconData.shadowColor.replace('0.7', '0.3')}`,
          }}
        />
      </button>
    );
  };

  return (
    <div 
      ref={containerRef}
      className="relative animate-in fade-in duration-400"
      style={{
        width: '260px',
        height: '80px',
        willChange: 'transform, opacity',
        touchAction: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 滑动指示器 */}
      <div className="absolute inset-0 flex items-center justify-center gap-4">
        {icons.map((icon, index) => renderIcon(icon, index))}
      </div>
    </div>
  );
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default DynamicIsland;
