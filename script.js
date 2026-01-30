// DOM Elements
const canvas = document.getElementById('compositorCanvas');
const ctx = canvas.getContext('2d');
const sourceVideo = document.getElementById('sourceVideo');
const facecamVideo = document.getElementById('facecamVideo');
const settingsBtn = document.getElementById('settingsBtn'); // Updated ID
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const savePathInput = document.getElementById('savePathInput');
const changePathBtn = document.getElementById('changePathBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const qualitySelect = document.getElementById('qualitySelect');

// New UI Elements
const timerDisplay = document.getElementById('timer');
const timerDisplayBottom = document.getElementById('timerDisplay'); // Bottom bar timer
const placeholderOverlay = document.getElementById('placeholderOverlay');
const micToggle = document.getElementById('micToggle');
const audioToggle = document.getElementById('audioToggle');

// Modals
const sourceModal = document.getElementById('sourceModal');
const closeSourceBtn = document.getElementById('closeSourceBtn');
const sourceGrid = document.getElementById('sourceGrid');

// Review Modal Elements
const reviewModal = document.getElementById('reviewModal');
const closeReviewBtn = document.getElementById('closeReviewBtn');
const recordingPlayer = document.getElementById('recordingPlayer');
const openFolderReviewBtn = document.getElementById('openFolderReviewBtn');

// Action Buttons
const selectSourceBtn = document.getElementById('selectSourceBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const folderBtn = document.getElementById('folderBtn');
const countdownOverlay = document.getElementById('countdownOverlay');

// Notification Drawer Elements
const notificationBellBtn = document.getElementById('notificationBellBtn');
const notificationBadge = document.getElementById('notificationBadge');
const notificationDrawer = document.getElementById('notificationDrawer');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const notificationList = document.getElementById('notificationList');


// Sidebar Nav
const navRecordings = document.getElementById('navRecordings');
const navPreview = document.getElementById('navPreview');
const recordingsList = document.getElementById('recordingsList');

if (navRecordings && navPreview && recordingsList) {
    navRecordings.addEventListener('click', () => {
        navRecordings.classList.add('active');
        navPreview.classList.remove('active');
        recordingsList.classList.remove('hidden');
    });

    navPreview.addEventListener('click', () => {
        navPreview.classList.add('active');
        navRecordings.classList.remove('active');
        recordingsList.classList.add('hidden');
    });
}

// Variables
let mediaRecorder;
let currentRecordingFilename = null; // For streaming
let timerInterval;
let startTime;
let elapsedTime = 0; // Track total elapsed for pause/resume logic
let animationId;
let isRecording = false;
let compositorRunning = false; // Separate flag for compositor loop

// State
const state = {
    facecamActive: false,
    micActive: true,
    facecamPos: { x: 20, y: 20, w: 240, h: 180 }, // Default cam position
    screenStream: null,
    mergedStream: null,
    recordingMode: 'screen', // screen, window, area
    audioContext: null,
    audioDestination: null,
    micGain: null,
    micSourceLink: null
};

// Mode Switching
const modeBtns = document.querySelectorAll('.mode-btn');
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update UI
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update State
        state.recordingMode = btn.dataset.mode;
        console.log("Mode switched to:", state.recordingMode);
    });
});

