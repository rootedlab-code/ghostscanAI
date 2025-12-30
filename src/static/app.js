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

        // Check for Neutron matches in ANY log message
        if (msg.includes('[+]')) {
            handleNeutronStream(msg);
        }

        // Standard Logging
        let type = 'info';
        if (msg.includes('ERROR') || msg.includes('CRITICAL')) type = 'error';
        else if (msg.includes('WARNING')) type = 'warning';
        else if (msg.includes('DEBUG')) type = 'debug';
        else if (msg.includes('[+]')) type = 'success'; // Highlight matches

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

    // RESET CHARTS
    resetNeutronCharts();

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

    // Update Charts
    updateNeutronCharts(results);

    // Show Deep Dive Button if results exist
    const ddBtn = document.getElementById('deep-dive-btn');
    if (ddBtn && results.length > 0) {
        ddBtn.style.display = 'block';
    }
}

// --- NEUTRON ANALYTICS LOGIC ---
const SITE_CATEGORIES = {
    'Social': ['Instagram', 'Facebook', 'Twitter', 'TikTok', 'Snapchat', 'Pinterest', 'Tumblr', 'Reddit', 'Myspace', 'Flickr', 'Periscope', 'Badoo', 'Tinder', 'Bumble'],
    'Dev': ['GitHub', 'GitLab', 'BitBucket', 'StackOverflow', 'Replit', 'CodePen', 'Dev.to', 'Npm', 'Docker Hub', 'PyPI'],
    'Business': ['LinkedIn', 'Xing', 'AngelList', 'Crunchbase', 'Slack', 'Trello', 'Upwork', 'Fiverr', 'Freelancer'],
    'Media': ['Youtube', 'Vimeo', 'Twitch', 'SoundCloud', 'Spotify', 'Bandcamp', 'Mixcloud', 'Dailymotion', 'Medium', 'WordPress', 'Blogger'],
    'Tech': ['HackerNews', 'ProductHunt', 'Steam', 'Discord', 'Telegram', 'Signal', 'Keybase'],
    'Creative': ['Behance', 'Dribbble', 'Fiverr', '99designs', 'Patreon', 'Ko-fi', 'BuyMeACoffee'],
    'Adult': ['OnlyFans', 'Pornhub', 'XVideos', 'Chaturbate', 'Fansly'],
    'Other': []
};

let neutronRadarChart = null;
let neutronExposureChart = null;
let categoryScores = { 'Social': 0, 'Dev': 0, 'Business': 0, 'Media': 0, 'Tech': 0, 'Creative': 0, 'Adult': 0, 'Other': 0 };
let totalMatches = 0;

