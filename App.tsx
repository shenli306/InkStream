import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Download, ArrowRight, Loader2, Globe, FileText, CheckCircle2, AlertCircle, ChevronLeft, ArrowUp } from 'lucide-react';
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
  
  // 检测设备类型
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  }, []);
  
  // 3068 书源选择模式喵~
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [searchBoxTransform, setSearchBoxTransform] = useState({ scale: 1, opacity: 1, borderRadius: '2rem' });
  
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
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const handleIslandClick = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (state === AppState.PREVIEW || state === AppState.COMPLETE || state === AppState.IDLE) {
      setSelectedNovel(null);
      if (state === AppState.COMPLETE) setState(AppState.PREVIEW);
    }
  }, [state]);

  return (
    <div
      className="min-h-screen relative overflow-x-hidden text-content-primary pb-20 pt-20 sm:pt-32"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)'
      }}
    >

      {/* 水墨点缀：黑白墨色在暗底上浮动 */}
      <div className="ink-decoration" aria-hidden="true" />

      <DynamicIsland
        state={state}
        progress={progressPercent}
        message={progressMessage}
        title={selectedNovel?.title}
        onClick={handleIslandClick}
        onIconClick={resetToHome}
        onCancel={cancelDownload}
      />

      {/* Back Button */}
      {selectedNovel && (
        <button
          onClick={() => { 
            setSelectedNovel(null); 
            setState(AppState.PREVIEW); 
            setTimeout(() => window.scrollTo({ top: scrollPosition, behavior: 'smooth' }), 50);
          }}
          className="fixed z-40 p-3 surface-glass rounded-full text-content-secondary hover:text-content-primary transition-all hover:scale-110 active:scale-95 group"
          style={{
            top: 'calc(env(safe-area-inset-top) + 1.5rem)',
            left: 'calc(env(safe-area-inset-left) + 1.5rem)'
          }}
          title="返回搜索"
        >
          <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
        </button>
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

      <main className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-32 flex flex-col items-center min-h-[80vh]">

        {/* 小说搜索界面 */}
        <>
            {/* Header */}
            <div className={`text-center ${state !== AppState.IDLE ? 'scale-75 opacity-50 mb-4' : isMobile ? 'mb-8' : 'mb-12'}`} style={{ transition: 'transform 400ms cubic-bezier(0.4,0,0.2,1), opacity 400ms cubic-bezier(0.4,0,0.2,1)' }}>
              <h1 className={`heading-display text-gradient-heading mb-4 ${isMobile ? 'text-4xl sm:text-5xl' : 'text-6xl md:text-8xl'}`}>
                InkStream
              </h1>
              <p className={`text-content-tertiary font-light max-w-xl mx-auto flex items-center justify-center gap-2 ${isMobile ? 'text-sm sm:text-base' : 'text-xl'}`}>
                全网搜书 · 智能分章 · EPUB 打包
              </p>
            </div>

            {/* Search Input */}
            {state !== AppState.DOWNLOADING && state !== AppState.PARSING && state !== AppState.PACKING && !showSourceSelector && (
              <div className="w-full max-w-2xl z-20 mb-12 flex flex-col items-center gap-6">
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
                    <Search className={isMobile ? "ml-3 text-content-tertiary" : "ml-5 text-content-tertiary"} size={isMobile ? 20 : 24} />
                    <input
                      type="text"
                      name="search"
                      autoComplete="off"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="输入小说名"
                      className={`w-full bg-transparent border-none outline-none ${isMobile ? 'px-3 py-3 text-base' : 'px-4 py-4 text-lg'} text-content-primary placeholder:text-content-disabled font-medium`}
                    />

                    <button
                      type="submit"
                      disabled={state === AppState.SEARCHING}
                      className={`bg-content-primary text-content-inverse ${isMobile ? 'px-6 py-2' : 'px-8 py-3'} rounded-pill font-bold hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:scale-100 gpu-accelerated`}
                      style={{ transition: 'transform 150ms cubic-bezier(0.4,0,0.2,1), opacity 250ms cubic-bezier(0.4,0,0.2,1)' }}
                    >
                      {state === AppState.SEARCHING ? <Loader2 className="animate-spin" size={isMobile ? 16 : 20} /> : <ArrowRight size={isMobile ? 16 : 20} />}
                    </button>
                  </div>
                </form>

                {error && (
                  <div role="alert" aria-live="polite" className="mt-4 flex flex-col items-center justify-center gap-2 text-state-danger bg-state-danger/10 py-3 px-6 rounded-lg border border-state-danger/30 animate-in fade-in max-w-lg mx-auto text-center">
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
              <div className="w-full max-w-2xl z-20 mb-12 flex flex-col items-center gap-6">
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
              <div className="w-full mt-4 mb-20 animate-enter-slide-up gpu-accelerated" style={{ willChange: 'transform, opacity' }}>
                <div className="glass-panel p-8 md:p-12 relative overflow-hidden">

              {/* Detail Layout */}
              <div className="flex flex-col md:flex-row gap-12 relative z-10">
                {/* Cover Mockup */}
                <div className="w-full md:w-1/3 flex flex-col items-center">
                  <div className="w-48 aspect-[2/3] bg-gradient-to-br from-raised to-elevated rounded-md shadow-lg flex items-center justify-center border border-subtle mb-8 relative overflow-hidden group">
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
                      className="w-full btn-primary py-4 text-lg hover:scale-[1.02] active:scale-95 focus-visible:ring-2 focus-visible:ring-accent/50"
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
                    className="mt-4 text-content-tertiary text-sm hover:text-content-primary hover:underline transition-all"
                  >
                    返回搜索结果
                  </button>
                </div>

                {/* Metadata */}
                <div className="flex-1 space-y-8">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`badge ${selectedNovel.status === 'Completed' ? 'badge--success' : 'badge--warning'}`}>
                        {selectedNovel.status === 'Completed' ? '已完结' : selectedNovel.status === 'Serializing' ? '连载中' : '未知状态'}
                      </span>
                      <span className="badge badge--accent">TXT直连</span>
                    </div>
                    <h2 className="heading-1 mb-2">{selectedNovel.title}</h2>
                    <p className="text-xl text-accent mb-4">{selectedNovel.author}</p>

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

                  <div className="body-text max-h-32 overflow-y-auto custom-scrollbar">
                    <p>{selectedNovel.description || "正在加载简介..."}</p>
                  </div>

                  <div className="bg-raised rounded-lg p-6 border border-faint">
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
                    <div className="animate-in fade-in duration-500">
                      <h3 className="text-content-primary font-bold mb-4 flex items-center gap-2">
                        <FileText size={16} className="text-accent" />
                        章节列表 (共 {selectedNovel.chapters.length} 章)
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
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
          <div className={`w-full grid ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-6 animate-enter-slide-up`}>
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
          className="fixed z-40 bottom-8 right-8 p-4 surface-glass-strong rounded-pill text-content-primary shadow-lg hover:border-accent/40 hover:text-accent transition-all duration-300 hover:scale-110 active:scale-95 gpu-accelerated animate-scale-in"
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