// --- Init ---
(async () => {
    // Load script dep in html or just assume class is there if concatenated.
    // In this env, separate files. Helper: ensure drawing.js is loaded in index.html

    if (window.electronAPI) {
        console.log("Desktop Mode Ready");
        const config = await window.electronAPI.getConfig();
        if (config.savePath) savePathInput.value = config.savePath;
        if (config.quality) qualitySelect.value = config.quality;
        if (config.format) document.getElementById('formatSelect').value = config.format;
        if (config.fps) document.getElementById('fpsSelect').value = config.fps;

        window.electronAPI.onShortcutTrigger((action) => {
            if (action === 'toggle-recording') {
                if (isRecording) stopRecording();
                else startRecordingHelper();
            }
            if (action === 'toggle-mic') {
                if (micToggle) {
                    micToggle.checked = !micToggle.checked; // Toggle UI
                    // Trigger change event to run logic
                    micToggle.dispatchEvent(new Event('change'));
                }
            }
        });

        window.electronAPI.onTriggerScreenshot(() => captureScreenshot());

        window.electronAPI.onTriggerPause(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
        });

        window.electronAPI.onTriggerResume(() => {
            if (mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume();
        });

        window.electronAPI.onTriggerStop(() => {
            stopRecording();
        });

        window.electronAPI.onTriggerRecord(() => {
            if (!isRecording) startRecordingHelper();
        });

        // Status Update Handler
        window.electronAPI.onStatusUpdate((analysis) => {
            console.log("Renderer received status update:", analysis);
            handleStatusUpdate(analysis);
        });

        // Specific Notification Handler
        window.electronAPI.onNotification((data) => {
            showNotification(data.type, data.message);
        });

        // ✅ AUTO-START PREVIEW ON LOAD
        startPreviewHelper();

        // Notification Drawer Toggle
        if (notificationBellBtn) {
            notificationBellBtn.onclick = () => {
                notificationDrawer.classList.toggle('hidden');
                // Reset badge on open
                notificationBadge.textContent = "0";
                notificationBadge.classList.add('hidden');
            };
        }

        if (closeDrawerBtn) {
            closeDrawerBtn.onclick = () => {
                notificationDrawer.classList.add('hidden');
            };
        }
    }
})();


/**
 * Handles complex status logic (Blocking UI, reminders, etc.)
 */
function handleStatusUpdate(analysis) {
    if (!Array.isArray(analysis)) return;

    analysis.forEach(item => {
        const { type, message } = item;

        if (type === 'SHOW_INFO') {
            showNotification('info', message);
        }

        if (type === 'SHOW_REMINDER') {
            showNotification('update', message);
        }

        if (type === 'FORCE_UPDATE') {
            blockAppUI(message);
        }
    });
}

/**
 * Shows a banner-style notification AND adds to the drawer
 */
function showNotification(type, message) {
    const banner = document.getElementById('notificationBanner');
    if (banner) {
        banner.textContent = message;
        banner.className = `notification-banner ${type}`;
        banner.classList.remove('hidden');

        // Auto-hide banner if it's info
        if (type === 'info') {
            setTimeout(() => {
                banner.classList.add('hidden');
            }, 8000);
        }
    }

    // Add to Drawer
    addNotificationToDrawer(type, message);
}

/**
 * Appends a notification item to the dedicated drawer area
 */
function addNotificationToDrawer(type, message) {
    if (!notificationList) return;

    const noNotifications = notificationList.querySelector('.no-notifications');
    if (noNotifications) noNotifications.remove();

    const item = document.createElement('div');
    item.className = `notification-item ${type}`;

    const title = type === 'update' ? 'System Update' : (type === 'warning' ? 'Alert' : 'Information');
    const time = new Date().toLocaleTimeString();

    item.innerHTML = `
        <h4>${title}</h4>
        <p>${message}</p>
        <span class="time">${time}</span>
    `;

    notificationList.prepend(item);

    // Update Badge if drawer is closed
    if (notificationDrawer.classList.contains('hidden')) {
        let count = parseInt(notificationBadge.textContent) || 0;
        count++;
        notificationBadge.textContent = count;
        notificationBadge.classList.remove('hidden');
    }
}


/**
 * Blocks the entire application UI
 */
function blockAppUI(message) {
    const overlay = document.getElementById('systemOverlay');
    const msgEl = document.getElementById('systemOverlayMessage');
    const actionArea = document.getElementById('systemOverlayAction');
    const updateBtn = document.getElementById('updateBtn');

    if (!overlay) return;

    msgEl.textContent = message;
    overlay.classList.remove('hidden');

    // Show update button if it's an update-related block
    if (message.toLowerCase().includes('update')) {
        actionArea.classList.remove('hidden');
        updateBtn.onclick = () => {
            // Trigger update check in main
            // For now, we rely on the main process autoUpdater check
            updateBtn.textContent = "Checking...";
            updateBtn.disabled = true;
        };
    }
}


