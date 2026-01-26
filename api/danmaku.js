import { kv } from '@vercel/kv';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    try {
      // 检查当前部署版本是否变化，如果变化则清空弹幕喵~
      // VERCEL_GIT_COMMIT_SHA 是系统环境变量
      const currentCommit = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
      const storedCommit = await kv.get('last_commit_sha');

      if (storedCommit && storedCommit !== currentCommit) {
        console.log(`[Danmaku API] New deployment detected (${currentCommit}), clearing old danmaku...`);
        await kv.del('danmaku_list');
        await kv.set('last_commit_sha', currentCommit);
      } else if (!storedCommit) {
        // 初始化 commit SHA
        await kv.set('last_commit_sha', currentCommit);
      }

      const data = await kv.get('danmaku_list');
      return new Response(JSON.stringify(data || []), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e) {
      console.error("[Danmaku API] Error:", e);
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      await kv.set('danmaku_list', body);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }
}
