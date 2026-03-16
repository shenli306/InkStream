import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Search, Loader2, ArrowRight, Play, Pause, Download, Music as MusicIcon, Clock, Disc, Volume2, VolumeX, SkipBack, SkipForward, ListMusic, Heart, X } from 'lucide-react';
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
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [playHistory, setPlayHistory] = useState<Music[]>([]);
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
  const [floatingLyrics, setFloatingLyrics] = useState<{id: number; text: string; x: number; y: number; duration: number}[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const lyricIdRef = useRef(0);

  useImperativeHandle(ref, () => ({
    getState: () => ({ isSearching, isDownloading, isDownloadComplete, currentMusic, isPlaying, isLoading: isLoadingUrl })
  }));

  useEffect(() => {
    onStateChange?.({ isSearching, isDownloading, isDownloadComplete, currentMusic, isPlaying, isLoading: isLoadingUrl });
  }, [isSearching, isDownloading, isDownloadComplete, currentMusic, isPlaying, isLoadingUrl, onStateChange]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // 播放时随机显示浮动歌词
  useEffect(() => {
    if (!isPlaying || !currentMusic) return;
    
    const interval = setInterval(() => {
      showFloatingLyric(sampleLyrics[Math.floor(Math.random() * sampleLyrics.length)]);
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isPlaying, currentMusic]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setResults([]);
    setCurrentMusic(null);

    try {
      let allResults: Music[] = [];
      
      const mainData = await searchMusic(query.trim());
      if (mainData.code === 200 && mainData.results) {
        allResults = [...mainData.results];
      }
      
      const jayChouSongs = ['晴天', '稻香', '七里香', '夜曲', '青花瓷', '双截棍', '告白气球', '等你下课', '霍元甲', '彩虹'];
      const isJayChou = query.toLowerCase().includes('周杰伦') || query.toLowerCase().includes('jay');
      
      if (isJayChou && allResults.length < 15) {
        for (const song of jayChouSongs) {
          const extraData = await searchMusic(song);
          if (extraData.code === 200 && extraData.results) {
            extraData.results.forEach(music => {
              const key = `${music.name}-${music.artist}`.toLowerCase();
              const exists = allResults.some(r => 
                `${r.name}-${r.artist}`.toLowerCase() === key
              );
              if (!exists) {
                allResults.push(music);
              }
            });
          }
          if (allResults.length >= 20) break;
        }
      }
      
      if (allResults.length > 0) {
        setResults(allResults);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlay = async (music: Music) => {
    console.log('[MusicSearch] Playing:', music.name, 'source:', music.source);
    if (currentMusic?.id === music.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        try {
          await audioRef.current?.play();
          setIsPlaying(true);
        } catch (e) {
          console.error('Play error:', e);
        }
      }
      return;
    }

    setIsLoadingUrl(true);
    try {
      let data = await getMusicUrl(music);
      console.log('[MusicSearch] First attempt result:', data);
      
      if (data.code !== 200 || !data.url) {
        console.log('[MusicSearch] Primary source failed, trying alternatives...');
        
        const searchResults = await searchMusic(music.name);
        
        const freeSources = ['migu', 'kuwo', 'qishui', 'netease', 'gequke', 'qq'];
        
        for (const source of freeSources) {
          if (source === music.source) continue;
          
          const altMatch = searchResults.results.find(m => m.source === source);
          if (altMatch) {
            console.log('[MusicSearch] Trying alternative source:', source, altMatch.name);
            data = await getMusicUrl(altMatch);
            console.log('[MusicSearch] Alternative source result:', data);
            if (data.code === 200 && data.url) {
              music = altMatch;
              break;
            }
          }
        }
      }
      
      console.log('[MusicSearch] Final result:', data);
      if (data.code === 200 && data.url) {
        const musicWithUrl = { ...music, url: data.url, artist: data.artist || music.artist, cover: data.cover || music.cover };
        setCurrentMusic(musicWithUrl);
        setPlayHistory(prev => {
          const filtered = prev.filter(m => m.id !== music.id);
          return [music, ...filtered].slice(0, 20);
        });
        
        if (audioRef.current) {
          audioRef.current.src = data.url;
          audioRef.current.load();
          try {
            await audioRef.current.play();
            setIsPlaying(true);
            showFloatingLyric('正在播放: ' + music.name);
          } catch (e) {
            console.error('Auto-play failed:', e);
            setIsPlaying(false);
            showFloatingLyric('播放失败，请重试');
          }
        }
      } else {
        console.error('[MusicSearch] All sources failed:', data.msg);
        showFloatingLyric('无法播放这首歌曲');
      }
    } catch (error) {
      console.error('Play failed:', error);
      showFloatingLyric('播放失败，请重试');
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

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSkipBack = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
    }
  };

  const handleSkipForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
    }
  };

  const toggleLike = (e: React.MouseEvent, musicId: string) => {
    e.stopPropagation();
    setLikedSongs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(musicId)) {
        newSet.delete(musicId);
      } else {
        newSet.add(musicId);
      }
      return newSet;
    });
  };

  const showFloatingLyric = (text: string) => {
    const id = ++lyricIdRef.current;
    const x = Math.random() * 60 + 20;
    const y = Math.random() * 60 + 20;
    const duration = Math.random() * 3 + 2;
    
    setFloatingLyrics(prev => [...prev, { id, text, x, y, duration }]);
    
    setTimeout(() => {
      setFloatingLyrics(prev => prev.filter(l => l.id !== id));
    }, duration * 1000);
  };

  const sampleLyrics = [
    '音乐是灵魂的共鸣', '让旋律带走烦恼', '此刻世界属于你',
    '沉浸在这音符里', '感受心跳的节奏', '音乐永不停止',
    '每一首歌都有故事', '让音乐治愈心灵', '跟随节奏摇摆',
    '享受这美好时光', '音符在指尖跳舞', '让歌声飞向远方'
  ];

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

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

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

      {/* Floating Lyrics */}
      {floatingLyrics.map(lyric => (
        <div
          key={lyric.id}
          className="fixed pointer-events-none z-50 animate-float"
          style={{
            left: `${lyric.x}%`,
            top: `${lyric.y}%`,
            animationDuration: `${lyric.duration}s`,
          }}
        >
          <div className="px-6 py-3 bg-black/60 backdrop-blur-md rounded-full border border-white/20 shadow-lg">
            <span className="text-white text-lg font-medium whitespace-nowrap">
              {lyric.text}
            </span>
          </div>
        </div>
      ))}

      {/* Background Blur for Current Playing */}
      {currentMusic?.cover && (
        <div 
          className="fixed inset-0 z-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `url(${currentMusic.cover})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(60px)',
          }}
        />
      )}

      {/* Header */}
      <div className={`text-center transition-all duration-500 mb-8 relative z-10`}>
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

      {/* Results - Big Card Style */}
      {results.length > 0 && (
        <div className="w-full max-w-4xl z-20 mb-24">
          <div className="text-white/60 text-sm mb-4 px-2">
            找到 {results.length} 首歌曲
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sortedResults.map((music, index) => (
              <div 
                key={`${music.id}-${index}`}
                className={`group glass-panel rounded-3xl p-4 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:scale-[1.02] ${
                  currentMusic?.id === music.id ? 'border-pink-500/40 shadow-lg shadow-pink-500/10' : 'border-white/10'
                }`}
                onClick={() => handlePlay(music)}
              >
                <div className="flex gap-4">
                  {/* Big Cover */}
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-pink-500/30 to-rose-500/30 shadow-lg relative">
                    {music.cover ? (
                      <img src={music.cover} alt={music.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc size={40} className="text-pink-400/60" />
                      </div>
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {currentMusic?.id === music.id && isPlaying ? (
                        <div className="w-14 h-14 rounded-full bg-pink-500 flex items-center justify-center shadow-lg">
                          <Pause size={24} className="text-white" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-pink-500 flex items-center justify-center shadow-lg">
                          <Play size={24} className="text-white ml-1" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="text-white font-bold text-lg sm:text-xl truncate mb-1 group-hover:text-pink-200 transition-colors">
                      {music.name}
                    </div>
                    <div className="text-white/60 text-sm truncate mb-2">
                      {music.artist}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                        music.source === 'qishui' 
                          ? ((music as any).isVip 
                            ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                            : 'bg-green-500/20 text-green-300 border border-green-500/30')
                          : music.source === 'netease'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : music.source === 'gequke'
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                          : music.source === 'migu'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : music.source === 'kuwo'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {music.source === 'qishui' 
                          ? ((music as any).isVip ? '付费' : '抖音')
                          : music.source === 'netease' ? '网易云'
                          : music.source === 'gequke' ? '歌曲客'
                          : music.source === 'migu' ? '咪咕'
                          : music.source === 'kuwo' ? '酷我'
                          : 'QQ'}
                      </span>
                      {currentMusic?.id === music.id && (
                        <span className="text-xs text-pink-400">
                          {isPlaying ? '正在播放' : '已暂停'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Download Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(music);
                    }}
                    disabled={isDownloading}
                    className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors group/btn"
                    title="下载歌曲"
                  >
                    {isDownloading ? (
                      <Loader2 size={18} className="text-white/60 animate-spin" />
                    ) : (
                      <Download size={18} className="text-white/60 group-hover/btn:text-pink-400 transition-colors" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isSearching && results.length === 0 && query && (
        <div className="text-center text-white/40 py-8">
          未找到相关音乐
        </div>
      )}

      {/* Floating Player Bar */}
      {currentMusic && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl mx-auto px-2 sm:px-4">
          <div className="glass-panel rounded-xl sm:rounded-2xl p-2 sm:p-3 border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Cover */}
              <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-lg sm:rounded-xl overflow-hidden flex-shrink-0 shadow-lg relative">
                {currentMusic.cover ? (
                  <img src={currentMusic.cover} alt={currentMusic.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-pink-500/30 to-rose-500/30 flex items-center justify-center">
                    <Disc size={16} sm:text={24} className="text-pink-400/60" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm sm:text-base font-semibold truncate">{currentMusic.name}</div>
                <div className="text-white/50 text-xs sm:text-sm truncate">{currentMusic.artist}</div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-0 sm:gap-1">
                <button onClick={handleSkipBack} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                  <SkipBack size={14} sm:text={18} />
                </button>
                <button 
                  onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()}
                  className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/30 hover:scale-105 active:scale-95 transition-transform"
                >
                  {isPlaying ? <Pause size={16} sm:text={18} lg:text={20} className="text-white" /> : <Play size={16} sm:text={18} lg:text={20} className="text-white ml-0.5" />}
                </button>
                <button onClick={handleSkipForward} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                  <SkipForward size={14} sm:text={18} />
                </button>
              </div>

              {/* Progress */}
              <div className="hidden sm:flex items-center gap-2 w-20 lg:w-32">
                <span className="text-xs text-white/50 w-8 lg:w-10 text-right">{formatDuration(currentTime)}</span>
                <div 
                  ref={progressRef}
                  className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer overflow-hidden"
                  onClick={handleProgressClick}
                >
                  <div 
                    className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full transition-all duration-100"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs text-white/50 w-8 lg:w-10 hidden lg:block">{formatDuration(duration)}</span>
              </div>

              {/* Volume */}
              <div className="hidden md:flex items-center gap-1">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                  className="w-16 h-1 accent-pink-500"
                />
              </div>

              {/* Download */}
              <button
                onClick={() => handleDownload(currentMusic)}
                disabled={isDownloading}
                className="hidden sm:flex w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
                title="下载歌曲"
              >
                {isDownloading ? (
                  <Loader2 size={16} className="text-pink-400 animate-spin" />
                ) : (
                  <Download size={16} className="text-white/70 hover:text-pink-400 transition-colors" />
                )}
              </button>

              {/* Playlist */}
              <button 
                onClick={() => setShowPlaylist(!showPlaylist)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${showPlaylist ? 'bg-pink-500/20 text-pink-400' : 'hover:bg-white/10 text-white/70 hover:text-white'}`}
              >
                <ListMusic size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playlist Panel */}
      {showPlaylist && playHistory.length > 0 && (
        <div className="fixed bottom-24 right-6 z-40 w-72">
          <div className="glass-panel rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl p-4 max-h-80 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <ListMusic size={16} className="text-pink-400" />
                播放历史
              </h3>
              <button onClick={() => setShowPlaylist(false)} className="text-white/40 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1">
              {playHistory.map((music, idx) => (
                <div 
                  key={`${music.id}-${idx}`}
                  className={`flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors ${
                    currentMusic?.id === music.id ? 'bg-pink-500/10' : ''
                  }`}
                  onClick={() => handlePlay(music)}
                >
                  <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                    {music.cover ? (
                      <img src={music.cover} alt={music.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center">
                        <MusicIcon size={12} className="text-white/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate">{music.name}</div>
                    <div className="text-white/40 text-xs truncate">{music.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
