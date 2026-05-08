
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.status(200).json({ 
    success: false, 
    message: "Server-side browser rendering is not supported in this environment." 
  });
}
