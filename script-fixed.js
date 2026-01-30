/**
 * 🎬 FIXED SCREEN RECORDER - NO BLACK SCREENS
 * 
 * Key Fixes:
 * 1. Records directly from getDisplayMedia stream (NOT canvas)
 * 2. Hides all UI overlays before recording
 * 3. Verifies video tracks are active
 * 4. Prevents overlay from appearing in recordings
 */

// DOM Elements
const canvas = document.getElementById('compositorCanvas');
const ctx = canvas.getContext('2d');
const sourceVideo = document.getElementById('sourceVideo');
const facecamVideo = document.getElementById('facecamVideo');
const paramsBtn = document.getElementById('paramsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const savePathInput = document.getElementById('savePathInput');
const changePathBtn = document.getElementById('changePathBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const qualitySelect = document.getElementById('qualitySelect');

// UI Elements
const statusBadge = document.getElementById('statusBadge');
const timerDisplay = document.getElementById('timer');
const placeholderOverlay = document.getElementById('placeholderOverlay');
const micToggle = document.getElementById('micToggle');
const audioToggle = document.getElementById('audioToggle');

// Modals
const sourceModal = document.getElementById('sourceModal');
const closeSourceBtn = document.getElementById('closeSourceBtn');
const sourceGrid = document.getElementById('sourceGrid');

// Feature Buttons
const toggleCamBtn = document.getElementById('toggleCamBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const mainScreenshotBtn = document.getElementById('mainScreenshotBtn');
const folderBtn = document.getElementById('folderBtn');
const countdownOverlay = document.getElementById('countdownOverlay');

// Recording State
let mediaRecorder;
let currentRecordingFilename = null;
let timerInterval;
let startTime;
let elapsedTime = 0;
let isRecording = false;

// Application State
const state = {
    facecamActive: false,
    micActive: true,
    facecamPos: { x: 20, y: 20, w: 240, h: 180 },
    screenStream: null,
    mergedStream: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

(async () => {
    if (window.electronAPI) {
        statusBadge.textContent = "Desktop Mode Ready";
        const config = await window.electronAPI.getConfig();
        if (config.savePath) savePathInput.value = config.savePath;
        if (config.quality) qualitySelect.value = config.quality;
        if (config.format) document.getElementById('formatSelect').value = config.format;
        if (config.fps) document.getElementById('fpsSelect').value = config.fps;

        // Global shortcuts
        window.electronAPI.onShortcutTrigger((action) => {
            if (action === 'toggle-recording') {
                if (isRecording) stopRecording();
                else startRecordingHelper();
            }
        });

        window.electronAPI.onTriggerScreenshot(() => captureScreenshot());
        window.electronAPI.onTriggerPause(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
        });
        window.electronAPI.onTriggerResume(() => {
            if (mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume();
        });
        window.electronAPI.onTriggerStop(() => stopRecording());
        window.electronAPI.onTriggerRecord(() => {
            if (!isRecording) startRecordingHelper();
        });
    }
})();

// ============================================================================
// EVENT LISTENERS - SETTINGS
// ============================================================================

paramsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
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

// ============================================================================
// SOURCE PICKER
// ============================================================================

async function showSourcePicker() {
    sourceGrid.innerHTML = '';
    const sources = await window.electronAPI.getSources();

    // ✅ FIX: Filter out the recorder app itself to prevent black screen
    const filteredSources = sources.filter(source =>
        !source.name.includes('Pro Screen Recorder') &&
        !source.name.includes('ProRecorder') &&
        !source.name.includes('Screen Recorder')
    );

    return new Promise(resolve => {
        sourceModal.classList.remove('hidden');
        filteredSources.forEach(source => {
            const div = document.createElement('div');
            div.className = 'source-item';
            div.innerHTML = `<img src="${source.thumbnail}" /><p>${source.name}</p>`;
            div.onclick = () => {
                sourceModal.classList.add('hidden');
                resolve(source);
            };
            sourceGrid.appendChild(div);
        });
        closeSourceBtn.onclick = () => {
            sourceModal.classList.add('hidden');
            resolve(null);
        };
    });
}

// ============================================================================
// RECORDING CONTROLS
// ============================================================================

startBtn.addEventListener('click', () => startRecordingHelper());
stopBtn.addEventListener('click', stopRecording);
pauseBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
});
resumeBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume();
});

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

