// app.js - Entrypoint for Vercel
console.log('✅ Upload app is running on Vercel');

// This handler is for the root route
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    message: 'API is ready!',
    endpoints: [
      'GET /api/folders - Get all folders',
      'POST /api/folders - Create folder',
      'DELETE /api/folders/:id - Delete folder',
      'GET /api/folders/:id/images - Get images in folder',
      'POST /api/folders/:id/images - Upload images',
      'DELETE /api/images/:id - Delete image'
    ]
  });
}