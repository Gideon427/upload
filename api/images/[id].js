import { MongoClient, ObjectId } from 'mongodb';
import { GridFSBucket } from 'mongodb';

const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await client.connect();
    const db = client.db('imageApp');
    const images = db.collection('images');
    const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

    // Get image metadata
    const image = await images.findOne({ _id: new ObjectId(id) });
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Find and delete the file from GridFS
    const files = await bucket.find({ filename: image.stored_name }).toArray();
    if (files.length > 0) {
      await bucket.delete(files[0]._id);
    }

    // Delete metadata from images collection
    await images.deleteOne({ _id: new ObjectId(id) });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.close();
  }
}
