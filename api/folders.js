import { MongoClient } from 'mongodb';

const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db('imageApp');
    const collection = db.collection('folders');

    if (req.method === 'GET') {
      // Get all folders with image count
      const folders = await collection.find({}).toArray();
      
      // Get image counts for each folder
      const imageCollection = db.collection('images');
      for (let folder of folders) {
        const count = await imageCollection.countDocuments({ folder_id: folder._id.toString() });
        folder.image_count = count;
      }
      
      res.status(200).json(folders);
    } 
    else if (req.method === 'POST') {
      const { name } = req.body;
      
      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Folder name is required' });
      }
      
      // Check for duplicate folder name
      const existing = await collection.findOne({ name: name.trim() });
      if (existing) {
        return res.status(400).json({ error: 'A folder with this name already exists' });
      }
      
      const result = await collection.insertOne({
        name: name.trim(),
        created_at: new Date().toISOString()
      });
      
      res.status(201).json({
        id: result.insertedId,
        name: name.trim(),
        created_at: new Date().toISOString()
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