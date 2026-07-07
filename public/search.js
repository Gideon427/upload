// search.js - Search functionality for the app

// Sample data - Replace with your actual data from the app
let searchableItems = [];
let currentFilter = 'all';
let searchTerm = '';

// Initialize search with data from your app
function initSearch(folders, files) {
    // Combine folders and files into one searchable array
    const folderItems = (folders || []).map(f => ({
        ...f,
        displayType: 'folder',
        icon: 'fa-folder',
        badge: 'Folder',
        badgeClass: 'badge-folder',
        searchableText: f.name
    }));

    const fileItems = (files || []).map(f => ({
        ...f,
        displayType: f.type || 'other',
        icon: getIconForType(f.type),
        badge: (f.type || 'other').charAt(0).toUpperCase() + (f.type || 'other').slice(1),
        badgeClass: getBadgeClass(f.type),
        searchableText: f.name + ' ' + (f.folder || '')
    }));

    searchableItems = [...folderItems, ...fileItems];
    updateCounts();
    
    // Perform initial search
    performSearch();
}

function getIconForType(type) {
    const icons = {
        image: 'fa-image',
        audio: 'fa-music',
        video: 'fa-video',
        folder: 'fa-folder',
        other: 'fa-file'
    };
    return icons[type] || 'fa-file';
}

function getBadgeClass(type) {
    const classes = {
        folder: 'badge-folder',
        image: 'badge-image',
        audio: 'badge-audio',
        video: 'badge-video',
        other: 'badge-other'
    };
    return classes[type] || 'badge-other';
}

function performSearch() {
    const input = document.getElementById('search-input-main');
    if (!input) return;
    
    searchTerm = input.value.trim();
    
    // Show/hide clear button
    const clearBtn = document.getElementById('clear-search');
    if (searchTerm.length > 0) {
        clearBtn.classList.add('visible');
    } else {
        clearBtn.classList.remove('visible');
    }

    const results = filterItems();
    renderResults(results);
    updateStats(results.length);
}

function filterItems() {
    let filtered = searchableItems;

    // Apply search filter
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(item => 
            item.searchableText.toLowerCase().includes(term)
        );
    }

    // Apply type filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(item => {
            if (currentFilter === 'folders') return item.displayType === 'folder';
            return item.displayType === currentFilter;
        });
    }

    return filtered;
}

