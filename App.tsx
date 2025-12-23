import React, { useState } from 'react';
import { Search, Download, ArrowRight, Loader2, Globe, FileText, CheckCircle2, AlertCircle, ChevronLeft } from 'lucide-react';
import { Novel, AppState } from './types';
import { searchNovel, getNovelDetails, downloadAndParseNovel, fetchBlob } from './services/source';
import { generateEpub } from './services/epub';
import { DynamicIsland } from './components/DynamicIsland';
import { CuteProgress } from './components/CuteProgress';
import { BookCard } from './components/BookCard';
import { Reader } from './components/Reader';

export default function App() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [searchResults, setSearchResults] = useState<Novel[]>([]);
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [error, setError] = useState<string | null>(null);
  // sourceKey is now internal and defaults to 'auto' for unified search
  const sourceKey = 'auto';

  // Progress Tracking
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Reader State
  const [readingChapterIndex, setReadingChapterIndex] = useState<number | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setState(AppState.SEARCHING);
    setError(null);
    setSearchResults([]);
    setSelectedNovel(null);

    try {
      const results = await searchNovel(query, sourceKey);
      if (results.length === 0) {
        setError("未找到相关小说，请更换关键词或检查小说名是否正确。");
        setState(AppState.IDLE);
      } else {
        setSearchResults(results);
        setState(AppState.PREVIEW);

        // Background enrich: Fetch descriptions (sequentially to avoid overwhelming server)
        (async () => {
          for (const novel of results) {
            if (novel.description && novel.coverUrl) continue;
            try {
              const details = await getNovelDetails(novel);
              setSearchResults(prev => prev.map(n => n.id === novel.id ? { ...n, ...details } : n));
              // Small delay to be nice to the server
              await new Promise(r => setTimeout(r, 500));
            } catch (e) {
              console.warn("Background enrich failed for", novel.title, e);
            }
          }
        })();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "搜索服务暂时不可用，请稍后重试。");
      setState(AppState.IDLE);
    }
  };

  const handleSelectNovel = async (novel: Novel) => {
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
        return;
      }

      // 1. Get Detailed Metadata & Download Link
      let novelWithLink = selectedNovel;
      if (!novelWithLink.chapters || novelWithLink.chapters.length === 0) {
        setProgressMessage("正在分析书籍信息...");
        setProgressPercent(5);
        novelWithLink = await getNovelDetails(selectedNovel);
      }

      // 2. Download & Parse
      setState(AppState.DOWNLOADING);
      const fullNovel = await downloadAndParseNovel(novelWithLink, (msg, percent) => {
        setProgressMessage(msg);
        setProgressPercent(percent);
        if (percent > 40) setState(AppState.PARSING);
      });

      setSelectedNovel(fullNovel); // Update with chapters

      // Update with chapters

      // ... (existing code)

      // 3. Pack EPUB
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

      // 4. Upload to Server (Local Library)
      setProgressMessage("正在保存至本地书库...");
      const safeTitle = fullNovel.title.replace(/[\\/:*?"<>|]/g, "_") || "download";
      const filename = `${safeTitle}.epub`;

      try {
        await fetch('/api/save-epub', {
          method: 'POST',
          headers: {
            'x-filename': encodeURIComponent(filename)
          },
          body: epubBlob
        });
      } catch (uploadErr) {
        console.warn("Failed to save to local library", uploadErr);
        // Continue to user download anyway
      }

      // 5. Download Trigger
      const url = URL.createObjectURL(epubBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setState(AppState.COMPLETE);
      setProgressMessage("下载完成，已保存至下载目录");

      // Delay alert slightly to allow UI update
      setTimeout(() => {
        alert("下载已完成！\n\n文件已保存至您的浏览器默认下载文件夹。\n同时也已保存至服务器 'downloads' 目录。");
      }, 500);

    } catch (e: any) {
      console.error(e);
      setError(e.message || "处理过程中发生错误");
      setState(AppState.PREVIEW);
    }
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden text-slate-100 pb-20">

      <DynamicIsland
        state={state}
        progress={progressPercent}
        message={progressMessage}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />

      {/* Back Button */}
      {selectedNovel && (
        <button
          onClick={() => { setSelectedNovel(null); setState(AppState.PREVIEW); }}
          className="fixed top-6 left-6 z-40 p-3 bg-black/20 backdrop-blur-xl rounded-full text-white/80 hover:bg-white/10 transition-all border border-white/10 hover:scale-110 active:scale-95 group"
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
        />
      )}

      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-900/20 rounded-full blur-[120px]" />
      </div>

      <main className="relative max-w-5xl mx-auto px-6 pt-32 flex flex-col items-center min-h-[80vh]">

        {/* Header */}
        <div className={`text-center transition-all duration-700 ${state !== AppState.IDLE ? 'scale-75 opacity-50 mb-4' : 'mb-12'}`}>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 drop-shadow-2xl mb-6">
            InkStream
          </h1>
          <p className="text-xl text-white/50 font-light max-w-xl mx-auto flex items-center justify-center gap-2">
            全网搜书 · 智能分章 · EPUB 打包
          </p>
        </div>

        {/* Search Input */}
        {state !== AppState.DOWNLOADING && state !== AppState.PARSING && state !== AppState.PACKING && (
          <div className="w-full max-w-2xl z-20 mb-12 flex flex-col items-center gap-6">
            <form onSubmit={handleSearch} className="w-full relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
              <div className="relative glass-input rounded-[2rem] p-2 flex items-center transition-all duration-300 focus-within:ring-2 focus-within:ring-white/20 focus-within:bg-black/40">
                <Search className="ml-5 text-white/40" size={24} />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="输入小说名或搜索 URL，例如：小哭包..."
                  className="w-full bg-transparent border-none outline-none px-4 py-4 text-lg text-white placeholder:text-white/20 font-medium"
                />

                <button
                  type="submit"
                  disabled={state === AppState.SEARCHING}
                  className="bg-white text-black px-8 py-3 rounded-[1.5rem] font-bold hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                >
                  {state === AppState.SEARCHING ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                </button>
              </div>
            </form>

            {error && (
              <div className="mt-4 flex flex-col items-center justify-center gap-2 text-red-400 bg-red-900/20 py-3 px-6 rounded-2xl border border-red-500/20 animate-in fade-in max-w-lg mx-auto text-center">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span className="text-sm font-medium">{error}</span>
                </div>
                <span className="text-xs text-red-400/60">如果是网络问题，请尝试点击搜索按钮重试</span>
              </div>
            )}
          </div>
        )}

        {/* Selected Novel Detail View */}
        {selectedNovel && (state === AppState.PREVIEW || state === AppState.ANALYZING || state === AppState.DOWNLOADING || state === AppState.PARSING || state === AppState.PACKING || state === AppState.COMPLETE) && (
          <div className="w-full mt-4 animate-in slide-in-from-bottom-10 fade-in duration-700 mb-20">
            <div className="glass-panel rounded-[3rem] p-8 md:p-12 border border-white/10 relative overflow-hidden">

              {/* Detail Layout */}
              <div className="flex flex-col md:flex-row gap-12 relative z-10">
                {/* Cover Mockup */}
                <div className="w-full md:w-1/3 flex flex-col items-center">
                  <div className="w-48 aspect-[2/3] bg-gradient-to-br from-indigo-900 to-slate-900 rounded-xl shadow-2xl flex items-center justify-center border border-white/10 mb-8 relative overflow-hidden group">
                    {selectedNovel.coverUrl ? (
                      <img 
                        src={selectedNovel.coverUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(selectedNovel.coverUrl)}` : selectedNovel.coverUrl} 
                        alt={selectedNovel.title} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center">
                        <span className="text-4xl font-serif text-white/20">书</span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  {state === AppState.PREVIEW || state === AppState.COMPLETE ? (
                    <button
                      onClick={startDownloadProcess}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <Download size={20} />
                      {selectedNovel.sourceName === '本地书库' ? "下载本地文件" : (state === AppState.COMPLETE ? "下载完成 (点击再次下载)" : "开始抓取并打包")}
                    </button>
                  ) : (
                    <CuteProgress state={state} progress={progressPercent} message={progressMessage} />
                  )}
                  <button
                    onClick={() => { setSelectedNovel(null); setState(AppState.PREVIEW); }}
                    className="mt-4 text-white/40 text-sm hover:text-white hover:underline transition-all"
                  >
                    返回搜索结果
                  </button>
                </div>

                {/* Metadata */}
                <div className="flex-1 space-y-8">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${selectedNovel.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20' : 'bg-amber-500/20 text-amber-300 border-amber-500/20'}`}>
                        {selectedNovel.status === 'Completed' ? '已完结' : selectedNovel.status === 'Serializing' ? '连载中' : '未知状态'}
                      </span>
                      <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs border border-indigo-500/20">TXT直连</span>
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-2 font-serif">{selectedNovel.title}</h2>
                    <p className="text-xl text-indigo-200">{selectedNovel.author}</p>
                  </div>

                  <div className="prose prose-invert prose-sm text-white/70 max-h-32 overflow-y-auto custom-scrollbar">
                    <p>{selectedNovel.description || "正在加载简介..."}</p>
                  </div>

                  <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                      <Globe size={16} className="text-indigo-400" />
                      数据来源
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40 bg-white/5 px-3 py-1.5 rounded-lg flex flex-wrap gap-2">
                        {selectedNovel.sourceName?.split(' | ').map((s, i) => (
                          <span key={i} className="text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{s}</span>
                        )) || '未知书源'}
                      </span>
                      <span className="text-xs text-emerald-400/60">
                        已验证可用
                      </span>
                    </div>
                  </div>

                  {/* Chapter Preview - Only visible after parsing */}
                  {selectedNovel.chapters.length > 0 && (
                    <div className="animate-in fade-in duration-500">
                      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                        <FileText size={16} className="text-indigo-400" />
                        章节列表 (共 {selectedNovel.chapters.length} 章)
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedNovel.chapters.slice(0, 50).map((c, idx) => (
                          <button
                            key={`${c.url}-${idx}`}
                            onClick={() => setReadingChapterIndex(idx)}
                            className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                          >
                            <span className="truncate">{c.title}</span>
                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                          </button>
                        ))}
                        {selectedNovel.chapters.length > 50 && (
                          <div className="col-span-full text-center text-xs text-white/30 py-2">
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
          <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-5">
            {searchResults.map((item, idx) => (
              <BookCard key={`${item.id}-${idx}-${item.sourceName}`} novel={item} onSelect={handleSelectNovel} />
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
