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
                <img src="https://ui-avatars.com/api/?name=${target}&background=0D8ABC&color=fff" alt="${target}">
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


/* --- PREMIUM MODULES LOGIC --- */

// Security Enforcer
document.addEventListener('DOMContentLoaded', () => {
    const torToggle = document.getElementById('neutron-tor-mode');
    if (torToggle) {
        torToggle.addEventListener('change', (e) => {
            if (!e.target.checked) {
                const proceed = confirm("⚠️ OPSEC WARNING ⚠️\n\nDisabling Ghost Mode will expose your real IP address to target servers.\nAre you sure you want to compromise your anonymity?");
                if (!proceed) {
                    e.target.checked = true; // Re-enable if they cancel
                }
            }
        });
    }
});

// SAURON
async function addCamera() {
    const source = prompt("Enter RTSP URL or Camera ID (0 for webcam):", "0");
    if (source === null) return;

    try {
        const res = await fetch(`${API_URL}/modules/sauron/stream/add?source=${encodeURIComponent(source)}`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            alert(`Camera added: ID ${data.id}`);
            // Logic to add player element to grid would go here
            const grid = document.getElementById('sauron-grid');
            if (grid.querySelector('.empty-state')) grid.innerHTML = '';

            const camDiv = document.createElement('div');
            camDiv.className = 'target-card'; // Reuse card style
            camDiv.innerHTML = `
                <div style="height:200px; background:#000; display:flex; align-items:center; justify-content:center; color:#fff;">
                    <i class="fa-solid fa-video"></i> CAM ${data.id} (Active)
                </div>
                <div class="target-info">
                    <span class="target-name">Source: ${source}</span>
                </div>
            `;
            grid.appendChild(camDiv);

        } else {
            alert("Failed to add camera: " + data.detail);
        }
    } catch (e) {
        alert("Error connecting to Sauron module");
    }
}

// NEUTRON
async function startNeutronScan() {
    const input = document.getElementById('neutron-input');
    const username = input.value.trim();

    // Options
    const fastMode = document.getElementById('neutron-fast-mode').checked;
    const useTor = document.getElementById('neutron-tor-mode').checked;
    const nsfw = document.getElementById('neutron-nsfw').checked;
    const timeout = document.getElementById('neutron-timeout').value;

    // Automation Toggles
    const feedElyon = document.getElementById('neutron-feed-elyon').checked;
    const ghostScan = document.getElementById('neutron-ghost-scan').checked;

    if (!username) return alert("Enter a username!");

    const listContainer = document.getElementById('neutron-intelligence-list');
    listContainer.innerHTML = '<div class="log-entry system"><i class="fa-solid fa-spinner fa-spin"></i> SCANNING TARGET ACROSS NEURAL RELAYS...</div>';

    try {
        const query = `username=${encodeURIComponent(username)}&fast_mode=${fastMode}&use_tor=${useTor}&nsfw=${nsfw}&timeout=${timeout}&export_csv=true`;
        const res = await fetch(`${API_URL}/modules/neutron/scan?${query}`, { method: 'POST' });

        if (res.ok) {
            // Poll for results
            const pollInterval = setInterval(async () => {
                try {
                    const r = await fetch(`${API_URL}/modules/neutron/results/${encodeURIComponent(username)}`);
                    const data = await r.json();

                    if (data.status === 'completed') {
                        clearInterval(pollInterval);
                        renderIntelligenceList(data.results);

                        // AUTOMATION LOGIC
                        if (feedElyon) {
                            const task = `Analyze the digital footprint of '${username}'. Found ${data.results.length} profiles: ${data.results.map(r => r.site).join(", ")}. Identify potential risks and correlations.`;
                            document.getElementById('elyon-task-input').value = task;
                            startElyonTask(); // Auto-execute

                            // Visual cue
                            document.getElementById('elyon-output').innerHTML += `<div class="log-entry system"><i class="fa-solid fa-bolt"></i> AUTOMATION: Forwarding intelligence to Elyon Core...</div>`;
                        }

                        if (ghostScan) {
                            // Assuming username is the filename (without extension mechanism for now, or just triggers scan logic)
                            // Ideally we check if a file exists, but for now we try to trigger scan for 'username'
                            document.getElementById('elyon-output').innerHTML += `<div class="log-entry system"><i class="fa-solid fa-id-card-clip"></i> AUTOMATION: Initiating GhostScan Protocol for '${username}'...</div>`;
                            startScan(username + ".jpg"); // Try common extension or just name
                        }
                    }
                } catch (e) { /* ignore poll errors */ }
            }, 3000); // Check every 3s

        }
    } catch (e) {
        listContainer.innerHTML = `<div class="log-entry error">CONNECTION FAILED TO NEUTRON MODULE.</div>`;
    }
}