// ✅ NEW: Auto-start Preview Function
async function startPreviewHelper() {
    try {
        const sources = await window.electronAPI.getSources();
        // Filter out recorder if needed, or just take first screen
        const screenSource = sources.find(s => s.name.toLowerCase().includes("screen 1") || s.name.toLowerCase().includes("entire screen")) || sources[0];

        if (screenSource) {
            console.log("Auto-starting preview with:", screenSource.name);

            // Hide placeholder
            placeholderOverlay.classList.add('hidden');

            const width = window.innerWidth;
            const height = window.innerHeight;

            const constraints = {
                audio: false, // No audio for preview to prevent feedback
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: screenSource.id,
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxFrameRate: 30
                    }
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Assign to sourceVideo
            sourceVideo.srcObject = stream;
            await sourceVideo.play();

            // Init Canvas size
            const videoWidth = sourceVideo.videoWidth || 1920;
            const videoHeight = sourceVideo.videoHeight || 1080;
            canvas.width = videoWidth;
            canvas.height = videoHeight;

            // Start Compositor
            compositorRunning = true;
            startCompositor();
        }
    } catch (e) {
        console.warn("Auto-preview failed:", e);
    }
}

// --- Event Listeners ---

// Settings
if (settingsBtn) settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    if (window.electronAPI) {
        window.electronAPI.saveConfig({
            quality: qualitySelect.value,
            format: document.getElementById('formatSelect').value,
            fps: document.getElementById('fpsSelect').value
        });
    }
});
changePathBtn.addEventListener('click', async () => {
    if (window.electronAPI) {
        const path = await window.electronAPI.selectFolder();
        if (path) {
            savePathInput.value = path;
            window.electronAPI.saveConfig({ savePath: path });
        }
    }
});

// Source Picker
async function showSourcePicker() {
    sourceGrid.innerHTML = '';

    let types = ['screen', 'window'];
    if (state.recordingMode === 'screen') types = ['screen'];
    else if (state.recordingMode === 'window') types = ['window'];
    else if (state.recordingMode === 'area') types = ['screen'];

    const sources = await window.electronAPI.getSources(types);

    // Filter out the recorder app itself to prevent recording black canvas
    // (Still good to have as the recorder might be identified as a window)
    const filteredSources = sources.filter(source =>
        !source.name.includes('Pro Screen Recorder') &&
        !source.name.includes('ProRecorder')
    );

    return new Promise(resolve => {
        sourceModal.classList.remove('hidden');
        filteredSources.forEach(source => {
            const div = document.createElement('div');
            div.className = 'source-item';
            div.innerHTML = `<img src="${source.thumbnail}" /><p>${source.name}</p>`;
            div.onclick = () => { sourceModal.classList.add('hidden'); resolve(source); };
            sourceGrid.appendChild(div);
        });
        closeSourceBtn.onclick = () => { sourceModal.classList.add('hidden'); resolve(null); };
    });
}

// Select Source Button
if (selectSourceBtn) {
    selectSourceBtn.addEventListener('click', async () => {
        const source = await showSourcePicker();
        if (source) {
            // Start preview with selected source
            placeholderOverlay.classList.add('hidden');

            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxFrameRate: 30
                    }
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            sourceVideo.srcObject = stream;
            await sourceVideo.play();

            const videoWidth = sourceVideo.videoWidth || 1920;
            const videoHeight = sourceVideo.videoHeight || 1080;
            canvas.width = videoWidth;
            canvas.height = videoHeight;

            compositorRunning = true;
            startCompositor();
        }
    });
}

