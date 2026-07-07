// ==================== STATE ====================
let currentFolderId = null;
let currentFolderName = '';
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let searchableItems = [];
let currentFilter = 'all';
let searchTerm = '';

// ==================== HELPERS ====================
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = isError ? '#ef4444' : '#1e2937';
    toast.style.display = 'flex';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.style.display = 'none', 3000);
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

// API Helper - FIXED for Vercel
async function apiRequest(url, options = {}) {
    try {
        const headers = options.body ? { 'Content-Type': 'application/json' } : {};
        const response = await fetch(url, {
            headers: headers,
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

// ==================== SEARCH FUNCTIONS ====================
async function initSearch() {
    try {
        const folders = await apiRequest('/api/folders');
        let allFiles = [];
        for (const folder of folders) {
            try {
                const files = await apiRequest(`/api/folders/${folder.id}/images`);
                allFiles = allFiles.concat(files.map(f => ({ 
                    ...f, 
                    folderName: folder.name, 
                    folderId: folder.id 
                })));
            } catch (e) {
                // Folder might have no images
            }
        }
        
        const folderItems = folders.map(f => ({
            id: f.id,
            name: f.name,
            displayType: 'folder',
            icon: 'fa-folder',
            badge: 'Folder',
            badgeClass: 'folder-badge',
            searchableText: f.name,
            file_count: f.image_count || 0,
            created_at: f.created_at,
            isFolder: true,
            file_path: null,
            mime_type: null,
            _id: f.id
        }));

        const fileItems = allFiles.map(f => ({
            id: f.id,
            name: f.filename,
            displayType: getFileType(f.mime_type),
            icon: getIconForType(f.mime_type),
            badge: getFileType(f.mime_type).charAt(0).toUpperCase() + getFileType(f.mime_type).slice(1),
            badgeClass: getBadgeClass(f.mime_type),
            searchableText: f.filename + ' ' + (f.folderName || ''),
            folder: f.folderName,
            folderId: f.folderId,
            size: f.file_size ? formatFileSize(f.file_size) : null,
            created_at: f.uploaded_at || f.created_at,
            isFile: true,
            file_path: f.url || f.file_path,
            mime_type: f.mime_type,
            type: f.mime_type,
            _id: f.id
        }));

        searchableItems = [...folderItems, ...fileItems];
        updateSearchCounts();
        
        const searchView = document.getElementById('search-view');
        if (searchView && !searchView.classList.contains('hidden')) {
            performSearch();
        }
    } catch (err) {
        console.error('Failed to initialize search:', err);
    }
}

function getFileType(mimeType) {
    if (!mimeType) return 'other';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'other';
}

function getIconForType(mimeType) {
    const type = getFileType(mimeType);
    const icons = {
        image: 'fa-image',
        audio: 'fa-music',
        video: 'fa-video',
        folder: 'fa-folder',
        other: 'fa-file'
    };
    return icons[type] || 'fa-file';
}

function getBadgeClass(mimeType) {
    const type = getFileType(mimeType);
    const classes = {
        folder: 'folder-badge',
        image: 'image-badge',
        audio: 'audio-badge',
        video: 'video-badge',
        other: 'other-badge'
    };
    return classes[type] || 'other-badge';
}

function performSearch() {
    const input = document.getElementById('search-input-main');
    if (!input) return;
    
    searchTerm = input.value.trim();
    
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) {
        clearBtn.classList.toggle('visible', searchTerm.length > 0);
    }

    const results = filterSearchItems();
    renderSearchResults(results);
    updateSearchStats(results.length);
}

function filterSearchItems() {
    let filtered = searchableItems;

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(item => 
            item.searchableText.toLowerCase().includes(term)
        );
    }

    if (currentFilter !== 'all') {
        filtered = filtered.filter(item => {
            if (currentFilter === 'folders') return item.isFolder;
            return item.displayType === currentFilter;
        });
    }

    return filtered;
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    if (!container) return;
    
    if (results.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 80px 20px; color: #94a3b8;">
                <i class="fas fa-search" style="font-size: 64px; margin-bottom: 16px; opacity: 0.3;"></i>
                <h3 style="color: #475569;">No results found</h3>
                <p>Try adjusting your search terms or filters</p>
            </div>
        `;
        return;
    }

    container.innerHTML = results.map(item => {
        if (item.isFolder) {
            return `
                <div class="search-result-card" onclick="openSearchItem('${item.id}', true)">
                    <div class="folder-thumbnail" style="aspect-ratio: 16/9; background: linear-gradient(135deg, #e0e7ff, #c7d2fe); display: flex; align-items: center; justify-content: center;">
                        <div style="text-align: center; padding: 20px;">
                            <div style="font-size: 64px;">📁</div>
                            <div style="font-weight: 600; margin-top: 8px; font-size: 16px;">${highlightMatch(item.name)}</div>
                            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${item.file_count || 0} files</div>
                        </div>
                    </div>
                    <div class="info">
                        <div class="name">${highlightMatch(item.name)}</div>
                        <div class="meta">
                            <span><i class="fas fa-cubes"></i> ${item.file_count || 0} items</span>
                            <span><i class="fas fa-calendar"></i> ${item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                    <span class="badge folder-badge">Folder</span>
                </div>
            `;
        } else {
            let thumbnailHtml = '';
            const fileType = getFileType(item.mime_type);
            
            if (fileType === 'image' && item.file_path) {
                thumbnailHtml = `<img src="${item.file_path}" alt="${escapeHtml(item.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`;
            } else if (fileType === 'video' && item.file_path) {
                thumbnailHtml = `
                    <video muted style="width:100%;height:100%;object-fit:cover;">
                        <source src="${item.file_path}" type="${item.mime_type}">
                    </video>
                `;
            } else if (fileType === 'audio' && item.file_path) {
                thumbnailHtml = `
                    <div style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #fce7f3, #fbcfe8); width:100%;height:100%;">
                        <i class="fas fa-music" style="font-size: 48px; color: #9d174d;"></i>
                    </div>
                `;
            } else {
                thumbnailHtml = `
                    <div style="display: flex; align-items: center; justify-content: center; background: #f1f5f9; width:100%;height:100%;">
                        <i class="fas fa-file" style="font-size: 48px; color: #94a3b8;"></i>
                    </div>
                `;
            }

            return `
                <div class="search-result-card" onclick="openSearchItem('${item.id}', false)">
                    <div class="thumbnail" style="aspect-ratio:1; overflow:hidden; background:#f1f5f9;">
                        ${thumbnailHtml}
                    </div>
                    <div class="info">
                        <div class="name">${highlightMatch(item.name)}</div>
                        <div class="meta">
                            <span><i class="fas fa-tag"></i> ${item.folder || 'Root'}</span>
                            ${item.size ? `<span><i class="fas fa-weight-hanging"></i> ${item.size}</span>` : ''}
                            <span><i class="fas fa-calendar"></i> ${item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                    <span class="badge ${item.badgeClass}">${item.badge}</span>
                </div>
            `;
        }
    }).join('');
}

