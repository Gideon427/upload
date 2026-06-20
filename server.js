// server.js - Final Version with Real Filenames
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const archiver = require('archiver');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
    )`);
});

// ====================== MULTER - Use Real Filename ======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderPath = path.join(uploadsDir, req.params.folderId);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        cb(null, folderPath);
    },
    filename: (req, file, cb) => {
        // Sanitize original filename
        let filename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'), false);
    }
});

// ====================== ROUTES ======================

app.get('/api/folders', (req, res) => {
    db.all(`
        SELECT f.*, COUNT(i.id) as image_count 
        FROM folders f LEFT JOIN images i ON f.id = i.folder_id 
        GROUP BY f.id ORDER BY f.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

app.post('/api/folders', (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).send('Folder name required');

    db.run('INSERT INTO folders (name) VALUES (?)', [name.trim()], function(err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') return res.status(409).send('Folder name already exists');
            return res.status(500).send(err.message);
        }
        res.json({ id: this.lastID, name: name.trim() });
    });
});

app.delete('/api/folders/:id', (req, res) => { /* same as before */ });

// Download folder as ZIP
app.get('/api/folders/:id/download', (req, res) => { /* same as before */ });

// ====================== RENAME IMAGE (Changes real file) ======================
app.put('/api/images/:id/rename', (req, res) => {
    const { id } = req.params;
    let { newName } = req.body;

    if (!newName || !newName.trim()) return res.status(400).send('New name required');

    newName = newName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');

    db.get('SELECT * FROM images WHERE id = ?', [id], (err, image) => {
        if (err || !image) return res.status(404).send('Image not found');

        const oldFullPath = path.join(__dirname, image.file_path);
        const ext = path.extname(image.filename);
        const newFilename = path.basename(newName, ext) + ext;
        const newFilePath = `/uploads/${image.folder_id}/${newFilename}`;
        const newFullPath = path.join(__dirname, newFilePath);

        try {
            if (fs.existsSync(oldFullPath)) {
                fs.renameSync(oldFullPath, newFullPath);
            }

            db.run(`
                UPDATE images 
                SET filename = ?, file_path = ? 
                WHERE id = ?
            `, [newFilename, newFilePath, id], (err) => {
                if (err) return res.status(500).send(err.message);
                res.json({ success: true, filename: newFilename });
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Failed to rename file');
        }
    });
});

// Upload images (real names)
app.post('/api/folders/:folderId/images', upload.array('images', 40), (req, res) => {
    const { folderId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).send('No files uploaded');

    for (const file of files) {
        const relativePath = `/uploads/${folderId}/${file.filename}`;

        db.run(`
            INSERT INTO images (folder_id, filename, file_path, file_size, mime_type)
            VALUES (?, ?, ?, ?, ?)
        `, [folderId, file.filename, relativePath, file.size, file.mimetype]);
    }

    res.json({ success: true, count: files.length });
});

app.get('/api/folders/:folderId/images', (req, res) => {
    const { folderId } = req.params;
    db.all('SELECT * FROM images WHERE folder_id = ? ORDER BY uploaded_at DESC', [folderId], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

app.delete('/api/images/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM images WHERE id = ?', [id], (err, image) => {
        if (err || !image) return res.status(404).send('Image not found');

        const fullPath = path.join(__dirname, image.file_path);
        
        db.run('DELETE FROM images WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).send(err.message);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            res.json({ success: true });
        });
    });
});

app.use('/uploads', express.static(uploadsDir));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 PhotoVault running at http://localhost:${PORT}`);
    console.log('✅ Files now use real names (no UUID)');
    console.log('✅ Rename on website = Rename on disk\n');
});