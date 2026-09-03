
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  const keyword = req.query.keyword;

  if (!keyword) {
    return res.status(400).json({ code: 400, msg: 'Missing keyword' });
  }

  try {
    const searchUrl = `https://www.gequke.com/song/${encodeURIComponent(String(keyword))}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    const html = await response.text();

    const results = [];
    const jsonMatches = html.match(/data\s*=\s*(\{[\s\S]*?\});/g) || [];
    for (const match of jsonMatches) {
      const dataMatch = match.match(/data\s*=\s*(\{[\s\S]*?\});/);
      if (dataMatch) {
        try {
          const data = JSON.parse(dataMatch[1]);
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item.songmid || item.songname || item.title) {
                results.push({
                  id: item.songmid || item.songid || Math.random(),
                  name: item.songname || item.title || '',
                  artist: item.artist || item.singer || item.author || '',
                  album: item.albumname || item.album || '',
                  cover: item.picurl || item.pic || '',
                  duration: item.duration || 0,
                  url: item.url || item.musicUrl || item.songurl || '',
                  source: 'gequke',
                });
              }
            }
          }
        } catch (e) {}
      }
    }

    if (results.length > 0) {
      return res.status(200).json({ code: 200, results });
    }

    return res.status(200).json({ code: 404, msg: 'No results found', html: html.substring(0, 500) });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error.message });
  }
}
