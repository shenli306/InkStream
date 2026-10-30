import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Download, ArrowRight, Loader2, Globe, FileText, CheckCircle2, AlertCircle, ArrowUp } from 'lucide-react';
import { Novel, AppState } from './types';
import {
  searchNovel,
  getNovelDetails,
  downloadAndParseNovel,
  fetchBlob,
  registerAbortSignal,
  clearAbortSignal,
  isDownloadCancelled,
} from './services/source';
import { generateEpub } from './services/epub';
import { DynamicIsland } from './components/DynamicIsland';
import { CuteProgress } from './components/CuteProgress';
import { BookCard } from './components/BookCard';
import { Reader } from './components/Reader';
import { SourceSelector } from './components/SourceSelector';

import { resolveCoverUrl } from './utils/cover';

export default function App() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [searchResults, setSearchResults] = useState<Novel[]>([]);
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // 设备类型不再靠 UA 嗅探：UA 判断在 SSR 首帧恒为 false，会让桌面分支先渲染一次再跳变。
  // 尺寸相关的分档全部交给 CSS（sm:/md:/max-sm:）与 @media (pointer: coarse)。
  // 3068 书源选择模式喵~
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [searchBoxTransform, setSearchBoxTransform] = useState({ scale: 1, opacity: 1, borderRadius: '2rem' });

  // 手机上就是「空首屏」那一种状态：没有结果、没进详情、没开书源面板。
  // 只有这一种情况让 hero 在可视区里垂直居中；一有内容就回到顶部对齐，
  // 否则内容比屏幕高时 flex 居中会把顶部推出可视区且滚不到。
  const isHomeIdle =
    state === AppState.IDLE && !selectedNovel && searchResults.length === 0 && !showSourceSelector;
  
  const resolvedCoverUrl = resolveCoverUrl(selectedNovel?.coverUrl);
  
  // sourceKey is now internal and defaults to 'auto' for unified search
  const sourceKey = 'auto';

  // Progress Tracking
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const searchRequestIdRef = useRef(0);
  // 下载/抓取任务的取消信号：灵动岛面板上的「取消下载」就是 abort 它喵~
  const downloadAbortRef = useRef<AbortController | null>(null);
  const downloadProgressFrameRef = useRef<number | null>(null);
  const pendingDownloadProgressRef = useRef<{ message: string; percent: number } | null>(null);
  const parsingStateShownRef = useRef(false);

  const flushDownloadProgress = useCallback(() => {
    downloadProgressFrameRef.current = null;
    const pending = pendingDownloadProgressRef.current;
    pendingDownloadProgressRef.current = null;
    if (!pending) return;

    setProgressMessage(pending.message);
    setProgressPercent(pending.percent);
    if (pending.percent > 40 && !parsingStateShownRef.current) {
      parsingStateShownRef.current = true;
      setState(AppState.PARSING);
    }
  }, []);

  const queueDownloadProgress = useCallback((message: string, percent: number) => {
    pendingDownloadProgressRef.current = { message, percent };
    if (downloadProgressFrameRef.current === null) {
      downloadProgressFrameRef.current = window.requestAnimationFrame(flushDownloadProgress);
    }
  }, [flushDownloadProgress]);

  const cancelPendingDownloadProgress = useCallback(() => {
    if (downloadProgressFrameRef.current !== null) {
      window.cancelAnimationFrame(downloadProgressFrameRef.current);
      downloadProgressFrameRef.current = null;
    }
    pendingDownloadProgressRef.current = null;
  }, []);

  useEffect(() => cancelPendingDownloadProgress, [cancelPendingDownloadProgress]);

  // 卸载时把在途任务掐掉，免得 setState 打到已卸载的组件上喵~
  useEffect(() => () => {
    downloadAbortRef.current?.abort();
    clearAbortSignal(null);
  }, []);

  /** 取消当前任务：掐信号 + 清进度 + 回到预览态（不是错误）喵~ */
  const cancelDownload = useCallback(() => {
    downloadAbortRef.current?.abort();
    cancelPendingDownloadProgress();
    parsingStateShownRef.current = false;
    setProgressPercent(0);
    setProgressMessage('已取消下载');
    setState(AppState.PREVIEW);
  }, [cancelPendingDownloadProgress]);

  // Reader State
  const [readingChapterIndex, setReadingChapterIndex] = useState<number | null>(null);

  // Scroll-to-top state
  const [showScrollTop, setShowScrollTop] = useState(false);
  // 滚动后把灵动岛收成小圆标：岛是 fixed 的，详情页正文会从它下面滚过去，
  // 不收起来就会一直切掉书名的上半截喵~
  const [islandCompact, setIslandCompact] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
      setIslandCompact(window.scrollY > 120);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // —— 布局探针：`NEXT_PUBLIC_DEV_PROBE=1` + ?probe=detail|reader 才生效 ——
  // 搜索结果得真联网抓外部书源，离线环境验不了详情页和阅读器，
  // 这里用固定数据把真实组件树灌满，给 .mobile-audit/audit.mjs 做移动端验收用。
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_DEV_PROBE !== '1') return;
    const probe = new URLSearchParams(window.location.search).get('probe');
    if (!probe) return;
    const chapters = Array.from({ length: 60 }, (_, i) => ({
      number: i + 1,
      title: `第${i + 1}章 ${['风起', '夜行', '旧约', '长灯', '归途'][i % 5]}的试炼与漫长的告别`,
      url: `https://example.com/chapter/${i + 1}`,
      content:
        `　　这是第 ${i + 1} 章的正文。` +
        '夜色像墨一样漫过窗棂，灯芯哔剥一响，纸页上的字便跟着亮了亮。他忽然想起许多年前的那个黄昏，' +
        '风从山脚一路卷上来，把整条街的尘土都吹成了金色的雾。'.repeat(14),
    }));
    const novel: Novel = {
      id: 'probe-novel',
      title: '长夜将尽时的一段很长的小说标题',
      author: '试读作者',
      description: '这里是一段用来验证移动端排版的简介，长度接近真实书源返回的简介。'.repeat(16),
      tags: ['仙侠', '群像', '慢热'],
      status: 'Serializing',
      detailUrl: 'https://example.com/novel/1',
      chapters,
      sourceName: '示例书源 | 备用书源',
    };
    setSearchResults([novel]);
    setSelectedNovel(novel);
    setState(AppState.PREVIEW);
    if (probe === 'reader') setReadingChapterIndex(0);
  }, []);

  // 回到首页：重置搜索相关状态
  const resetToHome = useCallback(() => {
    searchRequestIdRef.current += 1;
    setQuery('');
    setSearchResults([]);
    setSelectedNovel(null);
    setError(null);
    setState(AppState.IDLE);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ([AppState.SEARCHING, AppState.ANALYZING, AppState.DOWNLOADING, AppState.PARSING, AppState.PACKING].includes(state)) return;
    if (!query.trim()) return;

    // 3068 书源选择模式喵~
    if (query.trim() === '3068') {
      searchRequestIdRef.current += 1;
      setQuery('');
      // 动画：搜索框从两边往中间回缩成圆
      setSearchBoxTransform({ scale: 0.08, opacity: 0, borderRadius: '50%' });
      
      // 等待收缩动画完成后显示书源选择器
      setTimeout(() => {
        setShowSourceSelector(true);
      }, 280);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setProgressPercent(0);
    setProgressMessage('');
    setState(AppState.SEARCHING);
    setError(null);
    setSearchResults([]);
    setSelectedNovel(null);
    
    // 正常搜索流程喵~
    try {
      const results = await searchNovel(query, sourceKey);
      if (requestId !== searchRequestIdRef.current) return;
      if (results.length === 0) {
        setError("未找到相关小说，请更换关键词或检查小说名是否正确。");
        setState(AppState.IDLE);
      } else {
        setSearchResults(results);
        setState(AppState.PREVIEW);

        // Background enrich: Fetch descriptions (sequentially to avoid overwhelming server)
        (async () => {
          for (const novel of results) {
            if (requestId !== searchRequestIdRef.current) return;
            // 如果小说简介不完整，或者是笔趣阁源（通常需要二次抓取），则进行后台补充
            const needsEnrich = !novel.description || !novel.coverUrl || novel.sourceName?.includes('笔趣阁');
            
            if (!needsEnrich) continue;
            
            try {
              const details = await getNovelDetails(novel);
              if (requestId !== searchRequestIdRef.current) return;
              setSearchResults(prev => prev.map(n => n.id === novel.id ? { ...n, ...details } : n));
              // Small delay to be nice to the server
              await new Promise(r => setTimeout(r, 200));
            } catch (e) {
              console.warn("Background enrich failed for", novel.title, e);
            }
          }
        })();
      }
    } catch (err: any) {
      if (requestId !== searchRequestIdRef.current) return;
      console.error(err);
      setError(err.message || "搜索服务暂时不可用，请稍后重试。");
      setState(AppState.IDLE);
    }
  };

  const handleSelectNovel = async (novel: Novel) => {
    setScrollPosition(window.scrollY);
    setSelectedNovel(novel);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-fetch details to get description and chapters
    if (!novel.description || !novel.chapters || novel.chapters.length === 0) {
      try {
        console.log(`[App] Auto-fetching details for ${novel.title}喵~`);
        const detailed = await getNovelDetails(novel);
        setSelectedNovel(prev => prev && prev.id === novel.id ? detailed : prev);
      } catch (e) {
        console.warn("Auto-fetch details failed", e);
      }
    }
  };

  const startDownloadProcess = async () => {
    if (!selectedNovel) return;

    cancelPendingDownloadProgress();
    // 上一轮没结束的任务先作废，再挂一个新的取消信号喵~
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    registerAbortSignal(controller.signal);
    parsingStateShownRef.current = false;
    setProgressPercent(0);
    setProgressMessage("\u6b63\u5728\u5206\u6790\u4e66\u7c4d\u4fe1\u606f...");
    setState(AppState.ANALYZING);
    setError(null);

    try {
      // 0. If Local Novel, just download directly
      if (selectedNovel.sourceName === '本地书库' && selectedNovel.detailUrl) {
        const a = document.createElement('a');
        a.href = selectedNovel.detailUrl;
        a.download = selectedNovel.id; // filename
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setProgressPercent(100);
        setProgressMessage("\u4e0b\u8f7d\u5b8c\u6210\uff0c\u5df2\u4fdd\u5b58\u81f3\u4e0b\u8f7d\u76ee\u5f55");
        setState(AppState.COMPLETE);
        return;
      }

      // 1. Get Detailed Metadata & Download Link
      let novelWithLink = selectedNovel;
      // Force fetch details if description is missing (likely incomplete data) or chapters are empty
      if (!novelWithLink.description || !novelWithLink.chapters || novelWithLink.chapters.length === 0) {
        setProgressMessage("正在分析书籍信息...");
        setProgressPercent(5);
        try {
            novelWithLink = await getNovelDetails(selectedNovel);
        } catch (e) {
            console.error("Failed to get details", e);
            throw new Error("无法获取书籍详情，请稍后重试");
        }
      }

      // 2. Download & Parse
      setState(AppState.DOWNLOADING);
      const fullNovel = await downloadAndParseNovel(novelWithLink, queueDownloadProgress, controller.signal);
      cancelPendingDownloadProgress();
      if (controller.signal.aborted) return;

      setSelectedNovel(fullNovel); // Update with chapters

      // Update with chapters

      // ... (existing code)

      if (controller.signal.aborted) return;

      // 3. Pack EPUB
      const MIN_PACKING_MS = 900; // 打包档最短停留：小书 EPUB 生成只要 ~100ms，340→268 的形变走不完就被 success 顶掉（实测 PACKING 只存在 107ms）喵~
      const packingStartedAt = Date.now();
      setState(AppState.PACKING);
      setProgressMessage("正在生成 EPUB 文件...");

      // Try to fetch cover
      let coverBlob: Blob | undefined;
      if (fullNovel.coverUrl) {
        try {
          setProgressMessage("正在下载封面...");
          coverBlob = await fetchBlob(fullNovel.coverUrl);
        } catch (e) {
          console.warn("Cover download failed", e);
        }
      }

      setProgressMessage("正在打包 EPUB...");
      const epubBlob = await generateEpub(fullNovel, coverBlob);

      const safeTitle = fullNovel.title.replace(/[\\/:*?"<>|]/g, "_") || "download";
      const filename = `${safeTitle}.epub`;

      // Download Trigger
      const url = URL.createObjectURL(epubBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (controller.signal.aborted) return;


      // 打包档兜底停留：让 268×52 的打包形态真的被看见（取消下载在停留期间仍然有效）喵~
      const packingElapsed = Date.now() - packingStartedAt;
      if (packingElapsed < MIN_PACKING_MS) {
        await new Promise((r) => setTimeout(r, MIN_PACKING_MS - packingElapsed));
      }
      if (controller.signal.aborted) return;
      setState(AppState.COMPLETE);
      setProgressMessage("下载完成，已保存至下载目录");

    } catch (e: any) {
      cancelPendingDownloadProgress();

      // 用户取消：不算错误，安静回到预览态喵~
      if (isDownloadCancelled(e) || controller.signal.aborted) {
        setProgressPercent(0);
        setProgressMessage('已取消下载');
        setState(AppState.PREVIEW);
        return;
      }

      console.error(e);
      setError(e.message || "处理过程中发生错误");
      setState(AppState.PREVIEW);
    } finally {
      clearAbortSignal(controller.signal);
      if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
    }
  };

  // 离开详情：回到搜索结果，并回到进来之前的滚动位置。
  // 这是原来那个浮动返回按钮的行为，现在由灵动岛承担，所以两边必须一致。
  const leaveDetail = useCallback(() => {
    setSelectedNovel(null);
    setState(AppState.PREVIEW);
    setTimeout(() => window.scrollTo({ top: scrollPosition, behavior: 'smooth' }), 50);
  }, [scrollPosition]);

  const handleIslandClick = useCallback(() => {
    // 详情页（含完成态）：岛就是返回入口，直接回搜索结果
    if (selectedNovel) {
      leaveDetail();
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedNovel, leaveDetail]);

  // 长按岛：回到首页（清掉本次搜索与结果）。详情页里长按仍先回详情态的搜索结果。
  const handleIslandLongPress = useCallback(() => {
    if (selectedNovel) {
      leaveDetail();
      return;
    }
    resetToHome();
  }, [selectedNovel, leaveDetail, resetToHome]);

  return (
    <div
      className="relative min-h-dvh flex flex-col overflow-x-hidden text-content-primary"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 4.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2.5rem)'
      }}
    >

      {/* 水墨点缀：黑白墨色在暗底上浮动 */}
      <div className="ink-decoration" aria-hidden="true" />

      {/* 阅读态是整屏浮层，岛上那条药丸会盖住阅读器标题，阅读时收起 */}
      {readingChapterIndex === null && (
        <DynamicIsland
          state={state}
          progress={progressPercent}
          message={progressMessage}
          title={selectedNovel?.title}
          canGoBack={Boolean(selectedNovel)}
          compact={islandCompact}
          onClick={handleIslandClick}
          onIconClick={handleIslandLongPress}
          onCancel={cancelDownload}
        />
      )}

      {/* Reader Modal */}
      {selectedNovel && readingChapterIndex !== null && (
        <Reader
          title={selectedNovel.title}
          chapter={selectedNovel.chapters[readingChapterIndex]}
          onClose={() => setReadingChapterIndex(null)}
          onNext={() => setReadingChapterIndex(prev => (prev !== null && prev < selectedNovel.chapters.length - 1) ? prev + 1 : prev)}
          onPrev={() => setReadingChapterIndex(prev => (prev !== null && prev > 0) ? prev - 1 : prev)}
          hasNext={readingChapterIndex < selectedNovel.chapters.length - 1}
          hasPrev={readingChapterIndex > 0}
          isLoading={false}
          chapters={selectedNovel.chapters}
          currentIndex={readingChapterIndex}
          onJumpTo={(idx) => setReadingChapterIndex(idx)}
        />
      )}

      <main className={`relative w-full max-w-5xl mx-auto px-4 sm:px-6 pt-2 sm:pt-24 pb-16 sm:pb-24 flex flex-col items-center flex-1 ${isHomeIdle ? 'max-sm:justify-center' : ''}`}>

        {/* 小说搜索界面 */}
        <>
            {/* Header */}
            <div className={`text-center ${state !== AppState.IDLE ? 'scale-75 opacity-50 mb-4' : 'mb-6 sm:mb-12'}`} style={{ transition: 'transform 400ms cubic-bezier(0.4,0,0.2,1), opacity 400ms cubic-bezier(0.4,0,0.2,1)' }}>
              <h1 className="heading-display text-gradient-heading mb-3 sm:mb-4 text-4xl sm:text-5xl md:text-6xl lg:text-8xl">
                InkStream
              </h1>
              <p className="text-content-tertiary font-light max-w-xl mx-auto flex items-center justify-center gap-2 text-sm sm:text-xl">
                全网搜书 · 智能分章 · EPUB 打包
              </p>
            </div>

            {/* Search Input */}
            {state !== AppState.DOWNLOADING && state !== AppState.PARSING && state !== AppState.PACKING && !showSourceSelector && (
              <div className="w-full max-w-2xl z-20 mb-6 sm:mb-12 flex flex-col items-center gap-6">
                <form onSubmit={handleSearch} className="w-full relative group">
                  <div className="search-box-glow group-hover:opacity-40 transition-opacity duration-500"></div>
                  <div 
                    className="search-box p-2 flex items-center gpu-accelerated"
                    style={{ 
                      transform: `scale(${searchBoxTransform.scale})`,
                      opacity: searchBoxTransform.opacity,
                      borderRadius: searchBoxTransform.borderRadius,
                      transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1), opacity 300ms cubic-bezier(0.4,0,0.2,1), border-radius 300ms cubic-bezier(0.4,0,0.2,1)',
                    }}
                  >
                    <Search className="ml-3 sm:ml-5 shrink-0 text-content-tertiary w-5 h-5 sm:w-6 sm:h-6" />
                    <input
                      type="text"
                      name="search"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="search"
                      aria-label="小说名"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="输入小说名"
                      className="w-full min-w-0 bg-transparent border-none outline-none px-3 py-3 text-[16px] sm:px-4 sm:py-4 sm:text-lg text-content-primary placeholder:text-content-disabled font-medium"
                    />

                    <button
                      type="submit"
                      disabled={state === AppState.SEARCHING}
                      aria-label="搜索"
                      className="shrink-0 inline-flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto sm:px-8 sm:py-3 bg-content-primary text-content-inverse rounded-pill font-bold hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:scale-100 gpu-accelerated"
                      style={{ transition: 'transform 150ms cubic-bezier(0.4,0,0.2,1), opacity 250ms cubic-bezier(0.4,0,0.2,1)' }}
                    >
                      {state === AppState.SEARCHING ? <Loader2 className="animate-spin w-4 h-4 sm:w-5 sm:h-5" /> : <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>
                  </div>
                </form>

                {error && (
                  <div role="alert" aria-live="polite" className="mt-4 flex flex-col items-center justify-center gap-2 text-state-danger bg-state-danger/10 py-3 px-6 rounded-lg border border-state-danger/30 animate-enter-fade max-w-lg mx-auto text-center">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} />
                      <span className="text-sm font-medium">{error}</span>
                    </div>
                    <span className="text-xs text-state-danger/60">如果是网络问题，请尝试点击搜索按钮重试</span>
                  </div>
                )}
              </div>
            )}

            {/* 3068 Source Selector Animation 喵~ */}
            {showSourceSelector && (
              <div className="w-full max-w-2xl z-20 mb-6 sm:mb-12 flex flex-col items-center gap-6">
                <SourceSelector 
                  onConfirm={() => {
                    setShowSourceSelector(false);
                    setSearchBoxTransform({ scale: 1, opacity: 1, borderRadius: '4rem' });
                  }}
                  onCancel={() => {
                    setShowSourceSelector(false);
                    setSearchBoxTransform({ scale: 1, opacity: 1, borderRadius: '4rem' });
                  }}
                />
              </div>
            )}

            {/* Selected Novel Detail View */}
            {selectedNovel && (state === AppState.PREVIEW || state === AppState.ANALYZING || state === AppState.DOWNLOADING || state === AppState.PARSING || state === AppState.PACKING || state === AppState.COMPLETE) && (
              <div className="w-full mt-2 sm:mt-4 mb-16 sm:mb-20 animate-enter-slide-up gpu-accelerated" style={{ willChange: 'transform, opacity' }}>
                <div className="glass-panel p-5 sm:p-8 md:p-12 relative overflow-hidden">

              {/* Detail Layout */}
              <div className="flex flex-col md:flex-row gap-6 sm:gap-8 md:gap-12 relative z-10">
                {/* Cover Mockup */}
                <div className="w-full md:w-1/3 flex flex-col items-center">
                  <div className="w-36 sm:w-48 aspect-[2/3] bg-gradient-to-br from-raised to-elevated rounded-md shadow-lg flex items-center justify-center border border-subtle mb-5 sm:mb-8 relative overflow-hidden group">
                    {resolvedCoverUrl ? (
                      <img 
                        src={resolvedCoverUrl} 
                        alt={selectedNovel.title}
                        width={192}
                        height={288}
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-t from-elevated/90 to-transparent flex items-center justify-center">
                        <span className="text-4xl font-serif text-content-disabled">书</span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  {state === AppState.PREVIEW || state === AppState.COMPLETE ? (
                    <button
                      onClick={startDownloadProcess}
                      className="w-full btn-primary py-3.5 sm:py-4 text-base sm:text-lg hover:scale-[1.02] active:scale-95 focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      <Download size={20} />
                      {selectedNovel.sourceName === '本地书库' ? "下载本地文件" : (state === AppState.COMPLETE ? "下载完成 (点击再次下载)" : "开始抓取并打包")}
                    </button>
                  ) : (
                    <CuteProgress state={state} progress={progressPercent} message={progressMessage} />
                  )}
                  <button
                    onClick={() => { 
                      setSelectedNovel(null); 
                      setState(AppState.PREVIEW); 
                      setTimeout(() => window.scrollTo({ top: scrollPosition, behavior: 'smooth' }), 50);
                    }}
                    className="mt-1 sm:mt-4 inline-flex items-center justify-center min-h-11 px-4 text-content-tertiary text-sm hover:text-content-primary hover:underline transition-all"
                  >
                    返回搜索结果
                  </button>
                </div>

                {/* Metadata */}
                <div className="flex-1 space-y-5 sm:space-y-8">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`badge ${selectedNovel.status === 'Completed' ? 'badge--success' : 'badge--warning'}`}>
                        {selectedNovel.status === 'Completed' ? '已完结' : selectedNovel.status === 'Serializing' ? '连载中' : '未知状态'}
                      </span>
                      <span className="badge badge--accent">TXT直连</span>
                    </div>
                    <h2 className="heading-1 mb-2">{selectedNovel.title}</h2>
                    <p className="text-lg sm:text-xl text-accent mb-4">{selectedNovel.author}</p>

                    {/* Tags 喵~ */}
                    {selectedNovel.tags && selectedNovel.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-6">
                        {selectedNovel.tags.map((tag, i) => (
                          <span key={i} className="badge badge--highlight">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="body-text custom-scrollbar sm:max-h-32 sm:overflow-y-auto">
                    <p>{selectedNovel.description || "正在加载简介..."}</p>
                  </div>

                  <div className="bg-raised rounded-lg p-4 sm:p-6 border border-faint">
                    <h3 className="text-content-primary font-bold mb-4 flex items-center gap-2">
                      <Globe size={16} className="text-accent" />
                      数据来源
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-content-tertiary surface-elevated px-3 py-1.5 rounded-sm flex flex-wrap gap-2">
                        {selectedNovel.sourceName?.split(' | ').map((s, i) => (
                          <span key={i} className="badge badge--accent">{s}</span>
                        )) || '未知书源'}
                      </span>
                      <span className="text-xs text-state-success/70">
                        已验证可用
                      </span>
                    </div>
                  </div>

                  {/* Chapter Preview - Only visible after parsing */}
                  {selectedNovel.chapters.length > 0 && (
                    <div className="animate-enter-fade">
                      <h3 className="text-content-primary font-bold mb-4 flex items-center gap-2">
                        <FileText size={16} className="text-accent" />
                        章节列表 (共 {selectedNovel.chapters.length} 章)
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] sm:max-h-[300px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
                        {selectedNovel.chapters.slice(0, 50).map((c, idx) => (
                          <button
                            key={`${c.url}-${idx}`}
                            onClick={() => setReadingChapterIndex(idx)}
                            className="flex items-center justify-between p-3 rounded-sm surface-elevated text-sm text-content-secondary hover:bg-hover hover:text-content-primary transition-colors text-left"
                          >
                            <span className="truncate">{c.title}</span>
                            <CheckCircle2 size={14} className="text-state-success shrink-0" />
                          </button>
                        ))}
                        {selectedNovel.chapters.length > 50 && (
                          <div className="col-span-full text-center text-xs text-content-disabled py-2">
                            ... 剩余 {selectedNovel.chapters.length - 50} 章 ...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Results List (Grid) */}
        {!selectedNovel && searchResults.length > 0 && (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-enter-slide-up">
            {searchResults.map((item, idx) => (
              <BookCard key={`${item.id}-${idx}-${item.sourceName}`} novel={item} onSelect={handleSelectNovel} />
            ))}
          </div>
        )}
      </>
      </main>

      {/* 回到顶部按钮 */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="app-scroll-top fixed z-40 p-3.5 sm:p-4 surface-glass-strong rounded-pill text-content-primary shadow-lg hover:border-accent/40 hover:text-accent transition-all duration-300 hover:scale-110 active:scale-95 gpu-accelerated animate-scale-in"
          aria-label="回到顶部"
          style={{
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
          }}
        >
          <ArrowUp size={20} />
        </button>
      )}

    </div>
  );
}



