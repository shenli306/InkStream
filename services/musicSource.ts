export interface Music {
  id: string;
  name: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  url: string;
  source: string;
  isVip?: boolean;
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

const QQ_API_KEY = "62ccfd8be755cc5850046044c6348d6cac5ef31bd5874c1352287facc06f94c4";
const QQ_API_BASE = "http://cyapi.top/API/qq_music.php";
const QISHUI_API = "https://api-v2.cenguigui.cn/api/qishui";
const NETEASE_API = "https://api.xingzhige.com/API/NetEase_CloudMusic";
const GEQUKE_API = "/api/gequke";
const MIGU_API = "/api/migu";
const KUWO_API = "/api/kuwo";

const isVercel = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

export const searchMusic = async (keyword: string): Promise<MusicSearchResult> => {
  try {
    console.log('[MusicSearch] Starting search for:', keyword);
    
    const [qishuiResults, neteaseResults, gequkeResults, qqResults, miguResults, kuwoResults] = await Promise.allSettled([
      searchQishuiMusic(keyword),
      searchNeteaseMusic(keyword),
      searchGequkeMusic(keyword),
      searchQQMusic(keyword),
      searchMiguMusic(keyword),
      searchKuwoMusic(keyword)
    ]);
    
    const results: Music[] = [];
    
    if (qishuiResults.status === 'fulfilled') results.push(...qishuiResults.value);
    if (neteaseResults.status === 'fulfilled') results.push(...neteaseResults.value);
    if (gequkeResults.status === 'fulfilled') results.push(...gequkeResults.value);
    if (qqResults.status === 'fulfilled') results.push(...qqResults.value);
    if (miguResults.status === 'fulfilled') results.push(...miguResults.value);
    if (kuwoResults.status === 'fulfilled') results.push(...kuwoResults.value);
    
    console.log('[MusicSearch] Results:', {
      qishui: qishuiResults.status === 'fulfilled' ? qishuiResults.value.length : 0,
      netease: neteaseResults.status === 'fulfilled' ? neteaseResults.value.length : 0,
      gequke: gequkeResults.status === 'fulfilled' ? gequkeResults.value.length : 0,
      qq: qqResults.status === 'fulfilled' ? qqResults.value.length : 0,
      migu: miguResults.status === 'fulfilled' ? miguResults.value.length : 0,
      kuwo: kuwoResults.status === 'fulfilled' ? kuwoResults.value.length : 0,
      total: results.length
    });
    
    return { code: 200, results, total: results.length };
  } catch (e) {
    console.error('[MusicSearch] Search failed:', e);
    return { code: 500, results: [], total: 0, msg: e instanceof Error ? e.message : 'Unknown error' };
  }
};

const searchQishuiMusic = async (keyword: string): Promise<Music[]> => {
  try {
    const apiUrl = `${QISHUI_API}/?msg=${encodeURIComponent(keyword)}&type=json&n=50`;
    
    const url = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
    
    const response = await fetch(url);
    const data = await response.json();
    console.log('[Qishui] Response:', data);
    
    if (data?.code === 200 && data?.data) {
      // data 可能是对象（单个结果）或数组（搜索结果列表）
      if (Array.isArray(data.data)) {
        // 搜索结果列表 - 只有基本信息，没有播放 URL
        return data.data.map((item: any) => ({
          id: item.track_id || item.title + '_' + item.singer + '_' + Math.random(),
          name: item.title || '未知',
          artist: item.singer || '未知',
          album: item.title || '',
          cover: item.cover || '',
          duration: 0,
          url: '', // 搜索结果不包含播放 URL，需要后续获取
          source: 'qishui',
          isVip: false
        }));
      } else {
        // 单个结果 - 包含播放 URL
        return [{
          id: data.data.track_id || data.data.title + '_' + data.data.singer + '_' + Math.random(),
          name: data.data.title || '未知',
          artist: data.data.singer || '未知',
          album: data.data.title || '',
          cover: data.data.cover || '',
          duration: 0,
          url: data.data.music && data.data.music !== 'None' ? data.data.music : '',
          source: 'qishui',
          isVip: data.data.pay === 'pay'
        }].filter((m: Music) => m.url && m.url !== 'None');
      }
    }
    return [];
  } catch (e) {
    console.error('[MusicSearch] Qishui search failed:', e);
    return [];
  }
};

const searchGequkeMusic = async (keyword: string): Promise<Music[]> => {
  try {
    const apiUrl = `${GEQUKE_API}?keyword=${encodeURIComponent(keyword)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data?.code === 200 && data?.results) {
      return data.results.map((item: any) => ({
        id: String(item.id || Math.random()),
        name: item.name || '未知',
        artist: item.artist || '未知',
        album: item.album || '',
        cover: item.cover || '',
        duration: item.duration || 0,
        url: item.url || '',
        source: 'gequke',
        isVip: false
      })).filter((m: Music) => m.url);
    }
    return [];
  } catch (e) {
    console.error('[MusicSearch] Gequke search failed:', e);
    return [];
  }
};

const searchNeteaseMusic = async (keyword: string): Promise<Music[]> => {
  try {
    const apiUrl = `${NETEASE_API}/?name=${encodeURIComponent(keyword)}&type=json&n=50`;
    const url = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();
    console.log('[Netease] Response:', data);
    
    if (data?.code === 0 && data?.data) {
      const songData = Array.isArray(data.data) ? data.data : [data.data];
      return songData.map((item: any) => ({
        id: String(item.songid || Math.random()),
        name: item.songname || '未知',
        artist: item.name || '未知',
        album: item.songname || '',
        cover: item.cover || '',
        duration: 0,
        url: item.src || '',
        source: 'netease',
        isVip: item.pay === 'VIP'
      })).filter((m: Music) => m.url);
    }
    return [];
  } catch (e) {
    console.error('[MusicSearch] Netease search failed:', e);
    return [];
  }
};

const searchQQMusic = async (keyword: string): Promise<Music[]> => {
  try {
    const apiUrl = `${QQ_API_BASE}?apikey=${QQ_API_KEY}&msg=${encodeURIComponent(keyword)}&num=50&type=json`;
    const url = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
    
    const response = await fetch(url);
    const data = await response.json();
    console.log('[QQ] Response:', data);
    
    if (data.list && data.list.length > 0) {
      return data.list.map((item: any) => ({
        id: item.id || item.songmid || String(Math.random()),
        name: item.songname || item.name || '未知',
        artist: item.artists || item.singer || '未知',
        album: item.albumname || item.album || '',
        cover: item.pic || item.cover || '',
        duration: Math.floor((item.duration || 0) / 1000),
        url: '',
        source: 'qq'
      }));
    }
    return [];
  } catch (e) {
    console.error('[MusicSearch] QQ search failed:', e);
    return [];
  }
};

const searchMiguMusic = async (keyword: string): Promise<Music[]> => {
  try {
    console.log('[Migu] Searching for:', keyword);
    const apiUrl = `${MIGU_API}?keyword=${encodeURIComponent(keyword)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    console.log('[Migu] Search response:', data);
    
    if (data?.code === 200 && data?.results) {
      return data.results.map((item: any) => ({
        id: String(item.id || item.copyrightId || Math.random()),
        name: item.name || '未知',
        artist: item.artist || '未知',
        album: item.album || '',
        cover: item.cover || '',
        duration: item.duration || 0,
        url: '',
        source: 'migu',
        songId: item.songId,
        copyrightId: item.copyrightId
      }));
    }
    return [];
  } catch (e) {
    console.error('[MusicSearch] Migu search failed:', e);
    return [];
  }
};

const searchKuwoMusic = async (keyword: string): Promise<Music[]> => {
  try {
    console.log('[Kuwo] Searching for:', keyword);
    const apiUrl = `${KUWO_API}?keyword=${encodeURIComponent(keyword)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    console.log('[Kuwo] Search response:', data);
    
    if (data?.code === 200 && data?.results) {
      return data.results.map((item: any) => ({
        id: String(item.id || item.rid || Math.random()),
        name: item.name || '未知',
        artist: item.artist || '未知',
        album: item.album || '',
        cover: item.cover || '',
        duration: item.duration || 0,
        url: '',
        source: 'kuwo',
        rid: item.rid
      }));
    }
    return [];
  } catch (e) {
    console.error('[MusicSearch] Kuwo search failed:', e);
    return [];
  }
};

export const getMusicUrl = async (music: Music): Promise<MusicUrlResult> => {
  console.log('[MusicUrl] Getting URL for:', music.name, 'source:', music.source);
  
  // 尝试 QQ 音乐（最可靠）
  console.log('[MusicUrl] Trying QQ source');
  const qqResult = await getQQMusicUrl(music);
  if (qqResult.code === 200 && qqResult.url) {
    return qqResult;
  }
  
  // 尝试 Qishui
  if (music.source === 'qishui' || music.source === 'qq') {
    console.log('[MusicUrl] Trying Qishui source');
    const qishuiUrl = await getQishuiMusicUrl(music);
    if (qishuiUrl.code === 200 && qishuiUrl.url) {
      return qishuiUrl;
    }
  }
  
  if (music.source === 'qishui' && music.url) {
    console.log('[MusicUrl] Using Qishui URL directly');
    return {
      code: 200,
      url: music.url,
      name: music.name,
      artist: music.artist,
      cover: music.cover
    };
  }
  if (music.source === 'netease' && music.url) {
    console.log('[MusicUrl] Using Netease URL directly');
    return {
      code: 200,
      url: music.url,
      name: music.name,
      artist: music.artist,
      cover: music.cover
    };
  }
  if (music.source === 'gequke' && music.url) {
    console.log('[MusicUrl] Using Gequke URL directly');
    return {
      code: 200,
      url: music.url,
      name: music.name,
      artist: music.artist,
      cover: music.cover
    };
  }
  if (music.source === 'migu') {
    console.log('[MusicUrl] Trying Migu source');
    const miguResult = await getMiguMusicUrl(music);
    if (miguResult.code === 200 && miguResult.url) {
      return miguResult;
    }
  }
  if (music.source === 'kuwo') {
    console.log('[MusicUrl] Trying Kuwo source');
    const kuwoResult = await getKuwoMusicUrl(music);
    if (kuwoResult.code === 200 && kuwoResult.url) {
      return kuwoResult;
    }
  }
  
  // 如果特定源失败，尝试其他源
  console.log('[MusicUrl] Trying fallback sources...');
  return tryOtherSources(music);
};

const tryOtherSources = async (music: Music): Promise<MusicUrlResult> => {
  const keyword = `${music.name} ${music.artist}`;
  console.log('[MusicSearch] Trying alternative sources for:', keyword);
  
  const qishuiResults = await searchQishuiMusic(keyword);
  const matchQishui = qishuiResults.find(m => 
    m.name.toLowerCase().includes(music.name.toLowerCase()) || 
    music.name.toLowerCase().includes(m.name.toLowerCase())
  );
  if (matchQishui?.url) {
    console.log('[MusicSearch] Found in Qishui');
    return {
      code: 200,
      url: matchQishui.url,
      name: matchQishui.name,
      artist: matchQishui.artist,
      cover: matchQishui.cover
    };
  }
  
  const neteaseResults = await searchNeteaseMusic(keyword);
  const matchNetease = neteaseResults.find(m => 
    m.name.toLowerCase().includes(music.name.toLowerCase()) || 
    music.name.toLowerCase().includes(m.name.toLowerCase())
  );
  if (matchNetease?.url) {
    console.log('[MusicSearch] Found in Netease');
    return {
      code: 200,
      url: matchNetease.url,
      name: matchNetease.name,
      artist: matchNetease.artist,
      cover: matchNetease.cover
    };
  }
  
  const gequkeResults = await searchGequkeMusic(keyword);
  const matchGequke = gequkeResults.find(m => 
    m.name.toLowerCase().includes(music.name.toLowerCase()) || 
    music.name.toLowerCase().includes(m.name.toLowerCase())
  );
  if (matchGequke?.url) {
    console.log('[MusicSearch] Found in Gequke');
    return {
      code: 200,
      url: matchGequke.url,
      name: matchGequke.name,
      artist: matchGequke.artist,
      cover: matchGequke.cover
    };
  }
  
  const miguResults = await searchMiguMusic(keyword);
  const matchMigu = miguResults.find(m => 
    m.name.toLowerCase().includes(music.name.toLowerCase()) || 
    music.name.toLowerCase().includes(m.name.toLowerCase())
  );
  if (matchMigu) {
    console.log('[MusicSearch] Found in Migu, getting URL...');
    const miguUrl = await getMiguMusicUrl(matchMigu);
    if (miguUrl.code === 200 && miguUrl.url) {
      console.log('[MusicSearch] Got Migu URL');
      return miguUrl;
    }
  }
  
  const kuwoResults = await searchKuwoMusic(keyword);
  const matchKuwo = kuwoResults.find(m => 
    m.name.toLowerCase().includes(music.name.toLowerCase()) || 
    music.name.toLowerCase().includes(m.name.toLowerCase())
  );
  if (matchKuwo) {
    console.log('[MusicSearch] Found in Kuwo, getting URL...');
    const kuwoUrl = await getKuwoMusicUrl(matchKuwo);
    if (kuwoUrl.code === 200 && kuwoUrl.url) {
      console.log('[MusicSearch] Got Kuwo URL');
      return kuwoUrl;
    }
  }
  
  console.log('[MusicSearch] All sources failed');
  return { code: 404, msg: '所有音源都无法播放该歌曲' };
};

const getMiguMusicUrl = async (music: Music): Promise<MusicUrlResult> => {
  try {
    const copyrightId = (music as any).copyrightId || music.id;
    
    console.log('[Migu] Getting URL for:', music.name, 'copyrightId:', copyrightId);
    
    const playApi = `https://m.music.migu.cn/migu/remoting/cms_play_tag?cid=${copyrightId}&type=2`;
    const url = `/api/proxy?url=${encodeURIComponent(playApi)}`;
    
    const response = await fetch(url);
    const data = await response.json();
    console.log('[Migu] Play response:', data);
    
    if (data.url || data.playUrl || data.src) {
      return {
        code: 200,
        url: data.url || data.playUrl || data.src,
        name: music.name,
        artist: music.artist,
        cover: music.cover,
        lyric: data.lyric
      };
    }
    
    console.log('[Migu] First attempt failed, trying search fallback...');
    const keyword = `${music.name} ${music.artist}`;
    const searchApi = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(keyword)}&type=2&pg=1`;
    const searchUrl = `/api/proxy?url=${encodeURIComponent(searchApi)}`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    console.log('[Migu] Search fallback response:', searchData);
    
    if (searchData.musics && searchData.musics.length > 0) {
      const song = searchData.musics[0];
      const newCopyrightId = song.copyrightId || song.id;
      const newPlayApi = `https://m.music.migu.cn/migu/remoting/cms_play_tag?cid=${newCopyrightId}&type=2`;
      const newPlayUrl = `/api/proxy?url=${encodeURIComponent(newPlayApi)}`;
      const playResp = await fetch(newPlayUrl);
      const playData = await playResp.json();
      console.log('[Migu] Fallback play response:', playData);
      
      if (playData.url || playData.playUrl || playData.src) {
        return {
          code: 200,
          url: playData.url || playData.playUrl || playData.src,
          name: song.songName || music.name,
          artist: song.singerName || music.artist,
          cover: song.cover || music.cover,
          lyric: playData.lyric
        };
      }
    }
    
    return { code: 404, msg: '咪咕音乐获取失败' };
  } catch (e) {
    console.error('[MusicSearch] Migu URL failed:', e);
    return { code: 500, msg: e instanceof Error ? e.message : 'Unknown error' };
  }
};

