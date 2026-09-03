export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Downloads are written to the user's local Vite workspace and are not
  // persisted by Vercel serverless functions.
  return res.status(200).json([]);
}
