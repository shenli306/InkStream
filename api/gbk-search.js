export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

import iconv from 'iconv-lite';

export default async function handler(req) {
  const url = new URL(req.url);
  const target = url.searchParams.get('target');
  const keyword = url.searchParams.get('keyword');
  const method = url.searchParams.get('method') || 'GET';
  const data = url.searchParams.get('data');

  if (!target || !keyword) {
    return new Response("Missing parameters", { status: 400 });
  }

  try {
    const buf = iconv.encode(keyword, 'gbk');
    let encodedKeyword = '';
    for (let i = 0; i < buf.length; i++) {
      encodedKeyword += '%' + buf[i].toString(16).toUpperCase().padStart(2, '0');
    }

    let finalUrl = target.replace('{keyword}', encodedKeyword);
    
    const fetchOptions = {
      method: method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.jizai22.com/'
      }
    };
    
    if (method === 'POST' && data) {
      fetchOptions.body = data.replace('{keyword}', encodedKeyword);
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const response = await fetch(finalUrl, fetchOptions);
    const buffer = await response.arrayBuffer();
    
    const newHeaders = new Headers();
    newHeaders.set('Content-Type', 'text/html; charset=gbk');
    newHeaders.set('Access-Control-Allow-Origin', '*');
    
    return new Response(Buffer.from(buffer), {
      status: response.status,
      headers: newHeaders
    });
  } catch (e) {
    console.error("GBK Search Error:", e);
    return new Response(e.message, { status: 500 });
  }
}
