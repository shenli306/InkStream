import React, { useState } from 'react';
import { Novel } from '../types';
import { Book, Download, Globe, ChevronDown, ChevronUp, BookOpen, Star } from 'lucide-react';
import { resolveCoverUrl } from '../utils/cover';

interface BookCardProps {
  novel: Novel;
  onSelect: (novel: Novel) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ novel, onSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const coverUrl = resolveCoverUrl(novel.coverUrl);
  const chapterCount = novel.chapters?.length || 0;
  const isCompleted = novel.status === 'Completed';
  const sourceName = novel.sourceName?.split(' | ')[0] || '未知书源';

  return (
    <div
      className="glass-panel rounded-lg overflow-hidden cursor-pointer group flex flex-col h-full relative card-hover gpu-accelerated"
      onClick={() => onSelect(novel)}
    >
      <div className="p-6 relative flex-1 flex flex-col">
        {/* Cover & Tags Row */}
        <div className="flex gap-4 mb-4">
          <div className="w-16 h-24 surface-elevated rounded-sm shadow-md flex items-center justify-center text-content-disabled shrink-0 overflow-hidden relative">
            {coverUrl ? (
              <img src={coverUrl} alt={novel.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <Book size={28} />
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 surface-scrim opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <BookOpen size={20} className="text-content-primary" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-content-primary mb-1 line-clamp-2 font-serif leading-tight group-hover:text-accent transition-colors duration-300">
              {novel.title}
            </h3>
            <p className="text-sm text-highlight mb-2 truncate">{novel.author}</p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {novel.tags && Array.isArray(novel.tags) && novel.tags.slice(0, 3).map(tag => (
                <span key={tag} className="badge">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-2 mb-3">
          {chapterCount > 0 && (
            <span className="badge">
              <BookOpen size={11} />
              {chapterCount} 章
            </span>
          )}
          <span className={`badge ${isCompleted ? 'badge--success' : 'badge--warning'}`}>
            <Star size={10} className="fill-current" />
            {isCompleted ? '已完结' : '连载中'}
          </span>
        </div>

        {/* Description with expand */}
        <div className="relative flex-1 mb-4">
          <p className={`text-content-tertiary text-xs leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
            {novel.description || "暂无简介"}
          </p>
          {novel.description && novel.description.length > 80 && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              className="text-accent text-xs hover:text-accent-hover flex items-center gap-1 mt-1 transition-colors"
            >
              {isExpanded ? <><ChevronUp size={12} />收起</> : <><ChevronDown size={12} />展开</>}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-4 border-t border-faint">
          <div className="flex items-center gap-2 text-content-tertiary text-xs min-w-0">
            <Globe size={12} className="shrink-0" />
            <span className="truncate">{sourceName}</span>
          </div>
          <button
            className="w-9 h-9 rounded-sm flex items-center justify-center shrink-0 bg-accent-soft text-accent border border-accent-border group-hover:bg-accent group-hover:text-content-inverse group-hover:scale-110 transition-all duration-300 gpu-accelerated"
            onClick={(e) => { e.stopPropagation(); onSelect(novel); }}
            aria-label={`选择《${novel.title}》`}
          >
            <Download size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
