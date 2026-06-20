// public/script.js - Inline Rename (Best Version)
let currentFolderId = null;
let currentFolderName = '';

// ==================== HELPERS ====================
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? '#ef4444' : '#1e2937';
    toast.style.display = 'flex';
    setTimeout(() => toast.style.display = 'none', 3000);
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// API Helper
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Request failed');
        }
        return response.json();
    } catch (err) {
        showToast(err.message, true);
        throw err;
    }
}

// ==================== FOLDERS ====================
async function loadFolders() {
    try {
        const folders = await apiRequest('/api/folders');
        const grid = document.getElementById('folders-grid');
        grid.innerHTML = '';

        if (folders.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 80px 20px; color: #64748b;">
                    <i class="fas fa-folder-open" style="font-size: 64px; margin-bottom: 16px; opacity: 0.4;"></i>
                    <h3>No folders yet</h3>
                    <p>Click "New Folder" to get started</p>
                </div>`;
            return;
        }

        folders.forEach(folder => {
            const card = document.createElement('div');
            card.className = 'folder-card';
            card.innerHTML = `
                <div class="folder-icon">📁</div>
                <h3>${escapeHtml(folder.name)}</h3>
                <div class="meta">${folder.image_count || 0} images • ${new Date(folder.created_at).toLocaleDateString()}</div>
                <div class="delete-folder-btn" onclick="event.stopImmediatePropagation(); deleteFolder(${folder.id});">
                    <i class="fas fa-trash"></i>
                </div>
            `;
            card.onclick = () => openFolder(folder.id, folder.name);
            grid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

function showCreateFolderModal() {
    document.getElementById('create-folder-modal').classList.remove('hidden');
    document.getElementById('folder-name-input').focus();
}

function closeModal() {
    document.getElementById('create-folder-modal').classList.add('hidden');
    document.getElementById('folder-name-input').value = '';
}

async function createFolder() {
    const name = document.getElementById('folder-name-input').value.trim();
    if (!name) return showToast('Folder name is required', true);

    try {
        await apiRequest('/api/folders', { method: 'POST', body: JSON.stringify({ name }) });
        closeModal();
        showToast('Folder created successfully');
        loadFolders();
    } catch (e) {
        showToast(e.message, true);
    }
}

async function deleteFolder(id) {
    if (!confirm('Delete this folder and ALL images?')) return;
    try {
        await apiRequest(`/api/folders/${id}`, { method: 'DELETE' });
        showToast('Folder deleted');
        loadFolders();
    } catch (e) {
        showToast('Failed to delete folder', true);
    }
}

// ==================== FOLDER VIEW ====================
function openFolder(id, name) {
    currentFolderId = id;
    currentFolderName = name;
    document.getElementById('folders-view').classList.add('hidden');
    document.getElementById('folder-detail-view').classList.remove('hidden');
    document.getElementById('current-folder-name').textContent = name;
    loadImages(id);
}

function goBackToFolders() {
    currentFolderId = null;
    document.getElementById('folder-detail-view').classList.add('hidden');
    document.getElementById('folders-view').classList.remove('hidden');
    loadFolders();
}

// ==================== IMAGES WITH INLINE EDIT ====================
async function loadImages(folderId) {
    try {
        const images = await apiRequest(`/api/folders/${folderId}/images`);
        const grid = document.getElementById('images-grid');
        grid.innerHTML = '';

        if (images.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 80px 20px; color: #64748b;">
                    <i class="fas fa-images" style="font-size: 72px; margin-bottom: 20px; opacity: 0.3;"></i>
                    <h3>No images yet</h3>
                    <p>Upload some images to this folder</p>
                </div>`;
            return;
        }

        images.forEach(img => {
            const card = document.createElement('div');
            card.className = 'image-card';
            
            card.innerHTML = `
                <img src="${img.file_path}" alt="${escapeHtml(img.filename)}" loading="lazy">
                <div class="image-info">
                    <span class="filename" data-id="${img.id}">${escapeHtml(img.filename)}</span>
                    <span class="rename-btn" title="Rename">✎</span>
                </div>
                <div class="delete-image-btn" title="Delete">
                    <i class="fas fa-times"></i>
                </div>
            `;

            // Click on filename to edit inline
            const filenameSpan = card.querySelector('.filename');
            filenameSpan.addEventListener('click', (e) => {
                e.stopImmediatePropagation();
                makeFilenameEditable(filenameSpan, img.id);
            });

            card.querySelector('.rename-btn').addEventListener('click', (e) => {
                e.stopImmediatePropagation();
                makeFilenameEditable(filenameSpan, img.id);
            });

            card.querySelector('.delete-image-btn').addEventListener('click', (e) => {
                e.stopImmediatePropagation();
                deleteImage(img.id);
            });

            grid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

function makeFilenameEditable(span, imageId) {
    const oldName = span.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.style.width = '100%';
    input.style.fontSize = '13px';
    input.style.padding = '2px 4px';

    span.replaceWith(input);
    input.focus();
    input.select();

    const save = async () => {
        let newName = input.value.trim();
        if (newName && newName !== oldName) {
            await renameImage(imageId, newName);
        } else {
            input.replaceWith(span);
        }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') input.replaceWith(span);
    });
}

async function renameImage(id, newName) {
    try {
        const res = await fetch(`/api/images/${id}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: newName.trim() })
        });

        if (!res.ok) throw new Error(await res.text());

        showToast('✅ Image renamed successfully (file updated on disk)');
        loadImages(currentFolderId);
    } catch (e) {
        showToast(e.message || 'Failed to rename image', true);
    }
}

async function deleteImage(id) {
    if (!confirm('Delete this image permanently?')) return;
    try {
        await apiRequest(`/api/images/${id}`, { method: 'DELETE' });
        showToast('Image deleted');
        loadImages(currentFolderId);
    } catch (e) {
        showToast('Failed to delete image', true);
    }
}

function triggerUpload() {
    document.getElementById('file-input').click();
}

// Upload Handler
document.getElementById('file-input').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length || !currentFolderId) return;
    if (files.length > 40) return showToast('Maximum 40 images allowed', true);

    const formData = new FormData();
    for (let file of files) formData.append('images', file);

    const progressContainer = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';

    try {
        const response = await fetch(`/api/folders/${currentFolderId}/images`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        progressFill.style.width = '100%';
        progressText.textContent = 'Upload complete!';

        setTimeout(() => {
            progressContainer.classList.add('hidden');
            loadImages(currentFolderId);
            showToast(`Successfully uploaded ${files.length} image(s)`);
        }, 800);
    } catch (err) {
        progressContainer.classList.add('hidden');
        showToast(err.message || 'Upload failed', true);
    }

    e.target.value = '';
});

function downloadCurrentFolder() {
    if (!currentFolderId) return;
    showToast('Preparing ZIP download...');
    window.location.href = `/api/folders/${currentFolderId}/download`;
}

async function deleteCurrentFolder() {
    if (!currentFolderId || !confirm('Delete this folder and all images?')) return;
    try {
        await apiRequest(`/api/folders/${currentFolderId}`, { method: 'DELETE' });
        showToast('Folder deleted');
        goBackToFolders();
    } catch (e) {
        showToast('Delete failed', true);
    }
}

// Initialize
window.onload = () => {
    loadFolders();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        }
    });
};