function renderResults(results) {
    const container = document.getElementById('search-results');
    if (!container) return;
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No results found</h3>
                <p>Try adjusting your search terms or filters</p>
                <div class="search-tip">
                    <i class="fas fa-lightbulb"></i> Tip: Try searching by file type (e.g., "image", "audio")
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = results.map(item => `
        <div class="result-item" onclick="openSearchItem('${item.id}')">
            <div class="result-icon">
                <i class="fas ${item.icon}" style="color: ${getIconColor(item.displayType)}"></i>
            </div>
            <div class="result-info">
                <div class="name">${highlightMatch(item.name)}</div>
                <div class="meta">
                    <span><i class="fas fa-tag"></i> ${item.folder || 'Root'}</span>
                    ${item.size ? `<span><i class="fas fa-weight-hanging"></i> ${item.size}</span>` : ''}
                    <span><i class="fas fa-calendar"></i> ${item.date || 'N/A'}</span>
                    ${item.itemCount ? `<span><i class="fas fa-cubes"></i> ${item.itemCount} items</span>` : ''}
                </div>
            </div>
            <span class="result-badge ${item.badgeClass}">${item.badge}</span>
            <div class="result-actions">
                <button class="btn-open" onclick="event.stopPropagation(); openSearchItem('${item.id}')">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function highlightMatch(text) {
    if (!searchTerm) return text;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function getIconColor(type) {
    const colors = {
        folder: '#4f46e5',
        image: '#059669',
        audio: '#db2777',
        video: '#d97706',
        other: '#64748b'
    };
    return colors[type] || '#64748b';
}

function setFilter(filter) {
    currentFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    performSearch();
}

function updateCounts() {
    const counts = {
        all: searchableItems.length,
        folders: searchableItems.filter(i => i.displayType === 'folder').length,
        images: searchableItems.filter(i => i.displayType === 'image').length,
        audio: searchableItems.filter(i => i.displayType === 'audio').length,
        video: searchableItems.filter(i => i.displayType === 'video').length,
    };

    Object.keys(counts).forEach(key => {
        const el = document.getElementById(`count-${key}`);
        if (el) el.textContent = counts[key];
    });
}

function updateStats(count) {
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

function openSearchItem(id) {
    const item = searchableItems.find(i => i.id == id);
    if (item) {
        showToast(`Opening: ${item.name}`, 'success');
        console.log('Open item:', item);
        
        // If it's a folder, navigate to it
        if (item.displayType === 'folder') {
            // Call your existing function to show folder contents
            if (typeof showFolderContents === 'function') {
                showFolderContents(item.id);
            }
        } else {
            // If it's a file, navigate to its folder
            if (item.folder && typeof showFolderContents === 'function') {
                // Find the folder by name
                const folder = searchableItems.find(f => f.displayType === 'folder' && f.name === item.folder);
                if (folder) {
                    showFolderContents(folder.id);
                }
            }
        }
    }
}

// Navigation functions
function showSearchPage() {
    // Hide other views
    document.getElementById('folders-view').classList.add('hidden');
    document.getElementById('folder-detail-view').classList.add('hidden');
    document.getElementById('search-view').classList.remove('hidden');
    
    // Update nav
    document.getElementById('nav-folders').classList.remove('active');
    document.getElementById('nav-search').classList.add('active');
    
    // Focus search input
    setTimeout(() => {
        const input = document.getElementById('search-input-main');
        if (input) input.focus();
    }, 100);
}

function showAllFolders() {
    // Show folders view
    document.getElementById('folders-view').classList.remove('hidden');
    document.getElementById('folder-detail-view').classList.add('hidden');
    document.getElementById('search-view').classList.add('hidden');
    
    // Update nav
    document.getElementById('nav-folders').classList.add('active');
    document.getElementById('nav-search').classList.remove('active');
    
    // Refresh folders
    if (typeof loadFolders === 'function') {
        loadFolders();
    }
}

// Toast notification (use your existing one or this fallback)
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) {
        alert(message);
        return;
    }
    toast.textContent = message;
    toast.className = `toast ${type} visible`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

// Handle global search from top bar
function handleSearch(event) {
    const term = event.target.value;
    if (term) {
        // If search view is not visible, navigate to it
        if (document.getElementById('search-view').classList.contains('hidden')) {
            showSearchPage();
        }
        // Set the main search input value
        const mainInput = document.getElementById('search-input-main');
        if (mainInput) {
            mainInput.value = term;
            performSearch();
        }
    }
}

// Initialize search when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // This will be called from your main script with actual data
    // For now, we'll use sample data if available
    if (typeof getFoldersData === 'function' && typeof getFilesData === 'function') {
        initSearch(getFoldersData(), getFilesData());
    } else {
        // Use sample data for testing
        const sampleFolders = [
            { id: 1, name: 'Family Photos', itemCount: 12, date: '2024-01-15' },
            { id: 2, name: 'Work Documents', itemCount: 8, date: '2024-02-20' },
            { id: 3, name: 'Music Collection', itemCount: 25, date: '2024-03-10' },
        ];
        const sampleFiles = [
            { id: 101, name: 'sunset_beach.jpg', type: 'image', size: '2.4 MB', date: '2024-01-20', folder: 'Family Photos' },
            { id: 102, name: 'family_dinner.jpg', type: 'image', size: '3.1 MB', date: '2024-01-22', folder: 'Family Photos' },
            { id: 103, name: 'summer_playlist.mp3', type: 'audio', size: '8.4 MB', date: '2024-03-15', folder: 'Music Collection' },
        ];
        initSearch(sampleFolders, sampleFiles);
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+K or Cmd+K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (document.getElementById('search-view').classList.contains('hidden')) {
            showSearchPage();
        } else {
            document.getElementById('search-input-main').focus();
        }
    }
    // Escape to clear search
    if (e.key === 'Escape') {
        const searchView = document.getElementById('search-view');
        if (!searchView.classList.contains('hidden')) {
            clearSearch();
            document.getElementById('search-input-main').blur();
        }
    }
});
//dgttvsdvbddjdjfkkf