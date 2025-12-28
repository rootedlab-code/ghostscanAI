const API_URL = "/api";

document.addEventListener('DOMContentLoaded', () => {
    loadTargets();
    updateStats();
    connectWebSocket();

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
    if (sectionId === 'results') populateResultsDropdown();
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

async function populateResultsDropdown() {
    const select = document.getElementById('results-target-select');
    try {
        const response = await fetch(`${API_URL}/targets`);
        const targets = await response.json();
        select.innerHTML = '<option value="">-- Select Target --</option>';
        targets.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Failed to populate results dropdown", e);
    }
}

async function loadResultsForTarget() {
    const select = document.getElementById('results-target-select');
    const filename = select.value;
    const grid = document.getElementById('results-grid');

    if (!filename) {
        grid.innerHTML = '<div class="empty-state">Select a target to view results.</div>';
        return;
    }

    grid.innerHTML = '<div class="empty-state">Loading results...</div>';

    try {
        const response = await fetch(`${API_URL}/results/${filename}`);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            grid.innerHTML = '<div class="empty-state">No matches found for this target.</div>';
            return;
        }

        grid.innerHTML = '';
        const targetName = filename.replace(/\.[^/.]+$/, ""); // Remove extension
        data.results.forEach(match => {
            const card = document.createElement('div');
            card.className = 'result-card';
            const imageUrl = `/matches/${targetName}/${match.image_filename}`;
            const confidence = match.confidence_distance ? (100 - match.confidence_distance * 100).toFixed(1) : 'N/A';
            card.innerHTML = `
                <img src="${imageUrl}" alt="Match" onerror="this.src='https://via.placeholder.com/280x200?text=Image+Not+Found'">
                <div class="result-info">
                    <span class="confidence">Match: ${confidence}%</span>
                    <span class="source">${match.source_url || match.source_page || 'Unknown source'}</span>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        grid.innerHTML = '<div class="empty-state">Error loading results.</div>';
        console.error(e);
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

// WebSocket Logs
let ws;
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/logs`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        addLogEntry("System", "Connected to live log stream.", "system");
        document.querySelector('.status-item .value.online').classList.add('pulse');
    };

    ws.onmessage = (event) => {
        const msg = event.data;
        let type = 'info';
        if (msg.includes('ERROR') || msg.includes('CRITICAL')) type = 'error';
        else if (msg.includes('WARNING')) type = 'warning';
        else if (msg.includes('DEBUG')) type = 'debug';

        addLogEntry("Log", msg, type);
    };

    ws.onclose = () => {
        addLogEntry("System", "Connection lost. Reconnecting in 3s...", "error");
        document.querySelector('.status-item .value.online').classList.remove('pulse');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error("WS Error", err);
        ws.close();
    };
}

function addLogEntry(source, message, type) {
    const terminal = document.getElementById('log-terminal');
    if (!terminal) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    if (!message.match(/^\d{4}-\d{2}-\d{2}/)) {
        message = `${new Date().toLocaleTimeString()} - ${message}`;
    }
    entry.innerText = message;

    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

function clearLogs() {
    const terminal = document.getElementById('log-terminal');
    if (terminal) terminal.innerHTML = '<div class="log-entry system">Logs cleared.</div>';
}