function renderIntelligenceList(results) {
    const container = document.getElementById('neutron-intelligence-list');
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="empty-state">No intelligence data found. Target may be off-grid.</div>';
        return;
    }

    container.innerHTML = ''; // Clear loading

    // Create a specialized grid for results
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
    grid.style.gap = '1rem';

    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'target-card'; // Reuse style
        card.style.height = 'auto';
        card.style.borderLeft = '3px solid var(--success)';

        // Icon logic
        let icon = 'fa-globe';
        const s = item.site.toLowerCase();
        if (s.includes('instagram')) icon = 'fa-instagram';
        else if (s.includes('facebook')) icon = 'fa-facebook';
        else if (s.includes('twitter')) icon = 'fa-twitter';
        else if (s.includes('github')) icon = 'fa-github';
        else if (s.includes('linkedin')) icon = 'fa-linkedin';
        else if (s.includes('youtube')) icon = 'fa-youtube';
        else if (s.includes('spotify')) icon = 'fa-spotify';
        else if (s.includes('reddit')) icon = 'fa-reddit';

        card.innerHTML = `
            <div style="padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <span style="font-weight:bold; color:var(--text-main);"><i class="fa-brands ${icon}"></i> ${item.site}</span>
                    <span class="status-badge" style="background:rgba(0,255,157,0.1); color:var(--success); font-size:0.7rem; padding:2px 6px;">FOUND</span>
                </div>
                <a href="${item.url}" target="_blank" style="color:var(--text-muted); font-size:0.85rem; text-decoration:none; word-break:break-all;">
                    ${item.url} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;"></i>
                </a>
            </div>
        `;
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

// ELYON
async function startElyonTask() {
    const input = document.getElementById('elyon-task-input');
    const topic = input.value.trim();
    if (!topic) return alert("Define a task for Elyon!");

    const terminal = document.getElementById('elyon-output');
    const visualizer = document.getElementById('elyon-visualizer');
    const statusBadge = visualizer.querySelector('.status-badge');

    terminal.innerHTML += `<div class="log-entry system">Assigning task to Elyon: "${topic}"...</div>`;

    // ACTIVATE 3D CORE
    visualizer.classList.add('processing');
    statusBadge.innerText = "NEURAL LINK ACTIVE";

    try {
        const res = await fetch(`${API_URL}/modules/elyon/task?topic=${encodeURIComponent(topic)}`, { method: 'POST' });
        const data = await res.json();

        if (data.status === 'completed') {
            const result = data.result;
            terminal.innerHTML += `
                <div class="log-entry success">
                    <strong>Elyon Analysis Complete:</strong><br>
                    ${result.analysis}<br>
                    <ul>
                        ${result.intelligence.map(i => `<li>${i}</li>`).join('')}
                    </ul>
                    Confidence: ${(result.confidence * 100).toFixed(1)}%
                </div>
            `;
            terminal.scrollTop = terminal.scrollHeight;
        }
    } catch (e) {
        terminal.innerHTML += `<div class="log-entry error">Elyon Connection Failed: ${e.message}</div>`;
    } finally {
        // DEACTIVATE 3D CORE
        visualizer.classList.remove('processing');
        statusBadge.innerText = "ONLINE";
    }
}

// --- SECURITY SYSTEM ---

async function checkSystemStatus() {
    try {
        const res = await fetch(`${API_URL}/system/status`); // Use correct API_URL var
        const data = await res.json();

        // Modules: { sauron: "locked", ... }
        if (data.modules) {
            for (const [module, status] of Object.entries(data.modules)) {
                // Determine ID based on existing HTML: "nav-sauron", "nav-neutron", "nav-elyon"
                const navId = `nav-${module}`;
                const navLink = document.getElementById(navId);

                if (navLink) {
                    if (status === "locked") {
                        navLink.classList.add("locked");
                        // Override click
                        navLink.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openSecurityModal(module);
                        };
                    } else if (status === "active") {
                        navLink.classList.remove("locked");
                        navLink.onclick = () => showSection(module);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Security Status Check Failed", e);
    }
}

function openSecurityModal(moduleName) {
    const modal = document.getElementById('security-modal');
    modal.classList.add('active');

    const input = document.getElementById('decryption-key');
    input.value = "";
    input.focus();

    document.getElementById('security-msg').textContent = "AWAITING INPUT...";
    document.getElementById('security-msg').style.color = "#666";
}

function closeSecurityModal() {
    document.getElementById('security-modal').classList.remove('active');
}

async function unlockSystem() {
    const key = document.getElementById('decryption-key').value;
    const msgDiv = document.getElementById('security-msg');

    if (!key) return;

    msgDiv.textContent = "VERIFYING SIGNATURE...";
    msgDiv.style.color = "var(--primary)";

    try {
        const res = await fetch(`${API_URL}/system/unlock`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: key })
        });

        const data = await res.json();

        if (data.status === "success") {
            msgDiv.textContent = "ACCESS GRANTED. DECRYPTING...";
            msgDiv.style.color = "var(--success)";

            // Add visual delay for effect
            setTimeout(() => {
                msgDiv.textContent = "SYSTEM RELOADING...";
                setTimeout(() => {
                    location.reload();
                }, 1000);
            }, 1000);

        } else {
            msgDiv.textContent = "ACCESS DENIED. INVALID KEY.";
            msgDiv.style.color = "var(--danger)";
        }
    } catch (e) {
        msgDiv.textContent = "CONNECTION ERROR";
        msgDiv.style.color = "var(--danger)";
    }
}

// Initial Security Check
document.addEventListener('DOMContentLoaded', () => {
    checkSystemStatus();
});