function highlightMatch(text) {
    if (!searchTerm || !text) return escapeHtml(text);
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="highlight">$1</span>');
}

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    performSearch();
}

function updateSearchCounts() {
    const counts = {
        all: searchableItems.length,
        folders: searchableItems.filter(i => i.isFolder).length,
        image: searchableItems.filter(i => i.displayType === 'image').length,
        audio: searchableItems.filter(i => i.displayType === 'audio').length,
        video: searchableItems.filter(i => i.displayType === 'video').length,
    };

    Object.keys(counts).forEach(key => {
        const el = document.getElementById(`count-${key}`);
        if (el) el.textContent = counts[key];
    });
}

function updateSearchStats(count) {
    const infoEl = document.getElementById('results-info');
    const timeEl = document.getElementById('search-time');
    if (infoEl) infoEl.innerHTML = `Found <strong>${count}</strong> results`;
    if (timeEl) timeEl.textContent = `⏱ ${new Date().toLocaleTimeString()}`;
}

function clearSearch() {
    const input = document.getElementById('search-input-main');
    if (input) {
        input.value = '';
        const clearBtn = document.getElementById('clear-search');
        if (clearBtn) clearBtn.classList.remove('visible');
        performSearch();
        input.focus();
    }
}

async function openSearchItem(id, isFolder) {
    if (isFolder) {
        const folder = searchableItems.find(item => item.id === id && item.isFolder);
        if (folder) {
            openFolder(folder.id, folder.name);
        }
    } else {
        const file = searchableItems.find(item => item.id === id && item.isFile);
        if (file && file.folderId) {
            const folder = searchableItems.find(item => item.isFolder && item.id === file.folderId);
            if (folder) {
                openFolder(folder.id, folder.name);
                showToast(`📁 ${file.name} in ${folder.name}`, false);
            }
        }
    }
}

