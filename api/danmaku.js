
import { kv } from '@vercel/kv';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    try {
      const currentCommit = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
      const storedCommit = await kv.get('last_commit_sha');

      if (storedCommit && storedCommit !== currentCommit) {
        console.log(`[Danmaku] New deployment detected (${currentCommit}), clearing old danmaku...`);
        await kv.del('danmaku_list');
        await kv.set('last_commit_sha', currentCommit);
      } else if (!storedCommit) {
        await kv.set('last_commit_sha', currentCommit);
      }

      const data = await kv.get('danmaku_list');
      return res.status(200).json(data || []);
    } catch (e) {
      console.error("[Danmaku API] Error:", e);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      // 读取 POST body - Vercel Node.js runtime 中 req 是可读流
      let body;
      if (req.body) {
        body = req.body;
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf-8');
        body = JSON.parse(raw);
      }
      await kv.set('danmaku_list', body);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
