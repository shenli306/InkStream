export interface Music {
  id: string;
  name: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  url: string;
  source: string;
}

export interface MusicSearchResult {
  code: number;
  results: Music[];
  total: number;
  msg?: string;
}

export interface MusicUrlResult {
  code: number;
  url?: string;
  name?: string;
  artist?: string;
  cover?: string;
  lyric?: string;
  msg?: string;
}

const API_KEY = "62ccfd8be755cc5850046044c6348d6cac5ef31bd5874c1352287facc06f94c4";
const API_BASE = "http://cyapi.top/API/qq_music.php";

const isVercel = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

export const searchMusic = async (keyword: string, source: string = 'qq'): Promise<MusicSearchResult> => {
  try {
    const apiUrl = `${API_BASE}?apikey=${API_KEY}&msg=${encodeURIComponent(keyword)}&num=20&type=json`;
    
    let url: string;
    if (isVercel) {
      url = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
    } else {
      url = apiUrl;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.list && data.list.length > 0) {
      const results: Music[] = data.list.map((item: any) => ({
        id: item.id,
        name: item.name,
        artist: item.artists || '未知',
        album: item.album?.name || '',
        cover: item.cover || '',
        duration: item.duration || 0,
        url: item.url || '',
        source: 'qq'
      }));
      return { code: 200, results, total: results.length };
    }

    return { code: 200, results: [], total: 0, msg: 'No results found' };
  } catch (e) {
    console.error('[MusicSearch] Search failed:', e);
    return { code: 500, results: [], total: 0, msg: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const getMusicUrl = async (keyword: string, index: number = 1): Promise<MusicUrlResult> => {
  try {
    const apiUrl = `${API_BASE}?apikey=${API_KEY}&msg=${encodeURIComponent(keyword)}&num=10&type=json&n=${index}`;
    
    let url: string;
    if (isVercel) {
      url = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
    } else {
      url = apiUrl;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.url) {
      return {
        code: 200,
        url: data.url,
        name: data.name,
        artist: data.artists?.[0]?.name || data.artists || '未知',
        cover: data.cover?.medium || data.cover?.large || '',
        lyric: data.lyric?.text || ''
      };
    }

    return { code: 404, msg: 'No audio URL found' };
  } catch (e) {
    console.error('[MusicSearch] Get URL failed:', e);
    return { code: 500, msg: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const downloadMusic = async (url: string, filename: string): Promise<boolean> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    
    return true;
  } catch (e) {
    console.error('[MusicSearch] Download failed:', e);
    return false;
  }
};
