import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Search, Loader2, ArrowRight, Play, Pause, Download, Music as MusicIcon } from 'lucide-react';
import { searchMusic, getMusicUrl, downloadMusic, Music } from '../services/musicSource';

export interface MusicSearchRef {
  getState: () => { isSearching: boolean; currentMusic: Music | null; isPlaying: boolean; isLoading: boolean };
}

interface MusicSearchProps {
  onStateChange?: (state: { isSearching: boolean; currentMusic: Music | null; isPlaying: boolean; isLoading: boolean }) => void;
}

export const MusicSearch = forwardRef<MusicSearchRef, MusicSearchProps>(({ onStateChange }, ref) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Music[]>([]);
  const [currentMusic, setCurrentMusic] = useState<Music | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useImperativeHandle(ref, () => ({
    getState: () => ({ isSearching, currentMusic, isPlaying, isLoading: isLoadingUrl })
  }));

  useEffect(() => {
    onStateChange?.({ isSearching, currentMusic, isPlaying, isLoading: isLoadingUrl });
  }, [isSearching, currentMusic, isPlaying, isLoadingUrl, onStateChange]);

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

  const handlePlay = async (music: Music, index: number) => {
    console.log('[MusicSearch] Playing:', music.name, 'at index:', index);
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
      const data = await getMusicUrl(music.name + ' ' + music.artist, index);
      console.log('[MusicSearch] Got URL:', data);
      if (data.code === 200 && data.url) {
        const musicWithUrl = { ...music, url: data.url };
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

  const handleDownload = async (music: Music, index: number) => {
    setIsLoadingUrl(true);
    try {
      const data = await getMusicUrl(music.name + ' ' + music.artist, index);
      if (data.code === 200 && data.url) {
        const filename = `${music.name} - ${music.artist}.mp3`;
        await downloadMusic(data.url, filename);
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(0).padStart(2, '0')}`;
  };

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
            <div className="flex items-center gap-2 mb-4 text-white/60">
              <MusicIcon size={18} />
              <span className="text-sm font-medium">找到 {results.length} 首歌曲</span>
            </div>
            
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {results.map((music, index) => (
                <div 
                  key={`${music.id}-${index}`}
                  className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 hover:bg-white/5 ${
                    currentMusic?.id === music.id ? 'bg-pink-500/20 border border-pink-500/30' : ''
                  }`}
                >
                  {/* Cover */}
                  <div 
                    className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/10"
                  >
                    {music.cover ? (
                      <img src={music.cover} alt={music.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <MusicIcon size={20} className="text-white/30" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{music.name}</div>
                    <div className="text-white/50 text-sm truncate">{music.artist}</div>
                  </div>

                  {/* Duration */}
                  {music.duration > 0 && (
                    <div className="text-white/40 text-sm flex-shrink-0">
                      {formatDuration(music.duration)}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handlePlay(music, index + 1)}
                      disabled={isLoadingUrl}
                      className="w-10 h-10 rounded-full bg-pink-500 hover:bg-pink-600 flex items-center justify-center transition-colors disabled:opacity-50"
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
                      onClick={() => handleDownload(music, index + 1)}
                      disabled={isLoadingUrl}
                      className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-50"
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