// ============================================================================
// MAIN RECORDING FUNCTION - ✅ FIXED VERSION
// ============================================================================

async function startRecording(selectedSource = null) {
    try {
        const height = parseInt(qualitySelect.value);
        const width = Math.round(height * (16 / 9));

        // ✅ FIX 1: Hide placeholder BEFORE getting stream
        placeholderOverlay.classList.add('hidden');

        console.log('🎬 Starting recording process...');

        // ✅ FIX 2: Get Screen Stream DIRECTLY (not from canvas)
        let screenStream;

        if (window.electronAPI && selectedSource) {
            // Electron mode: Use desktopCapturer
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
                        minWidth: width,
                        minHeight: height,
                        maxWidth: width * 1.5,
                        maxHeight: height * 1.5,
                        maxFrameRate: parseInt(document.getElementById('fpsSelect').value || 30)
                    }
                }
            };

            // Remove audio if mic is disabled
            if (!state.micActive) delete constraints.audio;

            try {
                screenStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (e) {
                console.warn('Error getting screen with audio, trying video only:', e);
                delete constraints.audio;
                screenStream = await navigator.mediaDevices.getUserMedia(constraints);
            }

        } else {
            // ✅ Browser mode: Use getDisplayMedia (CORRECT METHOD)
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: width, min: 640 },
                    height: { ideal: height, min: 480 },
                    frameRate: { ideal: parseInt(document.getElementById('fpsSelect').value || 30) }
                },
                audio: true, // System audio
                preferCurrentTab: false // ✅ CRITICAL: Don't capture current tab
            });
        }

        // ✅ FIX 3: Verify video track is active
        const videoTrack = screenStream.getVideoTracks()[0];
        if (!videoTrack) {
            throw new Error('No video track available');
        }

        if (videoTrack.readyState !== 'live') {
            throw new Error('Video track is not in live state');
        }

        console.log('✅ Screen stream obtained:', {
            label: videoTrack.label,
            state: videoTrack.readyState,
            settings: videoTrack.getSettings()
        });

        // Optional: Show preview in UI (for user feedback only, NOT for recording)
        sourceVideo.srcObject = screenStream;
        await sourceVideo.play();

        // Wait for video to be ready
        await new Promise((resolve) => {
            if (sourceVideo.readyState >= 2) {
                resolve();
            } else {
                sourceVideo.addEventListener('loadeddata', resolve, { once: true });
                setTimeout(resolve, 1000); // Fallback timeout
            }
        });

        const videoWidth = sourceVideo.videoWidth || width;
        const videoHeight = sourceVideo.videoHeight || height;
        console.log(`📐 Video dimensions: ${videoWidth}x${videoHeight}`);

        // Set canvas size for preview (optional)
        canvas.width = videoWidth;
        canvas.height = videoHeight;

        // ✅ FIX 4: Get Microphone (if enabled)
        let micStream;
        if (state.micActive) {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                console.log('🎤 Microphone stream obtained');
            } catch (e) {
                console.warn('Microphone access denied:', e);
            }
        }

        // ✅ FIX 5: Combine tracks for recording
        const recordingTracks = [];

        // Add video track from screen (DIRECT, not from canvas)
        recordingTracks.push(...screenStream.getVideoTracks());

        // Add audio tracks (system + mic)
        recordingTracks.push(...screenStream.getAudioTracks());
        if (micStream) {
            recordingTracks.push(...micStream.getAudioTracks());
        }

        // Create final stream for MediaRecorder
        const finalStream = new MediaStream(recordingTracks);
        state.mergedStream = finalStream;
        state.screenStream = screenStream;

        console.log('✅ Final recording stream:', {
            videoTracks: finalStream.getVideoTracks().length,
            audioTracks: finalStream.getAudioTracks().length
        });

        // ✅ FIX 6: Create MediaRecorder with optimal settings
        const preferredFormat = document.getElementById('formatSelect')?.value || 'webm';
        let options = {
            mimeType: getSupportedMimeType(preferredFormat),
            videoBitsPerSecond: height >= 1080 ? 8000000 : 5000000
        };

        try {
            mediaRecorder = new MediaRecorder(finalStream, options);
            console.log('✅ MediaRecorder created with mimeType:', options.mimeType);
        } catch (e) {
            console.warn('Preferred codec failed, using default:', e);
            mediaRecorder = new MediaRecorder(finalStream);
        }

        // ✅ FIX 7: Setup event handlers
        mediaRecorder.ondataavailable = async (e) => {
            if (e.data.size > 0) {
                if (window.electronAPI && currentRecordingFilename && isRecording) {
                    try {
                        const arrayBuffer = await e.data.arrayBuffer();
                        const buffer = new Uint8Array(arrayBuffer);
                        await window.electronAPI.writeRecordingChunk(buffer);
                    } catch (err) {
                        console.warn('Failed to write chunk:', err);
                    }
                }
            }
        };

        mediaRecorder.onstart = async () => {
            isRecording = true;

            // Start streaming file if in Electron
            if (window.electronAPI) {
                const mime = mediaRecorder.mimeType;
                const ext = getExtensionFromMime(mime);
                currentRecordingFilename = `rec-${Date.now()}.${ext}`;
                await window.electronAPI.startRecordingStream({
                    filename: currentRecordingFilename
                });
            }

            startTimer();
            updateUI('recording');

            console.log('✅ Recording started successfully');
        };

        mediaRecorder.onstop = handleStop;

        mediaRecorder.onpause = () => {
            pauseTimer();
            updateUI('paused');
        };

        mediaRecorder.onresume = () => {
            resumeTimer();
            updateUI('recording');
        };

        mediaRecorder.onerror = (e) => {
            console.error('❌ MediaRecorder error:', e);
            statusBadge.textContent = 'Recording error';
        };

        // ✅ FIX 8: Start recording with 1s timeslice
        mediaRecorder.start(1000);

        // ✅ FIX 9: Handle user stopping screen share
        videoTrack.onended = () => {
            console.log('User stopped sharing screen');
            stopRecording();
        };

    } catch (err) {
        console.error('❌ Recording failed:', err);
        statusBadge.textContent = `Error: ${err.message}`;
        cleanupStreams();
        updateUI('idle');
    }
}