// Recording Flow
startBtn.addEventListener('click', () => startRecordingHelper());
if (stopBtn) stopBtn.addEventListener('click', stopRecording);
if (pauseBtn) pauseBtn.addEventListener('click', () => { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause(); });
if (resumeBtn) resumeBtn.addEventListener('click', () => { if (mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume(); });

async function startRecordingHelper() {
    if (window.electronAPI) {
        const source = await showSourcePicker();
        if (source) startRecording(source);
    } else {
        startRecording();
    }
}

async function startRecording(selectedSource = null) {
    try {
        const height = parseInt(qualitySelect.value);
        const width = height * (16 / 9);

        // ✅ FIX: Hide placeholder overlay immediately
        placeholderOverlay.classList.add('hidden');

        // 1. Get Screen Stream (System Audio comes with this)
        let screenStream;
        if (window.electronAPI && selectedSource) {
            // Use the selected source for screen capture
            const constraints = {
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop'
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSource.id,
                        maxWidth: width,
                        maxHeight: height,
                        maxFrameRate: parseInt(document.getElementById('fpsSelect').value || 30)
                    }
                }
            };

            // Check if system audio is requested
            const systemAudioEnabled = document.getElementById('audioToggle') ? document.getElementById('audioToggle').checked : true;
            if (!systemAudioEnabled) {
                delete constraints.audio;
            }

            try {
                screenStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (e) {
                console.warn('Error getting screen stream with audio, trying video only:', e);
                // Fallback to video only
                delete constraints.audio;
                screenStream = await navigator.mediaDevices.getUserMedia(constraints);
            }
        } else {
            // Browser-based screen capture
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: width },
                    height: { ideal: height },
                    frameRate: { ideal: parseInt(document.getElementById('fpsSelect').value || 30) }
                },
                audio: true
            });
        }

        // Assign to hidden video
        sourceVideo.srcObject = screenStream;
        await sourceVideo.play();

        // Set canvas size to match the actual video dimensions to capture full screen
        // Wait for video metadata to load
        await new Promise((resolve) => {
            if (sourceVideo.readyState >= 2) {
                resolve();
            } else {
                sourceVideo.addEventListener('loadeddata', resolve, { once: true });
                // Fallback timeout
                setTimeout(resolve, 1000);
            }
        });

        const videoWidth = sourceVideo.videoWidth || width;
        const videoHeight = sourceVideo.videoHeight || height;
        console.log(`Video dimensions: ${videoWidth}x${videoHeight}, readyState: ${sourceVideo.readyState}`);
        canvas.width = videoWidth;
        canvas.height = videoHeight;

        // 2. Get Facecam (if enabled or just ready it)
        try {
            const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
            facecamVideo.srcObject = camStream;
            await facecamVideo.play();
        } catch (e) { console.warn("No camera/access denied"); }

        // 3. Get Mic (if active)
        let micStream;
        if (state.micActive) {
            console.log("Requesting microphone access...");
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
                console.log("Microphone access granted");
            } catch (e) { console.error("Mic failed", e); }
        }

        // 4. Start Compositor for Local Preview (Visual only)
        compositorRunning = true;
        startCompositor();

        // Use screen stream DIRECTLY for recording (skip canvas captureStream)
        console.log("Using direct screen stream for recording (Canvas used for preview only)");

        // 5. Create Merged Stream for Recorder
        // IMPORTANT: MediaRecorder often ignores secondary audio tracks. We must mix them.
        const combinedTracks = [...screenStream.getVideoTracks()];

        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        state.audioContext = audioContext;
        state.audioDestination = destination;

        let hasAudio = false;

        // Add System Audio
        if (screenStream.getAudioTracks().length > 0) {
            console.log("Mixing system audio...");
            const sysSource = audioContext.createMediaStreamSource(screenStream);
            const sysGain = audioContext.createGain();
            sysGain.gain.value = 1.0;
            sysSource.connect(sysGain).connect(destination);
            hasAudio = true;
        }

        // Add Mic Audio (Initial State)
        if (state.micActive) {
            // We can't use await inside this specific block easily if we want to parallelize or clean logic, 
            // but here we can just call it.
            await enableMicInMixer(audioContext, destination);
            hasAudio = true;
        }

        // Note: The previous micStream variable is now redundant if we use enableMicInMixer,
        // but we might have requested it earlier in step 3. 
        // OPTIMIZATION: We should probably skip step 3 if we use this mixer logic.
        // For now, let's just make sure we don't double mix.
        // Since enableMicInMixer requests its own stream, we should NOT use 'micStream' from step 3 here.
        // Just rely on the helper.

        if (hasAudio) {
            console.log("Audio mixed successfully");
            destination.stream.getAudioTracks().forEach(t => combinedTracks.push(t));
        }

        const finalStream = new MediaStream(combinedTracks);
        state.mergedStream = finalStream;

        // 6. Start Recorder
        const preferredFormat = document.getElementById('formatSelect') ? document.getElementById('formatSelect').value : 'webm';
        let options = { mimeType: getSupportedMimeType(preferredFormat) };

        // High bitrate for HD/4K
        if (height >= 1080) options.videoBitsPerSecond = 8000000; // 8Mbps
        if (options.mimeType.includes('mp4')) options.videoBitsPerSecond = 10000000; // 10Mbps for MP4/H264 usually good

        try {
            mediaRecorder = new MediaRecorder(finalStream, options);
        } catch (e) {
            console.warn("Preferred mimeType failed, falling back to default WebM");
            mediaRecorder = new MediaRecorder(finalStream);
        }

        mediaRecorder.ondataavailable = async (e) => {
            if (e.data.size > 0) {
                // Stream to disk instead of accumulating in memory
                // Only write if we still have an active recording
                if (window.electronAPI && currentRecordingFilename && isRecording) {
                    try {
                        const arrayBuffer = await e.data.arrayBuffer();
                        const buffer = new Uint8Array(arrayBuffer);
                        await window.electronAPI.writeRecordingChunk(buffer);
                    } catch (err) {
                        console.warn('Failed to write chunk (stream may be closed):', err);
                    }
                }
            }
        };

        mediaRecorder.onstop = handleStop;
        mediaRecorder.onstart = async () => {
            isRecording = true;

            // Start streaming file if in Electron
            if (window.electronAPI) {
                const mime = mediaRecorder.mimeType;
                const ext = getExtensionFromMime(mime);
                currentRecordingFilename = `rec-${Date.now()}.${ext}`;
                await window.electronAPI.startRecordingStream({ filename: currentRecordingFilename });
            }

            startTimer();
            updateUI('recording');
        };
        mediaRecorder.onpause = () => {
            pauseTimer();
            updateUI('paused');
        }
        mediaRecorder.onresume = () => {
            resumeTimer();
            updateUI('recording');
        }

        // Start with 1s timeslice to ensure frequent data availability
        mediaRecorder.start(1000);

        // Stop listener - only if user stops sharing, not if window is minimized
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.onended = () => {
                console.log('Video track ended - user stopped sharing');
                stopRecording();
            };
        }

    } catch (err) {
        console.error(err);
        statusBadge.textContent = "Error: " + err.message;
    }
}

