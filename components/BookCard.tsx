import React, { useState } from 'react';
import { Novel } from '../types';
import { Book, Download, Globe, ChevronDown, ChevronUp, BookOpen, Star } from 'lucide-react';

interface BookCardProps {
  novel: Novel;
  onSelect: (novel: Novel) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ novel, onSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const normalizeCoverUrl = (url?: string | null) => {
    if (!url) return null;
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
    }
    const lower = decoded.toLowerCase();
    if (lower.includes('nocover') || lower.includes('no-cover') || lower.includes('nopic') ||
      lower.includes('noimage') || lower.includes('default') || lower.includes('placeholder') ||
      decoded.includes('暂无封面')) {
      return null;
    }
    if (url.startsWith('http') || url.startsWith('/api/')) return url;
    return `https://m.qishu99.cc${url}`;
  };

  const coverUrl = normalizeCoverUrl(novel.coverUrl);
  const chapterCount = novel.chapters?.length || 0;
  const isCompleted = novel.status === 'Completed';

  return (
    <div
      className="glass-panel rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 group flex flex-col h-full relative"
      onClick={() => onSelect(novel)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: isHovered ? '0 20px 40px -12px rgba(0,0,0,0.4), 0 0 30px -10px rgba(99,102,241,0.2)' : '0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      {/* Animated Gradient Background */}
      <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-indigo-500/20 via-purple-500/10 to-transparent opacity-50 group-hover:opacity-80 transition-opacity duration-500" />
      
      {/* Status Badge */}
      <div className="absolute top-3 right-3 z-10">
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
          isCompleted 
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
        }`}>
          <Star size={10} className={isCompleted ? 'fill-emerald-300' : 'fill-amber-300'} />
          {isCompleted ? '已完结' : '连载中'}
        </span>
      </div>

      <div className="p-6 pt-10 relative flex-1 flex flex-col">
        {/* Cover & Tags Row */}
        <div className="flex gap-4 mb-4">
          <div className="w-16 h-24 bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-pink-500/20 rounded-xl shadow-lg flex items-center justify-center text-white/20 border border-white/10 shrink-0 overflow-hidden relative">
            {coverUrl ? (
              <img src={coverUrl} alt={novel.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <Book size={32} />
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <BookOpen size={20} className="text-white" />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white mb-1 line-clamp-2 font-serif leading-tight group-hover:text-indigo-200 transition-colors">
              {novel.title}
            </h3>
            <p className="text-sm text-indigo-300 mb-2 truncate">{novel.author}</p>
            
            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {novel.tags && Array.isArray(novel.tags) && novel.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 bg-white/5 rounded-md text-white/50 border border-white/5">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-3 mb-3 text-xs text-white/40">
          {chapterCount > 0 && (
            <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg">
              <BookOpen size={12} />
              <span>{chapterCount} 章</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg">
            <Globe size={12} />
            <span className="truncate max-w-[80px]">{novel.sourceName?.split(' | ')[0] || '奇书网'}</span>
          </div>
        </div>

        {/* Description with expand */}
        <div className="relative flex-1 mb-4">
          <p className={`text-white/50 text-xs leading-relaxed ${isExpanded ? '' : 'line-clamp-2'} transition-all duration-300`}>
            {novel.description || "暂无简介"}
          </p>
          {novel.description && novel.description.length > 80 && (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              className="text-indigo-400 text-xs hover:text-indigo-300 flex items-center gap-1 mt-1 transition-colors"
            >
              {isExpanded ? <><ChevronUp size={12} />收起</> : <><ChevronDown size={12} />展开</>}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-emerald-400/80 text-xs">
            <Globe size={12} />
            <span>{novel.sourceName?.split(' | ')[0] || '奇书网'}</span>
          </div>
          <button 
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
              isHovered 
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30 scale-110' 
                : 'bg-indigo-500/50 text-white/70'
            }`}
            onClick={(e) => { e.stopPropagation(); onSelect(novel); }}
          >
            <Download size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
