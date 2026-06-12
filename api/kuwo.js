
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
    const searchUrl = `http://www.kuwo.cn/api/www/search/searchMusicBykeyWord?key=${encodeURIComponent(keyword)}&pn=1&rn=30`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'http://www.kuwo.cn/',
        'Cookie': 'kw_token=1234567890',
      }
    });

    const data = await response.json();
    
    if (data.code === 200 && data.data?.list) {
      const results = data.data.list.map(item => ({
        id: String(item.rid || item.id),
        name: item.name || item.songname || '',
        artist: item.artist || item.singer || '',
        album: item.album || '',
        cover: item.pic || item.albumpic || '',
        duration: item.duration || 0,
        url: '',
        source: 'kuwo',
        rid: item.rid
      }));
      
      return res.status(200).json({ code: 200, results });
    }

    return res.status(200).json({ code: 404, msg: 'No results' });
  } catch (error) {
    return res.status(500).json({ code: 500, msg: error.message });
  }
}