function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    mediaRecorder.stop();
}

function getSupportedMimeType(preference) {
    const types = [];

    // If MP4 requested, prioritize it
    if (preference === 'mp4') {
        types.push('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
        types.push('video/mp4');
    }

    // WebM priorities
    types.push('video/webm;codecs=vp9,opus');
    types.push('video/webm;codecs=vp8,opus');
    types.push('video/webm');

    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return ''; // Browser default
}

function getExtensionFromMime(mime) {
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('x-matroska')) return 'mkv';
    return 'webm';
}

function startTimer() {
    startTime = Date.now() - elapsedTime;
    timerDisplay.classList.add('active'); // Still show in main UI

    // Initial update
    const timeStr = formatTime(0);
    if (window.electronAPI) window.electronAPI.updateTimerRelay({ time: timeStr, state: 'recording' });

    timerInterval = setInterval(() => {
        elapsedTime = Date.now() - startTime;
        const ts = formatTime(elapsedTime);
        timerDisplay.textContent = ts;
        if (timerDisplayBottom) timerDisplayBottom.textContent = ts;

        // Pass mic state to overlay for sync
        if (window.electronAPI) window.electronAPI.updateTimerRelay({
            time: ts,
            state: 'recording',
            micActive: state.micActive
        });
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerDisplay.classList.remove('active');
    if (window.electronAPI) window.electronAPI.updateTimerRelay({ time: formatTime(elapsedTime), state: 'paused' });
}

function resumeTimer() {
    startTimer();
}

function stopTimer() {
    clearInterval(timerInterval);
    elapsedTime = 0;
    timerDisplay.classList.remove('active');
    timerDisplay.textContent = "00:00:00";
    if (timerDisplayBottom) timerDisplayBottom.textContent = "00:00:00";
    if (window.electronAPI) window.electronAPI.updateTimerRelay({ time: "00:00:00", state: 'idle' });
}

function updateUI(state) {
    // states: 'idle', 'recording', 'paused'
    startBtn.classList.toggle('hidden', state !== 'idle');
    if (stopBtn) stopBtn.classList.toggle('hidden', state === 'idle');

    pauseBtn.classList.toggle('hidden', state !== 'recording');
    resumeBtn.classList.toggle('hidden', state !== 'paused');

    placeholderOverlay.classList.toggle('hidden', state !== 'idle');

    // Update console log instead of status badge (removed from new UI)
    if (state === 'recording') {
        console.log("Status: Recording...");
    } else if (state === 'paused') {
        console.log("Status: Paused");
    } else {
        console.log("Status: Ready");
    }

    // Auto-hide settings/source if open
    if (state !== 'idle') {
        settingsModal.classList.add('hidden');
        sourceModal.classList.add('hidden');
    }

    // Toggle Overlay - show during recording and paused states
    if (window.electronAPI) {
        window.electronAPI.showOverlay(state === 'recording' || state === 'paused');

        // Send state to overlay for proper button visibility
        const timeStr = formatTime(elapsedTime);
        window.electronAPI.updateTimerRelay({
            time: timeStr,
            state: state,
            micActive: state.micActive
        });
    }
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

// Compositor
function startCompositor() {
    function draw() {
        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Screen (from sourceVideo)
        // Check if video is playing/ready
        if (sourceVideo.readyState >= 2) {
            ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
        }

        // 2. Draw Facecam (if active)
        if (state.facecamActive && facecamVideo.readyState >= 2) {
            const { x, y, w, h } = state.facecamPos;
            ctx.save();
            // Draw border
            ctx.strokeStyle = "white";
            ctx.lineWidth = 4;
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 10;
            ctx.strokeRect(x, y, w, h);
            ctx.drawImage(facecamVideo, x, y, w, h);
            ctx.restore();
        }

        // Use compositorRunning flag instead of isRecording
        if (compositorRunning) {
            animationId = requestAnimationFrame(draw);
        }
    }
    draw();
}

// Start compositor and wait for first frame to be drawn
function startCompositorAndWait() {
    return new Promise((resolve) => {
        function drawInitial() {
            // Clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 1. Draw Screen (from sourceVideo)
            if (sourceVideo.readyState >= 2) {
                ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
            }

            // 2. Draw Facecam (if active)
            if (state.facecamActive && facecamVideo.readyState >= 2) {
                const { x, y, w, h } = state.facecamPos;
                ctx.save();
                ctx.strokeStyle = "white";
                ctx.lineWidth = 4;
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur = 10;
                ctx.strokeRect(x, y, w, h);
                ctx.drawImage(facecamVideo, x, y, w, h);
                ctx.restore();
            }

            // Start continuous loop
            if (compositorRunning) {
                animationId = requestAnimationFrame(continueDraw);
            }

            // Resolve after first frame is drawn
            resolve();
        }

        function continueDraw() {
            // Clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 1. Draw Screen
            if (sourceVideo.readyState >= 2) {
                ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
            }

            // 2. Draw Facecam (if active)
            if (state.facecamActive && facecamVideo.readyState >= 2) {
                const { x, y, w, h } = state.facecamPos;
                ctx.save();
                ctx.strokeStyle = "white";
                ctx.lineWidth = 4;
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur = 10;
                ctx.strokeRect(x, y, w, h);
                ctx.drawImage(facecamVideo, x, y, w, h);
                ctx.restore();
            }

            if (compositorRunning) {
                animationId = requestAnimationFrame(continueDraw);
            }
        }

        // Wait for video to be ready, then draw
        const waitForVideo = () => {
            if (sourceVideo.readyState >= 2 && sourceVideo.videoWidth > 0) {
                console.log(`Video ready: ${sourceVideo.videoWidth}x${sourceVideo.videoHeight}`);
                drawInitial();
            } else {
                console.log(`Waiting for video... readyState: ${sourceVideo.readyState}, width: ${sourceVideo.videoWidth}`);
                setTimeout(waitForVideo, 100);
            }
        };
        waitForVideo();
    });
}

async function handleStop() {
    // Wait a bit for any pending chunks to be written
    await new Promise(resolve => setTimeout(resolve, 500));

    isRecording = false;
    compositorRunning = false; // Stop compositor
    stopTimer();

    // Export first (closes stream), then cleanup
    const result = await exportRecording();
    cleanupStreams();
    updateUI('idle');

    // Show Review Modal if successful
    if (result && result.success && result.path) {
        showReviewModal(result.path);
        addToRecentRecordings(result.path);
    }
}

function showReviewModal(filePath) {
    if (!reviewModal || !recordingPlayer) return;

    // Set video source
    // In Electron, we might need a custom protocol or just path if security is disabled
    // But for local files, usually 'file://' works if contextIsolation is handled or webSecurity disabled
    // Or we can use a blob if we had one. Since we streamed to disk, we try file path.
    // Note: Chrome/Electron might block local file access from renderer. 
    // Best practice: invoke main process to read file or use 'file://' protocol explicitly.

    recordingPlayer.src = `file://${filePath}`;
    reviewModal.classList.remove('hidden');
    recordingPlayer.play();

    // Handler for open folder
    openFolderReviewBtn.onclick = () => {
        if (window.electronAPI) window.electronAPI.openRecordingsFolder();
    };

    closeReviewBtn.onclick = () => {
        reviewModal.classList.add('hidden');
        recordingPlayer.pause();
        recordingPlayer.src = "";
    };
}

function addToRecentRecordings(filePath) {
    // Add to the list in sidebar (Reading/Recordings Section)
    const list = document.getElementById('recordingsContent');
    const noRecs = list.querySelector('.no-recordings');
    if (noRecs) noRecs.style.display = 'none';

    const div = document.createElement('div');
    div.className = 'recording-item';
    const timestamp = new Date().toLocaleTimeString();
    const basename = filePath.replace(/^.*[\\\/]/, '');

    div.innerHTML = `
        <div class="recording-info">
            <span class="recording-name">${basename}</span>
            <span class="recording-date">${timestamp}</span>
        </div>
    `;
    div.onclick = () => showReviewModal(filePath);
    list.prepend(div);
}

function cleanupStreams() {
    // Cancel animation loop
    if (animationId) cancelAnimationFrame(animationId);

    // Stop all tracks in mergedStream
    if (state.mergedStream) {
        state.mergedStream.getTracks().forEach(t => t.stop());
        state.mergedStream = null;
    }

    // Stop source streams
    if (sourceVideo.srcObject) {
        sourceVideo.srcObject.getTracks().forEach(t => t.stop());
        sourceVideo.srcObject = null;
    }
    if (facecamVideo.srcObject) {
        facecamVideo.srcObject.getTracks().forEach(t => t.stop());
        facecamVideo.srcObject = null;
    }
}

async function exportRecording() {
    if (window.electronAPI && currentRecordingFilename) {
        // Using streaming - just close the stream
        console.log("Finalizing recording...");
        const res = await window.electronAPI.stopRecordingStream();
        console.log(res.success ? "Saved: " + res.path : "Error saving recording");
        currentRecordingFilename = null;
        return res;
    } else {
        // Browser fallback - not streaming, would need recordedChunks
        console.error("Browser recording requires in-memory chunks (not implemented)");
        return { success: false };
    }
}

// Feature Toggles - Updated for new UI
if (micToggle) {
    micToggle.addEventListener('change', async () => {
        state.micActive = micToggle.checked;
        console.log("Mic toggled:", state.micActive);

        // If recording is active, update the mixer
        if (isRecording && state.audioContext) {
            if (state.micActive) {
                await enableMicInMixer(state.audioContext, state.audioDestination);
            } else {
                disableMicInMixer();
            }
        }
    });
}

// Mic Mixer Helper Functions
async function enableMicInMixer(context, destination) {
    if (state.micSourceLink) return; // Already connected

    console.log("Enabling mic in mixer...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

        const source = context.createMediaStreamSource(stream);
        const gain = context.createGain();
        gain.gain.value = 1.0;

        source.connect(gain).connect(destination);

        // Store references to disconnect later
        state.micSourceLink = { stream, source, gain };
        state.micGain = gain;

        console.log("Mic enabled in mixer");
    } catch (e) {
        console.warn("Retrying mic enable failed:", e);
    }
}

function disableMicInMixer() {
    if (state.micSourceLink) {
        console.log("Disabling mic in mixer...");
        // Fade out?
        if (state.micGain) state.micGain.gain.value = 0;

        // Disconnect and stop tracks
        setTimeout(() => {
            if (state.micSourceLink) {
                state.micSourceLink.source.disconnect();
                if (state.micGain) state.micGain.disconnect();
                state.micSourceLink.stream.getTracks().forEach(t => t.stop());
                state.micSourceLink = null;
                state.micGain = null;
            }
        }, 100);
    }
}

if (audioToggle) {
    audioToggle.addEventListener('change', () => {
        // Handle system audio toggle if needed
        console.log('System audio toggle:', audioToggle.checked);
    });
}

// ... (previous listeners)
// Drawing tools logic removed
function startCountdown(onComplete) {
    let count = 3;
    countdownOverlay.textContent = count;
    countdownOverlay.classList.remove('hidden');

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownOverlay.textContent = count;
        } else {
            clearInterval(interval);
            countdownOverlay.classList.add('hidden');
            onComplete();
        }
    }, 1000);
}

// Modify startRecording to use Countdown
async function startRecordingHelper() {
    if (window.electronAPI) {
        const source = await showSourcePicker();
        if (source) {
            startCountdown(() => startRecording(source));
        }
    } else {
        startCountdown(() => startRecording());
    }
}



if (folderBtn) {
    folderBtn.addEventListener('click', () => {
        if (window.electronAPI) {
            window.electronAPI.openRecordingsFolder();
        }
    });
}

// Countdown Logic

if (screenshotBtn) {
    screenshotBtn.addEventListener('click', captureScreenshot);
}

async function captureScreenshot() {
    // Visual feedback
    canvas.style.filter = "brightness(1.5)";
    setTimeout(() => canvas.style.filter = "none", 100);

    const dataURL = canvas.toDataURL('image/png');
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");

    if (window.electronAPI) {
        const buffer = new Uint8Array(Buffer.from(base64Data, 'base64'));
        const filename = `shot-${Date.now()}.png`;
        const res = await window.electronAPI.saveFile({ buffer, filename });
        console.log(res.success ? "Screenshot Saved: " + res.path : "Error saving screenshot");
    } else {
        const link = document.createElement('a');
        link.download = `shot-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
    }
}
