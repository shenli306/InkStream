import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleX,
  Download,
  HardDriveDownload,
  Loader2,
  Search,
} from 'lucide-react';
import { AppState } from '../types';
import '../dynamic-island.css';

type ViewId = 'novel';

interface DynamicIslandProps {
  state: AppState;
  progress: number;
  message?: string;
  /** 当前书名：展开面板里显示，让用户知道正在等哪本书 */
  title?: string;
  /** 是否有可返回的上一层（详情页时为 true，岛承担返回按钮的职责） */
  canGoBack?: boolean;
  /** 页面已滚动：折叠态收成小圆标，别继续横在内容上挡字喵~ */
  compact?: boolean;
  onClick?: () => void;
  onIconClick?: (view: ViewId) => void;
  activeView?: ViewId;
  /** 取消当前任务（展开面板里的按钮） */
  onCancel?: () => void;
}

type IslandKind = 'idle' | 'back' | 'search' | 'progress' | 'packing' | 'success' | 'error';

interface StatusModel {
  expanded: boolean;
  kind: IslandKind;
  title: string;
  subtitle?: string;
  /** 是否可取消：搜索 / 抓取 / 解析 / 打包阶段都能取消 */
  cancellable: boolean;
  /** 折叠态显示的文字与图标（首页“搜书” / 详情“返回搜索结果”） */
  idleLabel?: string;
  idleIcon?: 'search' | 'back';
}

const getStatusModel = (
  state: AppState,
  showSuccess: boolean,
  message: string | undefined,
  canGoBack: boolean,
): StatusModel => {
  if (showSuccess) {
    return {
      expanded: true,
      kind: 'success',
      title: '打包完成',
      subtitle: '文件已开始下载',
      cancellable: false,
      idleLabel: canGoBack ? '返回搜索结果' : undefined,
      idleIcon: canGoBack ? 'back' : undefined,
    };
  }

  switch (state) {
    case AppState.SEARCHING:
      return { expanded: true, kind: 'search', title: '正在全网搜索...', subtitle: message, cancellable: true };
    case AppState.ANALYZING:
      return { expanded: true, kind: 'search', title: '正在获取下载链接...', subtitle: message, cancellable: true };
    case AppState.DOWNLOADING:
      return { expanded: true, kind: 'progress', title: '正在抓取章节内容', subtitle: message, cancellable: true };
    case AppState.PARSING:
      return { expanded: true, kind: 'progress', title: '正在解析章节...', subtitle: message, cancellable: true };
    case AppState.PACKING:
      return { expanded: true, kind: 'packing', title: '正在打包 EPUB...', subtitle: message, cancellable: true };
    case AppState.ERROR:
      return { expanded: true, kind: 'error', title: '出现错误', subtitle: message, cancellable: false };
    default:
      // 详情页：折叠态就是“返回搜索结果”。删掉浮动返回按钮后，这里是唯一的返回入口，
      // 所以不能留空壳，得有图标 + 文字喵~
      if (canGoBack) {
        return {
          expanded: false,
          kind: 'back',
          title: '',
          cancellable: false,
          idleLabel: '返回搜索结果',
          idleIcon: 'back',
        };
      }
      return {
        expanded: false,
        kind: 'idle',
        title: '',
        cancellable: false,
        idleLabel: '搜书',
        idleIcon: 'search',
      };
  }
};

/** 状态 → 辉光色。注入成 --island-tone，CSS 侧只认这一个变量喵~ */
const TONE: Record<IslandKind, string> = {
  idle: 'transparent',
  back: 'var(--highlight-glow)',
  search: 'var(--accent-glow)',
  progress: 'var(--highlight-glow)',
  packing: 'var(--highlight-glow)',
  success: 'var(--state-success-border)',
  error: 'var(--state-danger-border)',
};

const LONG_PRESS_MS = 500;
const SUCCESS_HOLD_MS = 8000;

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const IslandStatusIcon = memo(({ model, progress }: {
  model: StatusModel;
  progress: number;
}) => {
  if (model.kind === 'search') return <Loader2 className="dynamic-island__spinner" size={22} aria-hidden="true" />;
  if (model.kind === 'packing') return <HardDriveDownload size={23} aria-hidden="true" />;
  if (model.kind === 'success') return <CheckCircle2 className="dynamic-island__draw" size={24} aria-hidden="true" />;
  if (model.kind === 'error') return <CircleX size={22} aria-hidden="true" />;

  if (model.kind === 'progress') {
    const safeProgress = clampPercent(progress);
    return (
      <span className="dynamic-island__progress" style={{ '--island-progress': safeProgress } as React.CSSProperties}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="dynamic-island__progress-track" cx="18" cy="18" r="15" />
          <circle className="dynamic-island__progress-value" cx="18" cy="18" r="15" />
        </svg>
        <span className="dynamic-island__percent">{safeProgress}%</span>
      </span>
    );
  }

  return null;
});

