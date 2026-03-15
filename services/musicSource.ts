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
      const results: Music[] = data.list.map((item: any) => {
        const artist = item.singer || item.artists || item.author || '未知';
        const artistName = Array.isArray(artist) ? artist.map((a: any) => a.name || a).join(', ') : artist;
        
        return {
          id: item.songmid || item.id || String(Math.random()),
          name: item.songname || item.name || '未知',
          artist: artistName,
          album: item.album?.name || item.albumname || item.album || '',
          cover: item.pic || item.cover || item.album?.pic || '',
          duration: Math.floor((item.duration || 0) / 1000),
          url: '',
          source: 'qq'
        };
      });
      return { code: 200, results, total: results.length };
    }

    return { code: 200, results: [], total: 0, msg: 'No results found' };
  } catch (e) {
    console.error('[MusicSearch] Search failed:', e);
    return { code: 500, results: [], total: 0, msg: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const getMusicUrl = async (music: Music): Promise<MusicUrlResult> => {
  try {
    const songmid = music.id;
    
    const getUrlApi = `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify({
      "req_0": {
        "module": "vkey.GetVkeyServer",
        "method": "CgiGetVkey",
        "param": {
          "guid": "358840355",
          "songmid": [songmid],
          "songtype": [0],
          "uin": "0",
          "flag": 0,
          "cid": 205361638,
          "g_tk": 5381
        }
      },
      "comm": {
        "uin": "0",
        "format": "json",
        "ct": 24,
        "cv": 0
      }
    }))}`;
    
    let url: string;
    if (isVercel) {
      url = `/api/proxy?url=${encodeURIComponent(getUrlApi)}`;
    } else {
      url = getUrlApi;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.req_0?.data?.midurlinfo?.[0]?.purl) {
      const purl = data.req_0.data.midurlinfo[0].purl;
      const finalUrl = `https://dl.stream.qqmusic.qq.com/${purl}`;
      return {
        code: 200,
        url: finalUrl,
        name: music.name,
        artist: music.artist,
        cover: music.cover
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
