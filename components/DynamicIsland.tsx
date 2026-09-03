import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Book,
  BookOpen,
  CheckCircle2,
  Download,
  HardDriveDownload,
  Loader2,
  Music as MusicIcon,
  Search,
} from 'lucide-react';
import { AppState } from '../types';
import type { Music } from '../services/musicSource';
import '../dynamic-island.css';

type ViewId = 'novel' | 'music' | 'manga';
type IslandMode = 'compact' | 'pressing' | 'navigation' | 'closing-navigation';

interface MusicInfo {
  isPlaying: boolean;
  currentMusic: Music | null;
  isSearching?: boolean;
  isDownloading?: boolean;
  isDownloadComplete?: boolean;
}

interface DynamicIslandProps {
  state: AppState;
  progress: number;
  message?: string;
  onClick?: () => void;
  onIconClick?: (view: ViewId) => void;
  activeView?: ViewId;
  musicInfo?: MusicInfo;
}

interface StatusModel {
  expanded: boolean;
  kind: 'idle' | 'search' | 'progress' | 'packing' | 'success' | 'music' | 'error';
  title: string;
  subtitle?: string;
}

const VIEW_ORDER: ViewId[] = ['music', 'novel', 'manga'];
const VIEW_META: Record<ViewId, { label: string; icon: typeof Book }> = {
  novel: { label: '小说', icon: Book },
  manga: { label: '漫画', icon: BookOpen },
  music: { label: '音乐', icon: MusicIcon },
};

const getStatusModel = (
  state: AppState,
  showSuccess: boolean,
  message: string | undefined,
  activeView: ViewId,
  musicInfo?: MusicInfo,
): StatusModel => {
  if (activeView === 'music' && musicInfo) {
    if (musicInfo.currentMusic && musicInfo.isPlaying) {
      return {
        expanded: true,
        kind: 'music',
        title: `${musicInfo.currentMusic.name} - ${musicInfo.currentMusic.artist}`,
      };
    }
    if (musicInfo.isSearching) return { expanded: true, kind: 'search', title: '正在搜索音乐...' };
    if (musicInfo.isDownloading) return { expanded: true, kind: 'progress', title: '正在下载音乐...' };
    if (musicInfo.isDownloadComplete) return { expanded: true, kind: 'success', title: '下载完成' };
  }

  if (showSuccess) return { expanded: true, kind: 'success', title: '打包完成', subtitle: '文件已开始下载' };

  switch (state) {
    case AppState.SEARCHING:
      return { expanded: true, kind: 'search', title: '正在全网搜索...', subtitle: message };
    case AppState.ANALYZING:
      return { expanded: true, kind: 'search', title: '正在获取下载链接...', subtitle: message };
    case AppState.DOWNLOADING:
      return { expanded: true, kind: 'progress', title: '正在抓取章节内容', subtitle: message };
    case AppState.PARSING:
      return { expanded: true, kind: 'progress', title: '正在解析章节...', subtitle: message };
    case AppState.PACKING:
      return { expanded: true, kind: 'packing', title: '正在打包 EPUB...', subtitle: message };
    case AppState.ERROR:
      return { expanded: true, kind: 'error', title: '出现错误', subtitle: message };
    default:
      return { expanded: false, kind: 'idle', title: '' };
  }
};

const IslandStatusIcon = memo(({ model, progress, musicInfo }: {
  model: StatusModel;
  progress: number;
  musicInfo?: MusicInfo;
}) => {
  if (model.kind === 'music' && musicInfo?.currentMusic) {
    return (
      <span className="dynamic-island__album">
        {musicInfo.currentMusic.cover ? (
          <img src={musicInfo.currentMusic.cover} alt="" />
        ) : (
          <MusicIcon size={18} aria-hidden="true" />
        )}
      </span>
    );
  }

  if (model.kind === 'search') return <Loader2 className="dynamic-island__spinner" size={22} aria-hidden="true" />;
  if (model.kind === 'packing') return <HardDriveDownload size={23} aria-hidden="true" />;
  if (model.kind === 'success') return <CheckCircle2 className="text-emerald-400" size={24} aria-hidden="true" />;
  if (model.kind === 'error') return <Search className="text-rose-400" size={22} aria-hidden="true" />;

  if (model.kind === 'progress') {
    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
    return (
      <span className="dynamic-island__progress" style={{ '--island-progress': safeProgress } as React.CSSProperties}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="dynamic-island__progress-track" cx="18" cy="18" r="15" />
          <circle className="dynamic-island__progress-value" cx="18" cy="18" r="15" />
        </svg>
        <Download size={13} aria-hidden="true" />
      </span>
    );
  }

  return null;
});