const DynamicIslandComponent: React.FC<DynamicIslandProps> = ({
  state,
  progress,
  message,
  title,
  canGoBack = false,
  compact = false,
  onClick,
  onIconClick,
  onCancel,
}) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  // 交替的弹跳 class：切换 animation-name 才能重放动画，且**不能重挂载外壳**
  // （重挂载会把 width/height 过渡一起打断，尺寸会直接跳）喵~
  const [bounceTick, setBounceTick] = useState(0);
  const pressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  // COMPLETE → 展示成功态；软超时后收回（点击外壳可提前确认）
  useLayoutEffect(() => {
    if (state !== AppState.COMPLETE) {
      setShowSuccess(false);
      return;
    }
    setShowSuccess(true);
    const timer = window.setTimeout(() => setShowSuccess(false), SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const model = useMemo(
    () => getStatusModel(state, showSuccess, message, canGoBack),
    [state, showSuccess, message, canGoBack],
  );

  const safeProgress = clampPercent(progress);

  // 状态变化 → 外壳弹跳一次（含空闲 → 第一个状态）
  useEffect(() => {
    if (!model.expanded) return;
    setBounceTick((tick) => tick + 1);
  }, [model.kind, model.expanded]);

  // 任务结束 / 转成不可取消的状态 → 面板自动收起
  useEffect(() => {
    if (!model.expanded || !model.cancellable) setPanelOpen(false);
  }, [model.expanded, model.cancellable]);

  useEffect(() => {
    if (!model.expanded) return;

    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    suppressClickRef.current = false;
    setPressing(false);
  }, [model.expanded]);

  useEffect(() => () => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
  }, []);

  const cancelPress = useCallback(() => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setPressing(false);
  }, []);

  const startPress = useCallback(() => {
    if (model.expanded) return;
    suppressClickRef.current = false;
    setPressing(true);
    pressTimerRef.current = window.setTimeout(() => {
      // 视图只剩小说一个，长按不再展开切换面板，只重置到搜索首页
      suppressClickRef.current = true;
      pressTimerRef.current = null;
      setPressing(false);
      onIconClick?.('novel');
    }, LONG_PRESS_MS);
  }, [model.expanded, onIconClick]);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // 展开态 + 可取消：点击是「展开/收起面板」，不再抢「回到顶部」
    if (model.expanded && model.cancellable) {
      setPanelOpen((open) => !open);
      return;
    }
    onClick?.();
  }, [model.expanded, model.cancellable, onClick]);

  const handleCancel = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setPanelOpen(false);
    onCancel?.();
  }, [onCancel]);

  return (
    <div className={`dynamic-island dynamic-island--${model.kind}`}>
      <div className="dynamic-island__anchor">
        {!model.expanded && (
          <button
            type="button"
            className="dynamic-island__hitpad"
            onClick={handleClick}
            onPointerDown={startPress}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            aria-label={model.idleLabel ?? '回到搜索'}
          />
        )}

        <button
          type="button"
          className={[
            'dynamic-island__shell',
            `dynamic-island__shell--${model.kind}`,
            model.expanded ? 'dynamic-island__shell--expanded' : '',
            model.expanded ? 'dynamic-island__shell--anim' : '',
            !model.expanded && compact ? 'dynamic-island__shell--compact' : '',
            pressing ? 'dynamic-island__shell--pressing' : '',
          ].filter(Boolean).join(' ')}
          data-bounce={bounceTick % 2}
          style={{ '--island-tone': TONE[model.kind] } as React.CSSProperties}
          onClick={handleClick}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          aria-label={model.expanded ? model.title : (model.idleLabel ?? '回到搜索')}
          aria-expanded={model.cancellable ? panelOpen : undefined}
        >
          <span className="dynamic-island__press-ring" aria-hidden="true" />

          {/* 折叠态：图标 + 文字常显。原来那条 56×5 白条纯装饰、看着像卡住的进度条，
              而且只在 :hover 才换成提示——触屏上永远只见白条，等于没有信息喵~ */}
          {!model.expanded && (
            <span className="dynamic-island__hint">
              {model.idleIcon === 'back'
                ? <ChevronLeft size={14} aria-hidden="true" />
                : <Search size={13} aria-hidden="true" />}
            <span className="dynamic-island__hint-text">{model.idleLabel}</span>            </span>
          )}

          <span className="dynamic-island__content">
            <span className="dynamic-island__status-icon">
              <IslandStatusIcon model={model} progress={progress} />
            </span>
            <span className="dynamic-island__copy">
              <span className="dynamic-island__title">
                {model.title}
              </span>
              {model.subtitle && <span className="dynamic-island__subtitle">{model.subtitle}</span>}
            </span>
            {model.cancellable && (
              <span className="dynamic-island__chevron" aria-hidden="true">
                <ChevronDown size={15} />
              </span>
            )}
          </span>
        </button>

        {/* 屏幕阅读器播报：单独放一层，避免嵌在 button 里被吞掉 */}
        <span className="dynamic-island__sr" role="status" aria-live="polite">
          {model.title}{model.subtitle ? `，${model.subtitle}` : ''}
        </span>

        <div
          className={`dynamic-island__panel${panelOpen ? ' dynamic-island__panel--open' : ''}`}
          aria-hidden={!panelOpen}
        >
          <span className="dynamic-island__panel-title">
            <Download size={13} aria-hidden="true" />
            {title || model.title}
          </span>

          <span className="dynamic-island__panel-bar" aria-hidden="true">
            <span
              className="dynamic-island__panel-fill"
              style={{ '--island-fill': safeProgress } as React.CSSProperties}
            />
          </span>

          <span className="dynamic-island__panel-meta">
            <span className="dynamic-island__panel-percent">{safeProgress}%</span>
            <span className="dynamic-island__panel-msg">{message || model.subtitle || '处理中...'}</span>
          </span>

          <button
            type="button"
            className="dynamic-island__panel-cancel"
            onClick={handleCancel}
            disabled={!onCancel}
          >
            <Ban size={13} aria-hidden="true" />
            取消下载
          </button>
        </div>
      </div>
    </div>
  );
};

export const DynamicIsland = memo(DynamicIslandComponent);
export default DynamicIsland;
