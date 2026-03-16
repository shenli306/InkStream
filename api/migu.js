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
    const searchUrl = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(keyword)}&type=2&pg=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://m.music.migu.cn/',
      }
    });

    const data = await response.json();
    console.log('[Migu Search] Response:', data);
    
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
      
      return new Response(JSON.stringify({ code: 200, results }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({ code: 404, msg: 'No results', raw: data }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    console.error('[Migu Search] Error:', error);
    return new Response(JSON.stringify({ code: 500, msg: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
