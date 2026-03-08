import React, { useState, useEffect, useRef } from 'react';
import { Check, Sparkles, Zap } from 'lucide-react';
import { SOURCE_ENABLED_CONFIG, setSourceEnabled, loadSourceConfig, PROVIDERS } from '../services/source';

interface SourceSelectorProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const SourceSelector: React.FC<SourceSelectorProps> = ({ onConfirm, onCancel }) => {
  const [sources, setSources] = useState<Array<{ name: string; enabled: boolean }>>([]);
  const [lineProgress, setLineProgress] = useState(0);
  const [topLinePosition, setTopLinePosition] = useState(0);
  const [bottomLinePosition, setBottomLinePosition] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [isRetreating, setIsRetreating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [beamActive, setBeamActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [glowIntensity, setGlowIntensity] = useState(0);

  const timeouts = useRef<number[]>([]);

  const clearAllTimeouts = () => {
    timeouts.current.forEach(id => clearTimeout(id));
    timeouts.current = [];
  };

  useEffect(() => {
    loadSourceConfig();
    const enabledSources = PROVIDERS.map(p => ({
      name: p.name,
      enabled: SOURCE_ENABLED_CONFIG[p.name] !== false
    }));
    setSources(enabledSources);

    const startEnterAnimation = () => {
      // 初始状态
      setBeamActive(true);
      setGlowIntensity(1);
      setLineProgress(0);
      setTopLinePosition(0);
      setBottomLinePosition(0);

      // 1) 线条展开
      timeouts.current.push(window.setTimeout(() => {
        setLineProgress(100);
      }, 60));

      // 2) 线条分离形成框架
      timeouts.current.push(window.setTimeout(() => {
        setTopLinePosition(-60);
        setBottomLinePosition(60);
      }, 260));

      // 3) 面板展开
      timeouts.current.push(window.setTimeout(() => {
        setShowPanel(true);
        setGlowIntensity(0.6);
      }, 520));

      // 4) 光束渐隐
      timeouts.current.push(window.setTimeout(() => {
        setBeamActive(false);
        setGlowIntensity(0);
      }, 900));
    };

    startEnterAnimation();

    return () => {
      clearAllTimeouts();
    };
  }, []);

  const toggleSource = (name: string) => {
    setSources(prev => prev.map(s => {
      if (s.name === name) {
        const newEnabled = !s.enabled;
        setSourceEnabled(name, newEnabled);
        return { ...s, enabled: newEnabled };
      }
      return s;
    }));
  };

  const startExitAnimation = (callback: () => void) => {
    if (isClosing) return;
    setIsClosing(true);

    // 中断正在进行的进入动画
    clearAllTimeouts();

    // 先收起面板，然后逐步让线条合拢
    setShowPanel(false);

    timeouts.current.push(window.setTimeout(() => {
      setTopLinePosition(0);
      setBottomLinePosition(0);
    }, 120));

    timeouts.current.push(window.setTimeout(() => {
      setLineProgress(0);
      setBeamActive(true);
      setGlowIntensity(1);
    }, 260));

    timeouts.current.push(window.setTimeout(() => {
      setBeamActive(false);
      setGlowIntensity(0);
      callback();
    }, 520));
  };

  const handleConfirm = () => {
    setIsRetreating(true);
    startExitAnimation(onConfirm);
  };

  const handleCancel = () => {
    setIsRetreating(true);
    startExitAnimation(onCancel);
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-[280px] flex items-center justify-center"
    >
      {/* 背景光晕效果 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-80 h-80 rounded-full bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-pink-500/15 blur-3xl" />
      </div>

      {/* 圆圈 - 从搜索框收缩而来，停在左侧 */}
      <div 
        className={`absolute z-30 cursor-pointer transition-all duration-[1200ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isRetreating ? 'scale-110' : 'scale-100 hover:scale-105 active:scale-95'}
        `}
        style={{ 
          left: isRetreating ? `calc(100% - 48px)` : '0px',
          width: '56px',
          height: '56px',
          transitionDelay: isRetreating ? '0ms' : '300ms',
        }}
        onClick={handleConfirm}
      >
        {/* 圆圈本体 */}
        <div className={`relative w-full h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_40px_rgba(99,102,241,0.8)] transition-all duration-700`} style={{ 
          boxShadow: `0 0 ${40 + glowIntensity * 20}px rgba(99,102,241,${0.8 + glowIntensity * 0.2})` 
        }}>
          {/* 内发光 */}
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/30 to-transparent" />
          {/* 旋转光晕 */}
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 blur-md opacity-50 animate-spin" style={{ animationDuration: '3s' }} />
          {/* 中心图标 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Check 
              size={24} 
              className={`text-white transition-all duration-500 ${isRetreating ? 'scale-125 opacity-0' : 'scale-100 opacity-100'}`}
            />
            {beamActive && (
              <Sparkles 
                size={16} 
                className="absolute text-white/80 animate-pulse" 
                style={{ animationDuration: '1s' }}
              />
            )}
          </div>
        </div>
        {/* 脉冲光环 */}
        <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" style={{ animationDuration: '2s' }} />
        {/* 波纹效果 */}
        {!isRetreating && (
          <div className="absolute inset-0 rounded-full bg-white/10 animate-ripple" />
        )}
      </div>

      {/* 线条容器 - 精确定位 */}
      <div 
        className="absolute left-14 top-1/2 -translate-y-1/2"
        style={{ 
          width: `calc(100% - 112px)`,
          zIndex: 10,
        }}
      >
        {/* 上线条 - 从中心向上移动 */}
        <div 
          className="absolute left-0 h-[2px] overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ 
            width: `${lineProgress}%`,
            top: `${topLinePosition}px`,
            transform: `translateY(${topLinePosition}px)`,
          }}
        >
          {/* 主光束 */}
          <div className="h-full w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_15px_rgba(99,102,241,1)]" style={{ 
            boxShadow: `0 0 ${15 + glowIntensity * 10}px rgba(99,102,241,${1 + glowIntensity * 0.5})` 
          }} />
          
          {/* 光束前端光点 */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_20px_3px_rgba(255,255,255,0.9)] animate-pulse" style={{ 
            animationDuration: '0.8s',
            boxShadow: `0 0 ${20 + glowIntensity * 15}px ${3 + glowIntensity * 2}px rgba(255,255,255,${0.9 + glowIntensity * 0.1})` 
          }} />
          
          {/* 光束核心 */}
          <div className="absolute inset-0 h-[1px] top-1/2 -translate-y-1/2 bg-white/80" />
        </div>

        {/* 下线条 - 从中心向下移动 */}
        <div 
          className="absolute left-0 h-[2px] overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ 
            width: `${lineProgress}%`,
            top: `${bottomLinePosition}px`,
            transform: `translateY(${bottomLinePosition}px)`,
          }}
        >
          {/* 主光束 */}
          <div className="h-full w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_15px_rgba(99,102,241,1)]" style={{ 
            boxShadow: `0 0 ${15 + glowIntensity * 10}px rgba(99,102,241,${1 + glowIntensity * 0.5})` 
          }} />
          
          {/* 光束前端光点 */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_20px_3px_rgba(255,255,255,0.9)] animate-pulse" style={{ 
            animationDuration: '0.8s',
            boxShadow: `0 0 ${20 + glowIntensity * 15}px ${3 + glowIntensity * 2}px rgba(255,255,255,${0.9 + glowIntensity * 0.1})` 
          }} />
          
          {/* 光束核心 */}
          <div className="absolute inset-0 h-[1px] top-1/2 -translate-y-1/2 bg-white/80" />
        </div>

        {/* 粒子效果层 */}
        {lineProgress > 20 && lineProgress < 100 && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white/60 rounded-full animate-ping"
                style={{
                  left: `${(lineProgress / 100) * (5 + i * 12)}%`,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '0.8s',
                  top: `${Math.random() * 20 - 10}px`
                }}
              />
            ))}
          </div>
        )}
        
        {/* 闪电效果 */}
        {beamActive && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(3)].map((_, i) => (
              <div
                key={`zap-${i}`}
                className="absolute top-1/2 -translate-y-1/2"
                style={{
                  left: `${20 + i * 30}%`,
                  animation: `zapEffect 0.8s ease-out ${i * 0.2}s infinite`
                }}
              >
                <Zap size={16} className="text-white/60" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 书源管理面板 - 从线条之间展开 */}
      <div 
        className="absolute left-14 right-14 transition-all duration-800 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ 
          top: '50%',
          transform: showPanel ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(0.95)',
          opacity: showPanel ? 1 : 0,
          filter: showPanel ? 'blur(0px)' : 'blur(5px)',
          zIndex: 20,
          height: showPanel ? 'auto' : '0px',
          marginTop: showPanel ? '0px' : `${topLinePosition}px`,
          marginBottom: showPanel ? '0px' : `${-bottomLinePosition}px`,
        }}
      >
        <div className={`glass-panel rounded-3xl p-6 border border-white/15 bg-black/50 backdrop-blur-xl transition-all duration-500`} style={{ 
          boxShadow: showPanel ? '0 0 60px rgba(99,102,241,0.25)' : '0 0 20px rgba(99,102,241,0.1)',
          borderColor: showPanel ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
          transformOrigin: 'center',
          borderTop: showPanel ? '1px solid rgba(99,102,241,0.3)' : 'none',
          borderBottom: showPanel ? '1px solid rgba(99,102,241,0.3)' : 'none',
        }}>
          {/* 顶部装饰线 */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-indigo-500/20" />
            <h3 className="text-white font-bold text-center text-[10px] uppercase tracking-[0.25em] text-white/60">
              书源配置
            </h3>
            <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent via-pink-500/50 to-pink-500/20" />
          </div>
          
          {/* 书源网格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.map((source, index) => (
              <div 
                key={source.name}
                className="group flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-white/5 to-white/0 border border-white/5 hover:border-indigo-500/40 hover:from-white/10 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all duration-300"
                style={{
                  animation: showPanel && !isRetreating ? `sourceItemFadeIn 0.6s cubic-bezier(0.4,0,0.2,1) ${index * 50}ms both` : 'none'
                }}
              >
                <div className="flex items-center gap-3">
                  {/* 状态指示灯 */}
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${source.enabled ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] scale-110' : 'bg-white/20 scale-100'}`} />
                  <span className="text-sm text-white/80 group-hover:text-white transition-colors">{source.name}</span>
                </div>
                {/* 开关按钮 */}
                <button
                  onClick={() => toggleSource(source.name)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${source.enabled ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-white/10'}`}
                >
                  <div 
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-lg transition-transform duration-300 flex items-center justify-center
                      ${source.enabled ? 'left-6' : 'left-0.5'}
                    `}
                  >
                    {source.enabled && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />}
                  </div>
                </button>
              </div>
            ))}
          </div>
          
          {/* 底部提示 */}
          <div className="mt-5 flex items-center justify-center">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse" />
              <span className="text-xs text-white/50">点击左侧光圈确认</span>
            </div>
          </div>
        </div>
      </div>

      {/* 内联动画样式 */}
      <style>{`
        @keyframes sourceItemFadeIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @keyframes beamParticle {
          0% {
            opacity: 0;
            transform: scale(0) translateY(0);
          }
          50% {
            opacity: 1;
            transform: scale(1) translateY(-2px);
          }
          100% {
            opacity: 0;
            transform: scale(0) translateY(-4px);
          }
        }
        
        @keyframes zapEffect {
          0% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1) rotate(10deg);
          }
          100% {
            opacity: 0;
            transform: scale(0.5) rotate(20deg);
          }
        }
        
        @keyframes ripple {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        
        .animate-ripple {
          animation: ripple 2s infinite;
        }
      `}</style>
    </div>
  );
};