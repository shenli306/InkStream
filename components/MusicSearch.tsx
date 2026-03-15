import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Search, Loader2, ArrowRight, Play, Pause, Download, Music as MusicIcon, SortAsc, Clock, Disc, User } from 'lucide-react';
import { searchMusic, getMusicUrl, downloadMusic, Music } from '../services/musicSource';

export interface MusicSearchRef {
  getState: () => { isSearching: boolean; isDownloading: boolean; isDownloadComplete: boolean; currentMusic: Music | null; isPlaying: boolean; isLoading: boolean };
}

interface MusicSearchProps {
  onStateChange?: (state: { isSearching: boolean; isDownloading: boolean; isDownloadComplete: boolean; currentMusic: Music | null; isPlaying: boolean; isLoading: boolean }) => void;
}

type SortOption = 'default' | 'name' | 'artist' | 'duration';

export const MusicSearch = forwardRef<MusicSearchRef, MusicSearchProps>(({ onStateChange }, ref) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadComplete, setIsDownloadComplete] = useState(false);
  const [results, setResults] = useState<Music[]>([]);
  const [currentMusic, setCurrentMusic] = useState<Music | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const audioRef = useRef<HTMLAudioElement>(null);

  useImperativeHandle(ref, () => ({
    getState: () => ({ isSearching, isDownloading, isDownloadComplete, currentMusic, isPlaying, isLoading: isLoadingUrl })
  }));

  useEffect(() => {
    onStateChange?.({ isSearching, isDownloading, isDownloadComplete, currentMusic, isPlaying, isLoading: isLoadingUrl });
  }, [isSearching, isDownloading, isDownloadComplete, currentMusic, isPlaying, isLoadingUrl, onStateChange]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setResults([]);
    setCurrentMusic(null);

    try {
      const data = await searchMusic(query.trim());
      if (data.code === 200 && data.results) {
        setResults(data.results);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlay = async (music: Music) => {
    console.log('[MusicSearch] Playing:', music.name);
    if (currentMusic?.id === music.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }

    setIsLoadingUrl(true);
    try {
      const data = await getMusicUrl(music);
      console.log('[MusicSearch] Got URL:', data);
      if (data.code === 200 && data.url) {
        const musicWithUrl = { ...music, url: data.url, artist: data.artist || music.artist, cover: data.cover || music.cover };
        setCurrentMusic(musicWithUrl);
        
        if (audioRef.current) {
          audioRef.current.src = data.url;
          audioRef.current.play();
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error('Play failed:', error);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleDownload = async (music: Music) => {
    setIsDownloading(true);
    setIsDownloadComplete(false);
    try {
      const data = await getMusicUrl(music);
      if (data.code === 200 && data.url) {
        const filename = `${music.name} - ${music.artist}.mp3`;
        await downloadMusic(data.url, filename);
        setIsDownloadComplete(true);
        setTimeout(() => setIsDownloadComplete(false), 2000);
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(0).padStart(2, '0')}`;
  };

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    switch (sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      case 'artist':
        return sorted.sort((a, b) => a.artist.localeCompare(b.artist, 'zh-CN'));
      case 'duration':
        return sorted.sort((a, b) => b.duration - a.duration);
      default:
        return sorted;
    }
  }, [results, sortBy]);

  const sortOptions: { value: SortOption; label: string; icon: React.ReactNode }[] = [
    { value: 'default', label: '默认', icon: <SortAsc size={14} /> },
    { value: 'name', label: '歌名', icon: <MusicIcon size={14} /> },
    { value: 'artist', label: '歌手', icon: <User size={14} /> },
    { value: 'duration', label: '时长', icon: <Clock size={14} /> },
  ];

  return (
    <>
      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onError={(e) => console.error('Audio error:', e)}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
      />

      {/* Header */}
      <div className={`text-center transition-all duration-500 mb-8`}>
        <div className="flex items-center justify-center gap-4 mb-4">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 drop-shadow-2xl">
            ToneStream
          </h1>
        </div>
        <p className="text-xl text-white/50 font-light max-w-xl mx-auto flex items-center justify-center gap-2">
          全网搜曲 · 在线播放 · 音频下载
        </p>
      </div>

      {/* Search Input */}
      <div className="w-full max-w-2xl z-20 mb-8 flex flex-col items-center gap-6">
        <form onSubmit={handleSearch} className="w-full relative group">
          <div className="search-box-glow group-hover:opacity-40 transition-opacity duration-500"></div>
          <div 
            className="search-box p-2 flex items-center transition-opacity transition-colors duration-300 focus-within:ring-2 focus-within:ring-white/20 focus-within:bg-black/40"
          >
            <Search className="ml-5 text-white/40" size={24} aria-hidden="true" />
            <input
              type="text"
              name="music-search"
              autocomplete="off"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="输入歌曲名或歌手名..."
              className="w-full bg-transparent border-none outline-none px-4 py-4 text-lg text-white placeholder:text-white/20 font-medium"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-8 py-3 rounded-[1.5rem] font-bold hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-pink-300 transition-opacity transition-scale duration-300 disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
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

      {/* Results */}
      {results.length > 0 && (
        <div className="w-full max-w-2xl z-20 mb-24">
          <div className="glass-panel rounded-3xl p-4 border border-white/10 bg-black/30 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white/60">
                <MusicIcon size={18} />
                <span className="text-sm font-medium">找到 {results.length} 首歌曲</span>
              </div>
              <div className="flex items-center gap-2">
                <SortAsc size={14} className="text-white/40" />
                <div className="flex gap-1">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSortBy(option.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        sortBy === option.value
                          ? 'bg-pink-500/80 text-white shadow-lg shadow-pink-500/30'
                          : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                      }`}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {sortedResults.map((music, index) => (
                <div 
                  key={`${music.id}-${index}`}
                  className={`group flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 hover:bg-white/10 hover:scale-[1.01] ${
                    currentMusic?.id === music.id ? 'bg-gradient-to-r from-pink-500/30 to-rose-500/20 border border-pink-500/40 shadow-lg shadow-pink-500/10' : 'bg-white/5'
                  }`}
                >
                  {/* Index */}
                  <div className="w-6 text-center text-white/30 text-sm font-medium flex-shrink-0">
                    {currentMusic?.id === music.id ? (
                      <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                        {isPlaying ? (
                          <div className="flex gap-0.5 items-end h-3">
                            <span className="w-0.5 h-1 bg-white animate-pulse" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-0.5 h-2 bg-white animate-pulse" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-0.5 h-1.5 bg-white animate-pulse" style={{ animationDelay: '300ms' }}></span>
                          </div>
                        ) : (
                          <Pause size={10} className="text-white" />
                        )}
                      </div>
                    ) : (
                      <span className="group-hover:hidden">{index + 1}</span>
                    )}
                  </div>

                  {/* Cover */}
                  <div 
                    className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-pink-500/30 to-rose-500/30 shadow-lg"
                  >
                    {music.cover ? (
                      <img src={music.cover} alt={music.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc size={24} className="text-pink-400/60" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold truncate group-hover:text-pink-200 transition-colors">{music.name}</div>
                    <div className="text-white/50 text-sm truncate flex items-center gap-1">
                      <User size={12} className="flex-shrink-0" />
                      {music.artist}
                    </div>
                  </div>

                  {/* Album */}
                  {music.album && (
                    <div className="hidden md:block flex-1 min-w-0">
                      <div className="text-white/40 text-xs truncate">{music.album}</div>
                    </div>
                  )}

                  {/* Duration */}
                  {music.duration > 0 && (
                    <div className="text-white/40 text-sm flex-shrink-0 flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(music.duration)}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handlePlay(music)}
                      disabled={isLoadingUrl}
                      className="w-11 h-11 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg shadow-pink-500/30 disabled:opacity-50 disabled:scale-100"
                    >
                      {isLoadingUrl ? (
                        <Loader2 size={18} className="animate-spin text-white" />
                      ) : currentMusic?.id === music.id && isPlaying ? (
                        <Pause size={18} className="text-white" />
                      ) : (
                        <Play size={18} className="text-white ml-0.5" />
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleDownload(music)}
                      disabled={isLoadingUrl}
                      className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50"
                    >
                      <Download size={18} className="text-white/70" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isSearching && results.length === 0 && query && (
        <div className="text-center text-white/40 py-8">
          未找到相关音乐
        </div>
      )}
    </>
  );
});
