
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  const keyword = req.query.keyword;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!keyword) {
    return res.status(400).json({ code: 400, msg: 'Missing keyword' });
  }

  try {
    const searchUrl = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(keyword)}&type=2&pg=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://m.music.migu.cn/',
      }
    });

    const data = await response.json();
    console.log('[Migu Search] Response code check:', data.code || 'no code');
    
    if (data.musics && data.musics.length > 0) {
      const results = data.musics.map(item => ({
        id: item.copyrightId || item.id,
        name: item.songName || item.title || '',
        artist: item.singerName || item.singer || '',
        album: item.albumName || item.album || '',
        cover: item.cover || item.albumPicUrl || '',
        duration: item.length || 0,
        url: '',
        source: 'migu',
        songId: item.songId || item.id,
        copyrightId: item.copyrightId,
        lyricUrl: item.lyricUrl || ''
      }));
      
      return res.status(200).json({ code: 200, results });
    }

    return res.status(200).json({ code: 404, msg: 'No results' });
  } catch (error) {
    console.error('[Migu Search] Error:', error);
    return res.status(500).json({ code: 500, msg: error.message });
  }
}
