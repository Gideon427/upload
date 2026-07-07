import { MongoClient, ObjectId } from 'mongodb';

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
    const folders = db.collection('folders');
    const images = db.collection('images');

    // Check if folder exists
    const folder = await folders.findOne({ _id: new ObjectId(id) });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Delete all images in the folder
    await images.deleteMany({ folder_id: id });

    // Delete the folder
    await folders.deleteOne({ _id: new ObjectId(id) });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.close();
  }
}