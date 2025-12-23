import React from 'react';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Chapter } from '../types';

interface ReaderProps {
  title: string;
  chapter: Chapter | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  isLoading: boolean;
}

export const Reader: React.FC<ReaderProps> = ({ 
  title, 
  chapter, 
  onClose, 
  onNext, 
  onPrev,
  hasPrev,
  hasNext,
  isLoading
}) => {
  if (!chapter) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative bg-black/40 backdrop-blur-3xl w-full max-w-4xl h-[100dvh] sm:h-[90vh] sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/10">
        
        {/* Header - Glass Bar */}
        <div className="h-20 flex items-center justify-between px-8 border-b border-white/10 shrink-0 bg-white/5 backdrop-blur-xl">
          <div className="flex flex-col">
             <h2 className="font-bold text-white/90 truncate max-w-xs sm:max-w-md text-lg">{title}</h2>
             <span className="text-xs text-white/50">{chapter.title}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white/80"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-12 md:p-16 scroll-smooth">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 gap-4">
              <Loader2 className="animate-spin text-indigo-400" size={48} />
              <p className="text-lg font-light tracking-widest">正在加载...</p>
            </div>
          ) : (
            <div className="prose prose-invert prose-lg md:prose-xl max-w-none font-serif text-white/80 leading-loose whitespace-pre-wrap">
              <h1 className="text-center mb-12 text-3xl font-bold text-white tracking-wide">{chapter.title}</h1>
              {/* Using simple div for pre-parsed text, Markdown isn't strictly necessary for TXT source but nice if we had it */}
              {chapter.content}
            </div>
          )}
        </div>

        {/* Footer Controls - Glass Bar */}
        <div className="h-24 sm:h-20 border-t border-white/10 bg-white/5 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 pb-4 sm:pb-0">
          <button 
            onClick={onPrev}
            disabled={!hasPrev || isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 hover:bg-white/15 text-sm font-medium text-white/80 disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
          >
            <ChevronLeft size={18} /> 上一章
          </button>

          <span className="text-sm font-medium text-white/30 hidden sm:block">
             • {chapter.number} •
          </span>

          <button 
             onClick={onNext}
             disabled={!hasNext || isLoading}
             className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 hover:bg-white/15 text-sm font-medium text-white/80 disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
          >
            下一章 <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
