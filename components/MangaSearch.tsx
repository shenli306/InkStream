import React, { useState } from 'react';
import { Search, Loader2, ArrowRight } from 'lucide-react';

interface MangaSearchProps {
  onBack: () => void;
}

export const MangaSearch: React.FC<MangaSearchProps> = ({ onBack }) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);

    // TODO: 实现真实漫画搜索 API
    setTimeout(() => {
      setIsSearching(false);
    }, 1000);
  };

  return (
    <>
      {/* Header */}
      <div className={`text-center transition-all duration-500 mb-12`}>
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 drop-shadow-2xl mb-6">
          InkFrame
        </h1>
        <p className="text-xl text-white/50 font-light max-w-xl mx-auto flex items-center justify-center gap-2">
          全网搜漫 · 高清阅读 · EPUB 打包
        </p>
      </div>

      {/* Search Input */}
      <div className="w-full max-w-2xl z-20 mb-12 flex flex-col items-center gap-6">
        <form onSubmit={handleSearch} className="w-full relative group">
          <div className="search-box-glow group-hover:opacity-40 transition-opacity duration-500"></div>
          <div 
            className="search-box p-2 flex items-center transition-opacity transition-colors duration-300 focus-within:ring-2 focus-within:ring-white/20 focus-within:bg-black/40"
          >
            <Search className="ml-5 text-white/40" size={24} aria-hidden="true" />
            <input
              type="text"
              name="manga-search"
              autocomplete="off"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="输入漫画名..."
              className="w-full bg-transparent border-none outline-none px-4 py-4 text-lg text-white placeholder:text-white/20 font-medium"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-8 py-3 rounded-[1.5rem] font-bold hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-indigo-300 transition-opacity transition-scale duration-300 disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
            >
              {isSearching ? (
                <Loader2 className="animate-spin" size={20} aria-hidden="true" />
              ) : (
                <ArrowRight size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default MangaSearch;
