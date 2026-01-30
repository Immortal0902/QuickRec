/**
 * 🎬 SCREEN RECORDING: WRONG vs RIGHT
 * 
 * This file shows side-by-side comparison of incorrect and correct approaches
 */

// ============================================================================
// ❌ WRONG APPROACH #1: Recording from Canvas
// ============================================================================

async function startRecording_WRONG_Canvas() {
    // Get display stream
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    });

    // Assign to video element
    const video = document.getElementById('sourceVideo');
    video.srcObject = screenStream;
    await video.play();

    // Draw video to canvas
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    function draw() {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
    }
    draw();

    // ❌ WRONG: Capture from canvas
    const canvasStream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(canvasStream);

    mediaRecorder.start();

    // PROBLEM: If requestAnimationFrame stops or lags → black frames
    // PROBLEM: Canvas might show placeholder text or UI elements
}

// ============================================================================
// ✅ RIGHT APPROACH #1: Recording Directly from Stream
// ============================================================================

async function startRecording_RIGHT_DirectStream() {
    // Get display stream
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
            frameRate: { ideal: 30 }
        },
        audio: true,
        preferCurrentTab: false // ✅ Important!
    });

    // ✅ Verify video track is active
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
        throw new Error('Video track not ready');
    }

    console.log('✅ Video track active:', videoTrack.getSettings());

    // ✅ RIGHT: Record directly from stream
    const mediaRecorder = new MediaRecorder(screenStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 8000000
    });

    mediaRecorder.start(1000);

    // BENEFIT: Direct capture, no canvas overhead
    // BENEFIT: No risk of black frames
    // BENEFIT: Better performance
}

// ============================================================================
// ❌ WRONG APPROACH #2: Showing Overlay Immediately
// ============================================================================

async function startRecording_WRONG_OverlayTiming() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    });

    const mediaRecorder = new MediaRecorder(screenStream);

    // ❌ WRONG: Show overlay immediately
    showFloatingOverlay(); // Overlay appears in recording!

    mediaRecorder.start();

    // PROBLEM: First frames of recording contain the overlay
    // PROBLEM: If recording entire screen, overlay is visible throughout
}

// ============================================================================
// ✅ RIGHT APPROACH #2: Delayed Overlay Display
// ============================================================================

async function startRecording_RIGHT_OverlayTiming() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        preferCurrentTab: false
    });

    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack.readyState !== 'live') {
        throw new Error('Video track not ready');
    }

    const mediaRecorder = new MediaRecorder(screenStream);

    mediaRecorder.start(1000);

    // ✅ RIGHT: Delay overlay display
    setTimeout(() => {
        showFloatingOverlay(); // Overlay appears after recording stabilizes
    }, 500);

    // BENEFIT: First frames are clean
    // BENEFIT: Overlay doesn't appear in critical recording moments
}

// ============================================================================
// ❌ WRONG APPROACH #3: Not Hiding Placeholder
// ============================================================================

async function startRecording_WRONG_PlaceholderVisible() {
    // Placeholder overlay is still visible: "Select a screen to start preview"

    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    });

    // ❌ Placeholder is still showing!
    const mediaRecorder = new MediaRecorder(screenStream);
    mediaRecorder.start();

    // PROBLEM: Placeholder text appears in the recording
    // PROBLEM: Canvas might show this text instead of actual screen
}

// ============================================================================
// ✅ RIGHT APPROACH #3: Hide Placeholder First
// ============================================================================

async function startRecording_RIGHT_PlaceholderHidden() {
    // ✅ Hide placeholder BEFORE getting stream
    const placeholderOverlay = document.getElementById('placeholderOverlay');
    placeholderOverlay.classList.add('hidden');

    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: true,
        preferCurrentTab: false
    });

    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack.readyState !== 'live') {
        throw new Error('Video track not ready');
    }

    const mediaRecorder = new MediaRecorder(screenStream);
    mediaRecorder.start(1000);

    // BENEFIT: No placeholder text in recording
    // BENEFIT: Clean, professional output
}

// ============================================================================
// ❌ WRONG APPROACH #4: Not Filtering Own Window
// ============================================================================

async function showSourcePicker_WRONG_NoFilter() {
    // In Electron
    const sources = await desktopCapturer.getSources({
        types: ['window', 'screen']
    });

    // ❌ WRONG: Show all sources including own app
    sources.forEach(source => {
        // User might select "ProRecorder" window
        // This causes black screen or feedback loop
        addSourceToUI(source);
    });

    // PROBLEM: Recording own app window shows black canvas
    // PROBLEM: Creates visual feedback loop
}

// ============================================================================
// ✅ RIGHT APPROACH #4: Filter Out Own Window
// ============================================================================

async function showSourcePicker_RIGHT_Filtered() {
    // In Electron
    const sources = await desktopCapturer.getSources({
        types: ['window', 'screen']
    });

    // ✅ RIGHT: Filter out own app
    const filteredSources = sources.filter(source =>
        !source.name.includes('ProRecorder') &&
        !source.name.includes('Screen Recorder') &&
        !source.name.includes('Pro Screen Recorder')
    );

    filteredSources.forEach(source => {
        addSourceToUI(source);
    });

    // BENEFIT: User can't accidentally select recorder window
    // BENEFIT: Prevents black screen from self-recording
}

// ============================================================================
// ❌ WRONG APPROACH #5: Not Checking Track State
// ============================================================================

async function startRecording_WRONG_NoVerification() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    });

    // ❌ WRONG: Assume stream is ready
    const mediaRecorder = new MediaRecorder(screenStream);
    mediaRecorder.start();

    // PROBLEM: Video track might not be ready yet
    // PROBLEM: First frames might be black
    // PROBLEM: Recording might fail silently
}