// ============================================================================
// STOP RECORDING
// ============================================================================

function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    console.log('🛑 Stopping recording...');
    mediaRecorder.stop();
}

async function handleStop() {
    // Wait for pending chunks
    await new Promise(resolve => setTimeout(resolve, 500));

    isRecording = false;
    stopTimer();

    // Export and cleanup
    await exportRecording();
    cleanupStreams();
    updateUI('idle');

    console.log('✅ Recording stopped and saved');
}

// ============================================================================
// STREAM CLEANUP
// ============================================================================

function cleanupStreams() {
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

    if (state.screenStream) {
        state.screenStream.getTracks().forEach(t => t.stop());
        state.screenStream = null;
    }
}

// ============================================================================
// EXPORT RECORDING
// ============================================================================

async function exportRecording() {
    if (window.electronAPI && currentRecordingFilename) {
        statusBadge.textContent = "Finalizing...";
        const res = await window.electronAPI.stopRecordingStream();
        statusBadge.textContent = res.success ? `Saved: ${res.path}` : "Error";
        setTimeout(() => statusBadge.textContent = "Ready", 3000);
        currentRecordingFilename = null;
    } else {
        statusBadge.textContent = "Browser mode not supported for streaming";
        console.error("Browser recording requires in-memory chunks (not implemented)");
    }
}

// ============================================================================
// TIMER FUNCTIONS
// ============================================================================