function showSearchPage() {
    const foldersView = document.getElementById('folders-view');
    const folderDetailView = document.getElementById('folder-detail-view');
    const searchView = document.getElementById('search-view');
    
    if (foldersView) foldersView.classList.add('hidden');
    if (folderDetailView) folderDetailView.classList.add('hidden');
    if (searchView) searchView.classList.remove('hidden');
    
    const navFolders = document.getElementById('nav-folders');
    const navSearch = document.getElementById('nav-search');
    if (navFolders) navFolders.classList.remove('active');
    if (navSearch) navSearch.classList.add('active');
    
    initSearch();
    
    setTimeout(() => {
        const input = document.getElementById('search-input-main');
        if (input) input.focus();
    }, 100);
}

function showAllFolders() {
    const foldersView = document.getElementById('folders-view');
    const folderDetailView = document.getElementById('folder-detail-view');
    const searchView = document.getElementById('search-view');
    
    if (foldersView) foldersView.classList.remove('hidden');
    if (folderDetailView) folderDetailView.classList.add('hidden');
    if (searchView) searchView.classList.add('hidden');
    
    const navFolders = document.getElementById('nav-folders');
    const navSearch = document.getElementById('nav-search');
    if (navFolders) navFolders.classList.add('active');
    if (navSearch) navSearch.classList.remove('active');
    
    loadFolders();
}

function handleSearch(event) {
    const term = event.target.value;
    if (term && term.length > 0) {
        const searchView = document.getElementById('search-view');
        if (searchView && searchView.classList.contains('hidden')) {
            showSearchPage();
        }
        const mainInput = document.getElementById('search-input-main');
        if (mainInput) {
            mainInput.value = term;
            performSearch();
        }
    }
}

