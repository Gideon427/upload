import { MongoClient, ObjectId } from 'mongodb';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';
import multer from 'multer';

const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri);

// Configure multer for memory storage (Vercel compatible)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 40
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Disable body parser for this route (multer handles it)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to run middleware
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    await client.connect();
    const db = client.db('imageApp');
    const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

    if (req.method === 'GET') {
      // Get all images for this folder
      const images = db.collection('images');
      const results = await images.find({ folder_id: id }).toArray();
      
      // Get file info from GridFS
      const files = await bucket.find({}).toArray();
      
      // Combine metadata with file info
      const combined = results.map(img => {
        const fileInfo = files.find(f => f.filename === img.stored_name);
        return {
          ...img,
          url: `/api/images/${img._id}`,
          fileInfo: fileInfo || null
        };
      });
      
      res.status(200).json(combined);
    } 
    else if (req.method === 'POST') {
      // Handle file upload
      await runMiddleware(req, res, upload.array('images', 40));

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded' });
      }

      const uploadedImages = [];
      const errors = [];

      for (const file of req.files) {
        try {
          // Generate unique filename
          const ext = file.originalname.split('.').pop();
          const storedName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

          // Upload to GridFS
          const uploadStream = bucket.openUploadStream(storedName, {
            contentType: file.mimetype,
            metadata: {
              originalName: file.originalname,
              size: file.size,
              folder_id: id
            }
          });

          // Write buffer to stream
          const bufferStream = new Readable();
          bufferStream.push(file.buffer);
          bufferStream.push(null);
          bufferStream.pipe(uploadStream);

          // Wait for upload to complete
          await new Promise((resolve, reject) => {
            uploadStream.on('finish', resolve);
            uploadStream.on('error', reject);
          });

          // Save metadata to images collection
          const images = db.collection('images');
          const result = await images.insertOne({
            folder_id: id,
            filename: file.originalname,
            stored_name: storedName,
            file_size: file.size,
            mime_type: file.mimetype,
            uploaded_at: new Date().toISOString()
          });

          uploadedImages.push({
            id: result.insertedId,
            filename: file.originalname,
            stored_name: storedName,
            file_size: file.size,
            mime_type: file.mimetype
          });
        } catch (error) {
          errors.push({ filename: file.originalname, error: error.message });
        }
      }

      res.status(201).json({
        success: true,
        total: req.files.length,
        uploaded: uploadedImages.length,
        images: uploadedImages,
        errors: errors
      });
    } 
    else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.close();
  }
}