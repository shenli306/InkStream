export const config = { runtime: 'nodejs', maxDuration: 10 };

// Local media directories are available during Vite development, but are not
// guaranteed to exist in a serverless deployment. Return an empty, stable shape.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(200).json({
    list: [],
    total: 0,
    hasMore: false,
    page: Number.parseInt(req.query?.page || '1', 10) || 1,
    limit: Number.parseInt(req.query?.limit || '20', 10) || 20,
  });
}