// ==================== VOICE RECORDING ====================
async function startRecording() {
    const recordBtn = document.getElementById('record-btn');
    if (isRecording) {
        mediaRecorder.stop();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            uploadRecordedVoice(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        recordBtn.innerHTML = `<i class="fas fa-stop"></i> Stop Recording`;
        recordBtn.style.backgroundColor = '#ef4444';
        showToast('🎤 Recording... Speak now');
    } catch (err) {
        showToast('Microphone access denied', true);
    }
}

async function uploadRecordedVoice(audioBlob) {
    if (!currentFolderId) return;
    const formData = new FormData();
    formData.append('images', audioBlob, `Voice-Note-${Date.now()}.webm`);

    const progress = document.getElementById('upload-progress');
    if (progress) progress.classList.remove('hidden');

    try {
        const res = await fetch(`/api/folders/${currentFolderId}/images`, {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            showToast('✅ Voice note uploaded');
            loadFiles(currentFolderId);
            setTimeout(initSearch, 500);
        } else {
            const error = await res.text();
            showToast('Upload failed: ' + error, true);
        }
    } catch (e) {
        showToast('Upload failed', true);
    } finally {
        if (progress) progress.classList.add('hidden');
        resetRecordButton();
    }
}

function resetRecordButton() {
    const btn = document.getElementById('record-btn');
    if (btn) {
        btn.innerHTML = `<i class="fas fa-microphone"></i> Record Voice`;
        btn.style.backgroundColor = '';
    }
    isRecording = false;
}

// ==================== FOLDERS ====================
async function loadFolders() {
    try {
        const folders = await apiRequest('/api/folders');
        const grid = document.getElementById('folders-grid');
        if (!grid) return;
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
                <div class="meta">${folder.image_count || 0} files • ${new Date(folder.created_at).toLocaleDateString()}</div>
                <div class="delete-folder-btn" onclick="event.stopImmediatePropagation(); deleteFolder('${folder.id}');">
                    <i class="fas fa-trash"></i>
                </div>
            `;
            card.onclick = () => openFolder(folder.id, folder.name);
            grid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        showToast('Failed to load folders', true);
    }
}

function showCreateFolderModal() {
    const modal = document.getElementById('create-folder-modal');
    const input = document.getElementById('folder-name-input');
    if (modal) modal.classList.remove('hidden');
    if (input) input.focus();
}

function closeModal() {
    const modal = document.getElementById('create-folder-modal');
    const input = document.getElementById('folder-name-input');
    if (modal) modal.classList.add('hidden');
    if (input) input.value = '';
}

async function createFolder() {
    const name = document.getElementById('folder-name-input').value.trim();
    if (!name) return showToast('Folder name is required', true);

    try {
        await apiRequest('/api/folders', { 
            method: 'POST', 
            body: JSON.stringify({ name }) 
        });
        closeModal();
        showToast('Folder created successfully');
        loadFolders();
        setTimeout(initSearch, 500);
    } catch (e) {
        showToast(e.message, true);
    }
}

async function deleteFolder(id) {
    if (!confirm('Delete this folder and ALL files?')) return;
    try {
        await apiRequest(`/api/folders/${id}`, { method: 'DELETE' });
        showToast('Folder deleted');
        loadFolders();
        setTimeout(initSearch, 500);
    } catch (e) {
        showToast('Failed to delete folder', true);
    }
}

// ==================== FOLDER VIEW ====================
function openFolder(id, name) {
    currentFolderId = id;
    currentFolderName = name;
    
    const foldersView = document.getElementById('folders-view');
    const folderDetailView = document.getElementById('folder-detail-view');
    const searchView = document.getElementById('search-view');
    const folderNameEl = document.getElementById('current-folder-name');
    
    if (foldersView) foldersView.classList.add('hidden');
    if (folderDetailView) folderDetailView.classList.remove('hidden');
    if (searchView) searchView.classList.add('hidden');
    if (folderNameEl) folderNameEl.textContent = name;
    
    loadFiles(id);
}

function goBackToFolders() {
    currentFolderId = null;
    const foldersView = document.getElementById('folders-view');
    const folderDetailView = document.getElementById('folder-detail-view');
    
    if (folderDetailView) folderDetailView.classList.add('hidden');
    if (foldersView) foldersView.classList.remove('hidden');
    
    loadFolders();
}

// ==================== LOAD FILES ====================
async function loadFiles(folderId) {
    try {
        const files = await apiRequest(`/api/folders/${folderId}/images`);
        const grid = document.getElementById('files-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (files.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 80px 20px; color: #64748b;">
                    <i class="fas fa-folder-open" style="font-size: 72px; margin-bottom: 20px; opacity: 0.3;"></i>
                    <h3>No files yet</h3>
                    <p>Upload images, videos or record voice notes</p>
                </div>`;
            return;
        }

        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            const filePath = file.url || file.file_path;

            if (file.mime_type?.startsWith('video/')) {
                card.innerHTML = `
                    <video controls style="width:100%;height:100%;object-fit:cover;">
                        <source src="${filePath}" type="${file.mime_type}">
                    </video>
                    <div class="file-info">
                        <span class="filename" data-id="${file.id}">${escapeHtml(file.filename)}</span>
                    </div>
                    <div class="delete-btn" onclick="event.stopImmediatePropagation(); deleteFile('${file.id}')">
                        <i class="fas fa-times"></i>
                    </div>
                `;
            } else if (file.mime_type?.startsWith('audio/')) {
                card.innerHTML = `
                    <div class="audio-card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:#f8fafc;height:100%;">
                        <i class="fas fa-microphone audio-icon" style="font-size:48px;color:#6366f1;margin-bottom:12px;"></i>
                        <div class="audio-info" style="width:100%;">
                            <span class="filename" data-id="${file.id}">${escapeHtml(file.filename)}</span>
                            <audio controls src="${filePath}" style="width:100%;margin-top:8px;"></audio>
                        </div>
                    </div>
                    <div class="delete-btn" onclick="event.stopImmediatePropagation(); deleteFile('${file.id}')">
                        <i class="fas fa-times"></i>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <img src="${filePath}" alt="${escapeHtml(file.filename)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
                    <div class="file-info">
                        <span class="filename" data-id="${file.id}">${escapeHtml(file.filename)}</span>
                    </div>
                    <div class="delete-btn" onclick="event.stopImmediatePropagation(); deleteFile('${file.id}')">
                        <i class="fas fa-times"></i>
                    </div>
                `;
            }

            const nameSpan = card.querySelector('.filename');
            if (nameSpan) {
                nameSpan.addEventListener('click', (e) => {
                    e.stopImmediatePropagation();
                    makeFilenameEditable(nameSpan, file.id);
                });
            }

            grid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        showToast('Failed to load files', true);
    }
}

function makeFilenameEditable(span, fileId) {
    const oldName = span.textContent;
    const input = document.createElement('input');
    input.value = oldName;
    input.style.width = "100%";
    input.style.fontSize = "13px";
    input.style.padding = "4px";
    input.className = "filename-input";

    span.replaceWith(input);
    input.focus();
    input.select();

    const save = async () => {
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            await renameFile(fileId, newName);
        }
        input.replaceWith(span);
    };

    input.onblur = save;
    input.onkeydown = (e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") input.replaceWith(span);
    };
}