const getKuwoMusicUrl = async (music: Music): Promise<MusicUrlResult> => {
  try {
    const rid = (music as any).rid || music.id;
    
    const apiUrl = `http://www.kuwo.cn/api/v1/www/music/playInfo?mid=${rid}&type=music&httpsStatus=1`;
    const url = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'http://www.kuwo.cn/',
        'Cookie': 'kw_token=1234567890'
      }
    });
    const data = await response.json();
    console.log('[Kuwo Play] Response:', data);
    
    if (data.code === 200 && data.data?.url) {
      return {
        code: 200,
        url: data.data.url,
        name: music.name,
        artist: music.artist,
        cover: music.cover
      };
    }
    
    return { code: 404, msg: '酷我音乐获取失败' };
  } catch (e) {
    console.error('[MusicSearch] Kuwo URL failed:', e);
    return { code: 500, msg: e instanceof Error ? e.message : 'Unknown error' };
  }
};

const getQQMusicUrl = async (music: Music): Promise<MusicUrlResult> => {
  try {
    const keyword = `${music.name} ${music.artist}`;
    
    const getUrlApi = `${QQ_API_BASE}?apikey=${QQ_API_KEY}&msg=${encodeURIComponent(keyword)}&num=10&type=json&n=1`;
    const url = `/api/proxy?url=${encodeURIComponent(getUrlApi)}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    // QQ API 返回的数据没有 code 字段，直接检查是否有 url
    if (data.url) {
      // 处理封面
      let cover = '';
      if (data.cover) {
        if (typeof data.cover === 'object' && data.cover.large) {
          cover = data.cover.large;
        } else if (typeof data.cover === 'string') {
          cover = data.cover;
        }
      }
      return {
        code: 200,
        url: data.url,
        name: data.name || music.name,
        artist: Array.isArray(data.artists) ? data.artists.map((a: any) => a.name).join(', ') : (data.artist || music.artist),
        cover: cover || music.cover,
        lyric: data.lyric
      };
    }

    return { code: 404, msg: 'QQ音乐VIP歌曲，尝试其他源...' };
  } catch (e) {
    console.error('[MusicSearch] Get QQ URL failed:', e);
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

const getQishuiMusicUrl = async (music: Music): Promise<MusicUrlResult> => {
  try {
    // 使用歌曲名和歌手名搜索，获取包含播放 URL 的结果
    // 优先使用更精确的搜索词
    const keyword = `${music.name} ${music.artist}`.trim();
    
    // 尝试使用 HTTP 直接访问（代理 HTTPS 可能有兼容性问题）
    const apiUrl = `http://api-v2.cenguigui.cn/api/qishui/?msg=${encodeURIComponent(keyword)}&type=json&n=1`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
    
    const response = await fetch(proxyUrl);
    const data = await response.json();
    console.log('[Qishui Play] Response:', data);
    
    if (data?.code === 200 && data?.data) {
      // 检查是否是单个结果对象（包含播放 URL）
      if (!Array.isArray(data.data) && data.data.music && data.data.music !== 'None') {
        return {
          code: 200,
          url: data.data.music,
          name: data.data.title || music.name,
          artist: data.data.singer || music.artist,
          cover: data.data.cover || music.cover
        };
      }
      // 如果是数组，查找匹配的结果
      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          if (item.music && item.music !== 'None') {
            return {
              code: 200,
              url: item.music,
              name: item.title || music.name,
              artist: item.singer || music.artist,
              cover: item.cover || music.cover
            };
          }
        }
      }
    }
    
    // 如果还是没找到，尝试直接请求不过代理
    console.log('[Qishui Play] Proxy failed, trying direct fetch...');
    try {
      const directResponse = await fetch(apiUrl);
      const directData = await directResponse.json();
      console.log('[Qishui Play] Direct response:', directData);
      
      if (directData?.code === 200 && directData?.data && !Array.isArray(directData.data)) {
        if (directData.data.music && directData.data.music !== 'None') {
          return {
            code: 200,
            url: directData.data.music,
            name: directData.data.title || music.name,
            artist: directData.data.singer || music.artist,
            cover: directData.data.cover || music.cover
          };
        }
      }
    } catch (e) {
      console.error('[Qishui Play] Direct fetch failed:', e);
    }
    
    return { code: 404, msg: '无法获取播放链接' };
  } catch (e) {
    console.error('[MusicSearch] Qishui URL failed:', e);
    return { code: 500, msg: e instanceof Error ? e.message : 'Unknown error' };
  }
};
