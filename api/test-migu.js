export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const keyword = url.searchParams.get('keyword') || '周杰伦 青花瓷';

  try {
    console.log('[Test Migu] Searching for:', keyword);
    
    const searchUrl = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(keyword)}&type=2&pg=1`;
    
    const searchResp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://m.music.migu.cn/',
      }
    });

    const searchData = await searchResp.json();
    console.log('[Test Migu] Search response:', JSON.stringify(searchData, null, 2));
    
    if (searchData.musics && searchData.musics.length > 0) {
      const song = searchData.musics[0];
      console.log('[Test Migu] Found song:', song);
      
      const playApi = `https://m.music.migu.cn/migu/remoting/cms_play_tag?cid=${song.copyrightId}&type=2`;
      const playResp = await fetch(playApi, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Referer': 'https://m.music.migu.cn/',
        }
      });
      
      const playData = await playResp.json();
      console.log('[Test Migu] Play response:', JSON.stringify(playData, null, 2));
      
      return new Response(JSON.stringify({
        search: searchData,
        play: playData,
        url: playData.url || playData.playUrl || playData.src,
        success: !!(playData.url || playData.playUrl || playData.src)
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    return new Response(JSON.stringify({
      error: 'No songs found',
      search: searchData
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    console.error('[Test Migu] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