async function renameFile(id, newName) {
    try {
        const res = await fetch(`/api/files/${id}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
        });

        if (res.ok) {
            showToast('✅ Name updated successfully');
            loadFiles(currentFolderId);
            setTimeout(initSearch, 500);
        } else {
            const error = await res.text();
            showToast('Rename failed: ' + error, true);
        }
    } catch (e) {
        showToast('Failed to rename file', true);
    }
}

async function deleteFile(id) {
    if (!confirm('Delete this file permanently?')) return;
    try {
        await apiRequest(`/api/images/${id}`, { method: 'DELETE' });
        showToast('File deleted');
        loadFiles(currentFolderId);
        setTimeout(initSearch, 500);
    } catch (e) {
        showToast('Failed to delete file', true);
    }
}

function triggerUpload() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.click();
}

// File input handler
document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files.length || !currentFolderId) return;

            const formData = new FormData();
            for (let file of files) formData.append('images', file);

            const progress = document.getElementById('upload-progress');
            if (progress) progress.classList.remove('hidden');

            try {
                const res = await fetch(`/api/folders/${currentFolderId}/images`, {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    const result = await res.json();
                    showToast(`✅ Successfully uploaded ${result.uploaded || files.length} file(s)`);
                    loadFiles(currentFolderId);
                    setTimeout(initSearch, 500);
                } else {
                    const error = await res.text();
                    showToast('Upload failed: ' + error, true);
                }
            } catch (err) {
                showToast('Upload failed', true);
            } finally {
                if (progress) progress.classList.add('hidden');
                e.target.value = '';
            }
        });
    }
});

function downloadCurrentFolder() {
    if (!currentFolderId) return;
    window.location.href = `/api/folders/${currentFolderId}/download`;
}

async function deleteCurrentFolder() {
    if (!currentFolderId || !confirm('Delete this folder and all files?')) return;
    try {
        await apiRequest(`/api/folders/${currentFolderId}`, { method: 'DELETE' });
        showToast('Folder deleted');
        goBackToFolders();
        setTimeout(initSearch, 500);
    } catch (e) {
        showToast('Delete failed', true);
    }
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchView = document.getElementById('search-view');
        if (searchView && searchView.classList.contains('hidden')) {
            showSearchPage();
        } else {
            const input = document.getElementById('search-input-main');
            if (input) input.focus();
        }
    }
    if (e.key === 'Escape') {
        const searchView = document.getElementById('search-view');
        if (searchView && !searchView.classList.contains('hidden')) {
            const input = document.getElementById('search-input-main');
            if (input && input.value) {
                clearSearch();
            } else {
                showAllFolders();
            }
        }
    }
});

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
    loadFolders();
    setTimeout(initSearch, 500);
});

// For backward compatibility with window.onload
window.onload = function() {
    loadFolders();
    setTimeout(initSearch, 500);
};