function initNeutronCharts() {
    const ctxRadar = document.getElementById('neutron-radar-chart').getContext('2d');
    const ctxExposure = document.getElementById('neutron-exposure-chart').getContext('2d');

    Chart.defaults.color = '#888';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';
    Chart.defaults.font.family = "'Rajdhani', sans-serif";

    // 1. Digital Footprint Taxonomy (Radar)
    neutronRadarChart = new Chart(ctxRadar, {
        type: 'radar',
        data: {
            labels: Object.keys(SITE_CATEGORIES).filter(k => k !== 'Other'),
            datasets: [{
                label: 'Footprint Intensity',
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: 'rgba(147, 51, 234, 0.5)', // Primary Purple
                borderColor: '#9333ea',
                pointBackgroundColor: '#fff',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#9333ea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    pointLabels: { color: '#00ff9d', font: { size: 10 } },
                    ticks: { display: false, backdropColor: 'transparent' },
                    suggestedMin: 0,
                    suggestedMax: 5
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    // 2. Exposure Score (Gauge / Doughnut)
    neutronExposureChart = new Chart(ctxExposure, {
        type: 'doughnut',
        data: {
            labels: ['Exposure', 'Secure'],
            datasets: [{
                data: [0, 100],
                backgroundColor: [
                    '#ef4444', // Red (Danger/Exposure)
                    'rgba(255, 255, 255, 0.05)' // Empty
                ],
                borderWidth: 0,
                cutout: '70%',
                circumference: 180,
                rotation: 270
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

function updateNeutronCharts(results) {
    if (!neutronRadarChart || !neutronExposureChart) return;

    // If results are provided, process them to update categoryScores
    if (results) {
        // Reset scores for a fresh calculation
        categoryScores = { 'Social': 0, 'Dev': 0, 'Business': 0, 'Media': 0, 'Tech': 0, 'Creative': 0, 'Adult': 0, 'Other': 0 };
        totalMatches = 0;

        results.forEach(item => {
            let site = item.site;
            let category = 'Other';
            for (const [cat, sites] of Object.entries(SITE_CATEGORIES)) {
                if (sites.some(s => s.toLowerCase() === site.toLowerCase())) {
                    category = cat;
                    break;
                }
            }
            categoryScores[category] = (categoryScores[category] || 0) + 1;
            totalMatches++;
        });
    }

    // Update Radar
    const labels = neutronRadarChart.data.labels;
    const newData = labels.map(cat => categoryScores[cat]);
    neutronRadarChart.data.datasets[0].data = newData;

    // Auto-scale radar axis if values get high
    const maxVal = Math.max(...newData);
    neutronRadarChart.options.scales.r.suggestedMax = maxVal > 5 ? maxVal + 2 : 5;

    neutronRadarChart.update();

    // Update Exposure Gauge
    // Calculate score: Simple heuristic based on total matches + sensitivity
    // Social accounts = 1pt, Dev = 2pt, Business = 3pt, Adult = 5pt
    let exposureScore = 0;
    exposureScore += (categoryScores['Social'] || 0) * 2;
    exposureScore += (categoryScores['Dev'] || 0) * 5;     // Dev accounts reveal emails often
    exposureScore += (categoryScores['Business'] || 0) * 10; // LinkedIn is high value
    exposureScore += (categoryScores['Adult'] || 0) * 15;    // Blackmail risk
    exposureScore += (categoryScores['Tech'] || 0) * 3;

    // Normalize to 0-100 (soft cap at 100, but logic can go higher so we clamp)
    let percentage = Math.min(exposureScore, 100);

    // Color shift based on score
    let color = '#10b981'; // Green
    if (percentage > 30) color = '#f59e0b'; // Amber
    if (percentage > 70) color = '#ef4444'; // Red

    neutronExposureChart.data.datasets[0].backgroundColor[0] = color;
    neutronExposureChart.data.datasets[0].data = [percentage, 100 - percentage];
    neutronExposureChart.update();

    // Add text overlay for Score (using Custom Plugin or simple DOM overlay? 
    // DOM overlay is easier, see if we can just update a text element if one existed, 
    // but for now the visual gauge is good.)
}

function handleNeutronStream(content) {
    if (!content) return;

    // Pattern look for: "[+] Site: SiteName" anywhere in string
    // This regex finds "[+] Site: " then captures the Word immediately following (the site name)
    // It captures up to a colon or space
    const match = content.match(/\[\+\]\s*Site:\s*([^\s:]+)/i);

    if (match && match[1]) {
        let site = match[1].trim();

        // 1. Determine Category
        let category = 'Other';
        for (const [cat, sites] of Object.entries(SITE_CATEGORIES)) {
            // Case insensitive check
            if (sites.some(s => s.toLowerCase() === site.toLowerCase())) {
                category = cat;
                break;
            }
        }

        // Update Internal State
        categoryScores[category] = (categoryScores[category] || 0) + 1;
        if (category === 'Other') {
            // Fallback for known major sites not in list?
            // Maybe add dynamic checking if needed, but for now 'Other' is fine
            categoryScores['Other']++;
        }
        totalMatches++;

        // Update Charts
        updateNeutronCharts();
    }
}

// HANDLE DEEP DIVE
async function startDeepDive() {
    const input = document.getElementById('neutron-input');
    const username = input.value.trim();
    if (!username) return;

    const btn = document.getElementById('deep-dive-btn');
    const container = document.getElementById('deep-dive-results');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SCRAPING TARGETS (TOR)...';
    container.innerHTML = '<div class="log-entry system">Deep Dive initiated. This may take a moment per site...</div>';

    try {
        const res = await fetch(`${API_URL}/modules/neutron/deep-dive?username=${encodeURIComponent(username)}`, { method: 'POST' });
        if (res.ok) {
            // Poll or wait for websocket event
            // For simplicity, we just poll intel endpoint
            let checks = 0;
            const poll = setInterval(async () => {
                checks++;
                const r = await fetch(`${API_URL}/modules/neutron/intel/${encodeURIComponent(username)}`);
                const data = await r.json();

                if (data.status !== 'not_found') {
                    clearInterval(poll);
                    renderDeepDive(data);
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> ANALYSIS COMPLETE';
                    btn.disabled = false;
                }

                if (checks > 100) clearInterval(poll); // 5 min timeout
            }, 3000);
        }
    } catch (e) {
        container.innerHTML += `<div class="log-entry error">Deep Dive Failed: ${e.message}</div>`;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-microscope"></i> RETRY DEEP DIVE';
    }
}

function renderDeepDive(intel) {
    const container = document.getElementById('deep-dive-results');

    // Emails
    let emailsHtml = intel.emails && intel.emails.length ? intel.emails.map(e => `<span class="tag email">${e}</span>`).join('') : '<span class="text-muted">None found</span>';

    // Phones
    let phonesHtml = intel.phones && intel.phones.length ? intel.phones.map(p => `<span class="tag phone">${p}</span>`).join('') : '<span class="text-muted">None found</span>';

    // Wallets
    let walletsHtml = intel.crypto_wallets && intel.crypto_wallets.length ? intel.crypto_wallets.map(w => `<div class="tag crypto">${w}</div>`).join('') : '<span class="text-muted">None found</span>';

    container.innerHTML = `
        <div class="intel-report" style="background:rgba(0,0,0,0.3); padding:1rem; border-left:3px solid #7c3aed;">
            <h4 style="color:#7c3aed; margin-top:0;">DEEP DIVE REPORT</h4>
            <div style="margin-bottom:0.5rem;"><strong>Emails:</strong> ${emailsHtml}</div>
            <div style="margin-bottom:0.5rem;"><strong>Phones:</strong> ${phonesHtml}</div>
            <div style="margin-bottom:0.5rem;"><strong>Crypto:</strong> ${walletsHtml}</div>
            <hr style="border-color:#333">
            <div style="max-height:200px; overflow-y:auto;">
                <small><strong>Metadata extracted from ${intel.analyzed_count} sites:</strong></small>
                ${intel.details.map(d => `
                    <div style="font-size:0.8rem; margin-top:5px; color:#aaa;">
                        <span style="color:#fff">${d.site}</span>: ${d.bio || d.title || 'No info'}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Reset Logic (updated)
function resetNeutronCharts() {
    categoryScores = { 'Social': 0, 'Dev': 0, 'Business': 0, 'Media': 0, 'Tech': 0, 'Creative': 0, 'Adult': 0, 'Other': 0 };
    totalMatches = 0;
    document.getElementById('deep-dive-results').innerHTML = '';
    const ddBtn = document.getElementById('deep-dive-btn');
    if (ddBtn) ddBtn.style.display = 'none';

    if (neutronRadarChart) {
        neutronRadarChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
        neutronRadarChart.update();
    }
    if (neutronExposureChart) {
        neutronExposureChart.data.datasets[0].data = [0, 100];
        neutronExposureChart.update();
    }
}

// Initialize charts when Neutron section is shown or on load
document.addEventListener('DOMContentLoaded', () => {
    // We invoke this when section becomes visible or just once safely
    // Wait for DOM
    setTimeout(initNeutronCharts, 1000);
});

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
            msgDiv.textContent = data.message || "ACCESS DENIED. INVALID KEY.";
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
