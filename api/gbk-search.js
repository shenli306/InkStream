
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

import iconv from 'iconv-lite';

export default async function handler(req, res) {
  try {
    const target = req.query.target;
    const keyword = req.query.keyword;
    const method = req.query.method || 'GET';
    const data = req.query.data;

    if (!target || !keyword) {
      return res.status(400).send('Missing parameters');
    }

    const buf = iconv.encode(String(keyword), 'gbk');
    let encodedKeyword = '';
    for (let i = 0; i < buf.length; i++) {
      encodedKeyword += '%' + buf[i].toString(16).toUpperCase().padStart(2, '0');
    }

    const finalUrl = String(target).replace('{keyword}', encodedKeyword);

    const fetchOptions = {
      method: method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.jizai22.com/',
      },
    };

    if (method === 'POST' && data) {
      fetchOptions.body = String(data).replace('{keyword}', encodedKeyword);
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const response = await fetch(finalUrl, fetchOptions);
    const arrayBuffer = await response.arrayBuffer();

    // 原样转发响应头（除了 transfer-encoding 等特殊头）
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === 'content-encoding' || lowerKey === 'content-length' || lowerKey === 'transfer-encoding' || lowerKey === 'connection' || lowerKey === 'keep-alive' || lowerKey === 'upgrade'
      ) {
        return;
      }
      res.setHeader(key, value);
    });

    res.setHeader('Content-Type', 'text/html; charset=gbk');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status);
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error('GBK Search Error:', e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).send(e.message || 'Internal error');
  }
}
