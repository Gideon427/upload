// server.js - Final Version (Images + Video + Voice Notes)
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

    db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        type TEXT DEFAULT 'image',   -- image, audio, video
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
    )`);
});

// ====================== MULTER ======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderPath = path.join(uploadsDir, req.params.folderId);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        cb(null, folderPath);
    },
    filename: (req, file, cb) => {
        let filename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max (good for videos)
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg','image/png','image/gif','image/webp',
            'audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/m4a','audio/webm',
            'video/mp4','video/webm','video/ogg','video/quicktime'
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only images, audio & video files allowed'), false);
    }
});

// ====================== ROUTES ======================

app.get('/api/folders', (req, res) => {
    db.all(`
        SELECT f.*, COUNT(i.id) as file_count 
        FROM folders f LEFT JOIN files i ON f.id = i.folder_id 
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

app.delete('/api/folders/:id', (req, res) => {
    const { id } = req.params;
    const folderPath = path.join(uploadsDir, id.toString());

    db.run('DELETE FROM folders WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).send(err.message);
        if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
        res.json({ success: true });
    });
});

// Download as ZIP
app.get('/api/folders/:id/download', (req, res) => { 
    // Keep your existing download code here
    const { id } = req.params;
    db.get('SELECT name FROM folders WHERE id = ?', [id], (err, folder) => {
        if (err || !folder) return res.status(404).send('Folder not found');

        db.all('SELECT filename, file_path FROM files WHERE folder_id = ?', [id], (err, files) => {
            if (err || files.length === 0) return res.status(404).send('No files');

            const archive = archiver('zip', { zlib: { level: 6 } });
            res.attachment(`${folder.name}.zip`);
            archive.pipe(res);

            files.forEach(f => {
                const filePath = path.join(__dirname, f.file_path);
                if (fs.existsSync(filePath)) archive.file(filePath, { name: f.filename });
            });
            archive.finalize();
        });
    });
});

// Rename any file (image, video, voice)
app.put('/api/files/:id/rename', (req, res) => {
    const { id } = req.params;
    let { newName } = req.body;
    if (!newName || !newName.trim()) return res.status(400).send('New name required');

    newName = newName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');

    db.get('SELECT * FROM files WHERE id = ?', [id], (err, file) => {
        if (err || !file) return res.status(404).send('File not found');

        const oldPath = path.join(__dirname, file.file_path);
        const ext = path.extname(file.filename);
        const newFilename = path.basename(newName, ext) + ext;
        const newFilePath = `/uploads/${file.folder_id}/${newFilename}`;
        const newFullPath = path.join(__dirname, newFilePath);

        try {
            if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newFullPath);

            db.run(`UPDATE files SET filename = ?, file_path = ? WHERE id = ?`,
                [newFilename, newFilePath, id], (err) => {
                    if (err) return res.status(500).send(err.message);
                    res.json({ success: true, filename: newFilename });
                });
        } catch (error) {
            res.status(500).send('Failed to rename file');
        }
    });
});

// Upload Route (Images + Video + Audio)
app.post('/api/folders/:folderId/files', upload.array('files', 20), (req, res) => {
    const { folderId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).send('No files uploaded');

    for (const file of files) {
        const relativePath = `/uploads/${folderId}/${file.filename}`;
        let fileType = 'image';
        if (file.mimetype.startsWith('audio/')) fileType = 'audio';
        if (file.mimetype.startsWith('video/')) fileType = 'video';

        db.run(`
            INSERT INTO files (folder_id, filename, file_path, file_size, mime_type, type)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [folderId, file.filename, relativePath, file.size, file.mimetype, fileType]);
    }

    res.json({ success: true, count: files.length });
});

app.get('/api/folders/:folderId/files', (req, res) => {
    const { folderId } = req.params;
    db.all('SELECT * FROM files WHERE folder_id = ? ORDER BY uploaded_at DESC', [folderId], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

app.delete('/api/files/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM files WHERE id = ?', [id], (err, file) => {
        if (err || !file) return res.status(404).send('File not found');

        const fullPath = path.join(__dirname, file.file_path);
        db.run('DELETE FROM files WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).send(err.message);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            res.json({ success: true });
        });
    });
});

app.use('/uploads', express.static(uploadsDir));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`\n🚀 Upload App running at http://localhost:${PORT}`);
    console.log('✅ Images + Videos + Voice Notes supported');
    console.log('✅ Inline rename for all file types\n');
});