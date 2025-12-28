const API_URL = "/api";

document.addEventListener('DOMContentLoaded', () => {
    loadTargets();
    updateStats();

    // Setup Drag & Drop
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--text-muted)';
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });

    // Auto-refresh stats every 10s
    setInterval(updateStats, 10000);
});

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    document.getElementById(sectionId).classList.add('active');

    // Highlight nav item (simple loop matching or specific logic)
    // For now simple reload of data
    if (sectionId === 'targets') loadTargets();
}

async function loadTargets() {
    try {
        const response = await fetch(`${API_URL}/targets`);
        const targets = await response.json();
        const grid = document.getElementById('targets-grid');
        grid.innerHTML = '';

        document.getElementById('stat-targets').innerText = targets.length;

        targets.forEach(target => {
            const card = document.createElement('div');
            card.className = 'target-card';
            card.innerHTML = `
                <img src="placeholder_user.png" onerror="this.src='https://ui-avatars.com/api/?name=${target}&background=0D8ABC&color=fff'" alt="${target}">
                <div class="target-info">
                    <span class="target-name">${target}</span>
                    <button class="scan-btn" onclick="startScan('${target}')">INITIATE SCAN</button>
                    <button style="margin-top:5px; background:none; border:none; color:white; width:100%" onclick="viewResults('${target}')">View Results</button>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error("Failed to load targets", e);
    }
}

async function startScan(filename) {
    try {
        const response = await fetch(`${API_URL}/scan/${filename}`, { method: 'POST' });
        const res = await response.json();
        alert(res.message);
        addActivity(`Scan started: ${filename}`);
    } catch (e) {
        alert("Error starting scan");
    }
}

async function viewResults(filename) {
    try {
        const response = await fetch(`${API_URL}/results/${filename}`);
        const data = await response.json();
        // For simplicity, just alert count or log console for now, 
        // real implementation would show a gallery modal
        console.log(data);
        alert(`Found ${data.results.length} matches for ${filename}. Check console for details.`);
    } catch (e) {
        alert("Error loading results");
    }
}

function handleFileSelect() {
    const input = document.getElementById('file-input');
    if (input.files.length > 0) {
        document.querySelector('.drop-zone p').innerText = `Selected: ${input.files[0].name}`;
    }
}

async function uploadFile() {
    const input = document.getElementById('file-input');
    if (!input.files.length) return alert("Please select a file first");

    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            closeModal();
            loadTargets();
            addActivity(`New target uploaded: ${input.files[0].name}`);
            alert("Upload successful");
        } else {
            alert("Upload failed");
        }
    } catch (e) {
        alert("Error uploading file");
    }
}

function triggerUploadModal() {
    document.getElementById('upload-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('upload-modal').style.display = 'none';
}

function addActivity(msg) {
    const list = document.getElementById('activity-list');
    const item = document.createElement('li');
    item.innerText = `${new Date().toLocaleTimeString()} - ${msg}`;

    // Clear empty state
    if (list.querySelector('.empty-state')) list.innerHTML = '';

    list.prepend(item);
}

function updateStats() {
    // Placeholder - in real app fetch from stats endpoint
    // For now we rely on loadTargets for target count
}
