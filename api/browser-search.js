
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.status(200).json({ 
    success: false, 
    message: "Server-side browser rendering is not supported in this environment. The application uses client-side proxy for novel search. Please ensure your network can access the novel websites directly or try using a different search source." 
  });
}