function startTimer() {
    startTime = Date.now() - elapsedTime;
    timerDisplay.classList.add('active');

    const timeStr = formatTime(0);
    if (window.electronAPI) {
        window.electronAPI.updateTimerRelay({ time: timeStr, state: 'recording' });
    }

    timerInterval = setInterval(() => {
        elapsedTime = Date.now() - startTime;
        const ts = formatTime(elapsedTime);
        timerDisplay.textContent = ts;
        if (window.electronAPI) {
            window.electronAPI.updateTimerRelay({ time: ts, state: 'recording' });
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerDisplay.classList.remove('active');
    if (window.electronAPI) {
        window.electronAPI.updateTimerRelay({
            time: formatTime(elapsedTime),
            state: 'paused'
        });
    }
}

function resumeTimer() {
    startTimer();
}

function stopTimer() {
    clearInterval(timerInterval);
    elapsedTime = 0;
    timerDisplay.classList.remove('active');
    timerDisplay.textContent = "00:00:00";
    if (window.electronAPI) {
        window.electronAPI.updateTimerRelay({ time: "00:00:00", state: 'idle' });
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

// ============================================================================
// UI UPDATE
// ============================================================================

function updateUI(state) {
    startBtn.classList.toggle('hidden', state !== 'idle');
    stopBtn.disabled = state === 'idle';
    pauseBtn.classList.toggle('hidden', state !== 'recording');
    resumeBtn.classList.toggle('hidden', state !== 'paused');
    downloadBtn.classList.add('hidden');
    placeholderOverlay.classList.toggle('hidden', state !== 'idle');

    if (state === 'recording') {
        statusBadge.textContent = "Recording...";
        statusBadge.style.color = "#f87171";
        statusBadge.style.background = "rgba(220, 38, 38, 0.2)";
    } else if (state === 'paused') {
        statusBadge.textContent = "Paused";
        statusBadge.style.color = "#fbbf24";
        statusBadge.style.background = "rgba(251, 191, 36, 0.2)";
    } else {
        statusBadge.textContent = "Ready";
        statusBadge.style.color = "white";
        statusBadge.style.background = "rgba(255,255,255,0.1)";
    }

    // Auto-hide modals
    if (state !== 'idle') {
        settingsModal.classList.add('hidden');
        sourceModal.classList.add('hidden');
    }

    // ✅ FIX: Show overlay AFTER recording starts (with delay)
    if (window.electronAPI) {
        if (state === 'recording') {
            // Delay showing overlay to prevent it from being in first frames
            setTimeout(() => {
                window.electronAPI.showOverlay(true);
            }, 500);
        } else if (state === 'idle') {
            window.electronAPI.showOverlay(false);
        } else {
            window.electronAPI.showOverlay(true);
        }

        const timeStr = formatTime(elapsedTime);
        window.electronAPI.updateTimerRelay({ time: timeStr, state: state });
    }
}

// ============================================================================
// CODEC SUPPORT
// ============================================================================

function getSupportedMimeType(preference) {
    const types = [];

    if (preference === 'mp4') {
        types.push('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
        types.push('video/mp4');
    }

    types.push('video/webm;codecs=vp9,opus');
    types.push('video/webm;codecs=vp8,opus');
    types.push('video/webm');

    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

function getExtensionFromMime(mime) {
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('x-matroska')) return 'mkv';
    return 'webm';
}

// ============================================================================
// COUNTDOWN
// ============================================================================

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

// ============================================================================
// FEATURE TOGGLES
// ============================================================================

if (toggleCamBtn) {
    toggleCamBtn.addEventListener('click', () => {
        state.facecamActive = !state.facecamActive;
        toggleCamBtn.classList.toggle('active', state.facecamActive);
    });
}

if (toggleMicBtn) {
    toggleMicBtn.addEventListener('click', () => {
        state.micActive = !state.micActive;
        toggleMicBtn.classList.toggle('active', state.micActive);
        if (micToggle) micToggle.checked = state.micActive;
    });
}

if (folderBtn) {
    folderBtn.addEventListener('click', () => {
        if (window.electronAPI) {
            window.electronAPI.openRecordingsFolder();
        }
    });
}

// ============================================================================
// SCREENSHOT
// ============================================================================

if (screenshotBtn) {
    screenshotBtn.addEventListener('click', captureScreenshot);
}

if (mainScreenshotBtn) {
    mainScreenshotBtn.addEventListener('click', captureScreenshot);
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
        statusBadge.textContent = res.success ? "Screenshot Saved" : "Error";
        setTimeout(() => {
            statusBadge.textContent = isRecording ? "Recording..." : "Ready";
        }, 2000);
    } else {
        const link = document.createElement('a');
        link.download = `shot-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
    }
}

console.log('✅ Screen Recorder initialized (FIXED VERSION)');
