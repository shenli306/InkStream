export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.query?.folder) return res.status(400).json({ error: 'Folder parameter is required' });
  return res.status(200).json({ list: [], total: 0, hasMore: false, page: 1, limit: 50 });
}