// ============================================================================
// ✅ RIGHT APPROACH #5: Verify Track State
// ============================================================================

async function startRecording_RIGHT_WithVerification() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
        },
        audio: true,
        preferCurrentTab: false
    });

    // ✅ RIGHT: Verify video track
    const videoTrack = screenStream.getVideoTracks()[0];

    if (!videoTrack) {
        throw new Error('No video track available');
    }

    if (videoTrack.readyState !== 'live') {
        throw new Error(`Video track not ready: ${videoTrack.readyState}`);
    }

    console.log('✅ Video track verified:', {
        label: videoTrack.label,
        state: videoTrack.readyState,
        settings: videoTrack.getSettings()
    });

    const mediaRecorder = new MediaRecorder(screenStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 8000000
    });

    mediaRecorder.start(1000);

    // BENEFIT: Guaranteed clean recording
    // BENEFIT: Early error detection
    // BENEFIT: Better debugging
}

// ============================================================================
// ❌ WRONG APPROACH #6: Using preferCurrentTab
// ============================================================================

async function startRecording_WRONG_PreferCurrentTab() {
    // ❌ WRONG: Prefer current tab
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        preferCurrentTab: true // ❌ BAD
    });

    const mediaRecorder = new MediaRecorder(screenStream);
    mediaRecorder.start();

    // PROBLEM: Might capture browser UI
    // PROBLEM: Might capture wrong content
    // PROBLEM: Limited to current tab
}

// ============================================================================
// ✅ RIGHT APPROACH #6: Let User Choose
// ============================================================================

async function startRecording_RIGHT_UserChoice() {
    // ✅ RIGHT: Let user choose what to record
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
            frameRate: { ideal: 30 }
        },
        audio: true,
        preferCurrentTab: false // ✅ GOOD - User chooses
    });

    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack.readyState !== 'live') {
        throw new Error('Video track not ready');
    }

    const mediaRecorder = new MediaRecorder(screenStream);
    mediaRecorder.start(1000);

    // BENEFIT: User has full control
    // BENEFIT: Can record any window/screen
    // BENEFIT: More flexible
}

// ============================================================================
// ✅ COMPLETE CORRECT IMPLEMENTATION
// ============================================================================

async function startRecording_COMPLETE_CORRECT(selectedSource = null) {
    try {
        // 1. Hide all UI elements
        document.getElementById('placeholderOverlay').classList.add('hidden');

        console.log('🎬 Starting recording...');

        // 2. Get screen stream
        let screenStream;

        if (window.electronAPI && selectedSource) {
            // Electron mode
            screenStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: { chromeMediaSource: 'desktop' }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSource.id,
                        minWidth: 1280,
                        minHeight: 720,
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxFrameRate: 30
                    }
                }
            });
        } else {
            // Browser mode
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920, min: 640 },
                    height: { ideal: 1080, min: 480 },
                    frameRate: { ideal: 30 }
                },
                audio: true,
                preferCurrentTab: false
            });
        }

        // 3. Verify video track
        const videoTrack = screenStream.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState !== 'live') {
            throw new Error('Video track not ready');
        }

        console.log('✅ Video track active:', videoTrack.getSettings());

        // 4. Get microphone (optional)
        let micStream;
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            console.log('✅ Microphone stream obtained');
        } catch (e) {
            console.warn('Microphone not available:', e);
        }

        // 5. Combine tracks
        const tracks = [
            ...screenStream.getVideoTracks(),
            ...screenStream.getAudioTracks()
        ];

        if (micStream) {
            tracks.push(...micStream.getAudioTracks());
        }

        const finalStream = new MediaStream(tracks);

        console.log('✅ Final stream:', {
            video: finalStream.getVideoTracks().length,
            audio: finalStream.getAudioTracks().length
        });

        // 6. Create MediaRecorder
        const options = {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 8000000
        };

        let mediaRecorder;
        try {
            mediaRecorder = new MediaRecorder(finalStream, options);
        } catch (e) {
            console.warn('VP9 not supported, using default codec');
            mediaRecorder = new MediaRecorder(finalStream);
        }

        // 7. Setup event handlers
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunks.push(e.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            // Download
            const a = document.createElement('a');
            a.href = url;
            a.download = `recording-${Date.now()}.webm`;
            a.click();

            console.log('✅ Recording saved');
        };

        // 8. Start recording
        mediaRecorder.start(1000);

        console.log('✅ Recording started');

        // 9. Show overlay (delayed)
        setTimeout(() => {
            if (window.electronAPI) {
                window.electronAPI.showOverlay(true);
            }
        }, 500);

        // 10. Handle user stopping screen share
        videoTrack.onended = () => {
            console.log('User stopped sharing');
            mediaRecorder.stop();
        };

        return mediaRecorder;

    } catch (error) {
        console.error('❌ Recording failed:', error);
        throw error;
    }
}

// ============================================================================
// SUMMARY OF KEY DIFFERENCES
// ============================================================================

/*

❌ WRONG APPROACH:
- Record from canvas.captureStream()
- Show overlay immediately
- Don't hide placeholder
- Don't filter own window
- Don't verify track state
- Use preferCurrentTab: true

RESULT: Black screens, overlays in video, poor quality


✅ RIGHT APPROACH:
- Record from getDisplayMedia() directly
- Delay overlay by 500ms
- Hide placeholder before recording
- Filter out own window
- Verify track state is 'live'
- Use preferCurrentTab: false

RESULT: Clean, professional recordings!

*/

console.log('📚 Wrong vs Right examples loaded');
