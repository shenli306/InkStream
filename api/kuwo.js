export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const keyword = url.searchParams.get('keyword');

  if (!keyword) {
    return new Response(JSON.stringify({ code: 400, msg: 'Missing keyword' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
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
      
      return new Response(JSON.stringify({ code: 200, results }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({ code: 404, msg: 'No results' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ code: 500, msg: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