const NavigationIcons = memo(({ activeView, onSelect, onSwipe, onReset }: {
  activeView: ViewId;
  onSelect: (view: ViewId) => void;
  onSwipe?: (view: ViewId) => void;
  onReset: () => void;
}) => {
  const pointerStartRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(onReset, 10000);
    return () => window.clearTimeout(timer);
  }, [onReset]);

  const orderedViews = useMemo(() => {
    const others = VIEW_ORDER.filter(view => view !== activeView);
    return [others[0], activeView, others[1]];
  }, [activeView]);

  const handlePointerDown = (event: React.PointerEvent) => {
    pointerStartRef.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (pointerStartRef.current === null) return;
    const delta = event.clientX - pointerStartRef.current;
    pointerStartRef.current = null;
    if (Math.abs(delta) < 40) return;
    const activeIndex = VIEW_ORDER.indexOf(activeView);
    const nextIndex = delta < 0
      ? (activeIndex + 1) % VIEW_ORDER.length
      : (activeIndex - 1 + VIEW_ORDER.length) % VIEW_ORDER.length;
    onSwipe?.(VIEW_ORDER[nextIndex]);
  };

  return (
    <div
      className="dynamic-island__navigation"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { pointerStartRef.current = null; }}
    >
      {orderedViews.map((view, index) => {
        const Icon = VIEW_META[view].icon;
        const isActive = view === activeView;
        return (
          <button
            type="button"
            key={view}
            className={`dynamic-island__nav-item dynamic-island__nav-item--${index === 0 ? 'left' : index === 1 ? 'center' : 'right'} dynamic-island__nav-item--${view}`}
            onClick={() => onSelect(view)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={VIEW_META[view].label}
          >
            <span className="dynamic-island__nav-icon"><Icon size={20} aria-hidden="true" /></span>
            <span className="dynamic-island__nav-label">{VIEW_META[view].label}</span>
          </button>
        );
      })}
    </div>
  );
});

const DynamicIslandComponent: React.FC<DynamicIslandProps> = ({
  state,
  progress,
  message,
  onClick,
  onIconClick,
  activeView = 'novel',
  musicInfo,
}) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const [mode, setMode] = useState<IslandMode>('compact');
  const pressTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  useLayoutEffect(() => {
    if (state !== AppState.COMPLETE) {
      setShowSuccess(false);
      return;
    }
    setShowSuccess(true);
    const timer = window.setTimeout(() => setShowSuccess(false), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  const model = useMemo(
    () => getStatusModel(state, showSuccess, message, activeView, musicInfo),
    [state, showSuccess, message, activeView, musicInfo],
  );

  useEffect(() => {
    if (!model.expanded) return;

    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    suppressClickRef.current = false;
    setMode('compact');
  }, [model.expanded]);

  useEffect(() => () => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const cancelPress = useCallback(() => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setMode(current => current === 'pressing' ? 'compact' : current);
  }, []);

  const startPress = useCallback(() => {
    if (model.expanded || mode !== 'compact') return;
    suppressClickRef.current = false;
    setMode('pressing');
    pressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      pressTimerRef.current = null;
      setMode('navigation');
    }, 500);
  }, [model.expanded, mode]);

  const closeNavigation = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    setMode('closing-navigation');
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setMode('compact');
    }, 220);
  }, []);

  const selectView = useCallback((view: ViewId) => {
    onIconClick?.(view);
    closeNavigation();
  }, [closeNavigation, onIconClick]);

  const swipeView = useCallback((view: ViewId) => {
    onIconClick?.(view);
  }, [onIconClick]);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onClick?.();
  }, [onClick]);

  const navigationVisible = !model.expanded && (mode === 'navigation' || mode === 'closing-navigation');

  return (
    <div className="dynamic-island" aria-label="灵动岛">
      {navigationVisible ? (
        <div className={`dynamic-island__navigation-shell ${mode === 'closing-navigation' ? 'dynamic-island__navigation-shell--closing' : ''}`}>
          <NavigationIcons activeView={activeView} onSelect={selectView} onSwipe={swipeView} onReset={closeNavigation} />
        </div>
      ) : (
        <button
          type="button"
          className={`dynamic-island__shell ${model.expanded ? 'dynamic-island__shell--expanded' : ''} ${mode === 'pressing' ? 'dynamic-island__shell--pressing' : ''}`}
          onClick={handleClick}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          aria-label={model.expanded ? model.title : '长按打开功能切换'}
        >
          <span className="dynamic-island__idle-indicator" aria-hidden="true" />
          <span className="dynamic-island__press-track" aria-hidden="true"><span /></span>

          <span className="dynamic-island__content">
            <span className="dynamic-island__status-icon">
              <IslandStatusIcon model={model} progress={progress} musicInfo={musicInfo} />
            </span>
            <span className="dynamic-island__copy">
              <span className={`dynamic-island__title ${model.kind === 'music' ? 'dynamic-island__title--marquee' : ''}`}>
                {model.title}
              </span>
              {model.subtitle && <span className="dynamic-island__subtitle">{model.subtitle}</span>}
            </span>
          </span>
        </button>
      )}
    </div>
  );
};

export const DynamicIsland = memo(DynamicIslandComponent);
export default DynamicIsland;
