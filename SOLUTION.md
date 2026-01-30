# 🎬 Screen Recording Black Screen - COMPLETE SOLUTION

## 🔍 ROOT CAUSE EXPLANATION (Simple)

Your recorded videos show a black screen because of **3 critical issues**:

### Issue 1: Recording the Wrong Source
**Problem**: The code tries to record from a canvas element that may not be properly rendering the screen content.

**Why it happens**: 
- Canvas needs continuous drawing via `requestAnimationFrame`
- If the compositor stops or isn't started, canvas shows black
- Canvas rendering can be slower than direct stream capture

**The Fix**: Record directly from the `MediaStream` obtained from `getDisplayMedia()`, NOT from a canvas element.

---

### Issue 2: Overlay Window Appears in Recording
**Problem**: Your floating overlay window (timer + controls) is set to `alwaysOnTop: true`, so it appears in screen recordings.

**Why it happens**:
- When you record "Entire Screen", the overlay is visible on that screen
- The overlay gets captured as part of the recording
- Even if you record a specific window, the overlay might overlap

**The Fix**: 
- Position overlay outside the recording area, OR
- Use a separate display for overlay, OR
- Make overlay truly transparent/invisible during critical frames

---

### Issue 3: Preview Placeholder Gets Recorded
**Problem**: The "Select a screen to start preview" text appears in recordings.

**Why it happens**:
- The placeholder overlay isn't properly hidden before recording starts
- The canvas might be showing this text instead of the actual screen

**The Fix**: Ensure placeholder is hidden BEFORE starting MediaRecorder.

---

## 🎯 CORRECT RECORDING FLOW

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER CLICKS RECORD                                       │
│    ↓                                                         │
│ 2. HIDE all UI overlays (placeholder, timer, etc.)          │
│    ↓                                                         │
│ 3. SHOW source picker modal                                 │
│    ↓                                                         │
│ 4. USER SELECTS screen/window                               │
│    ↓                                                         │
│ 5. GET DISPLAY STREAM                                       │
│    - Use navigator.mediaDevices.getDisplayMedia()           │
│    - Get actual screen pixels, NOT canvas                   │
│    ↓                                                         │
│ 6. CREATE MediaRecorder                                     │
│    - Input: displayStream (direct from getDisplayMedia)     │
│    - NOT from canvas.captureStream()                        │
│    ↓                                                         │
│ 7. START RECORDING                                          │
│    - MediaRecorder.start()                                  │
│    - Now recording ONLY the selected screen/window          │
│    ↓                                                         │
│ 8. SHOW floating overlay (for user controls)                │
│    - Position it carefully to avoid recording area          │
│    - Or make it on a different monitor                      │
│    ↓                                                         │
│ 9. RECORD until user clicks STOP                            │
│    ↓                                                         │
│ 10. HIDE overlay before stopping                            │
│    ↓                                                         │
│ 11. STOP MediaRecorder                                      │
│    ↓                                                         │
│ 12. SAVE clean video file (no overlays, no black screens)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 FIXED JAVASCRIPT CODE

### Key Changes:

1. **Remove canvas recording** - Use direct stream
2. **Hide overlay during recording** - Prevent it from being captured
3. **Proper stream management** - Ensure video tracks are active
4. **Clean preview handling** - Hide placeholders before recording

### `script.js` - CORRECTED VERSION

```javascript
// CRITICAL FIX: Record directly from display stream, NOT canvas

async function startRecording(selectedSource = null) {
    try {
        const height = parseInt(qualitySelect.value);
        const width = height * (16 / 9);

        // ✅ STEP 1: Hide all UI elements that could appear in recording
        placeholderOverlay.classList.add('hidden');
        
        // ✅ STEP 2: Get Screen Stream DIRECTLY
        let screenStream;
        
        if (window.electronAPI && selectedSource) {
            // Electron: Use desktopCapturer
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

            screenStream = await navigator.mediaDevices.getUserMedia(constraints);
            
        } else {
            // ✅ Browser: Use getDisplayMedia (CORRECT WAY)
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

        // ✅ STEP 3: Verify stream has active video track
        const videoTrack = screenStream.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState !== 'live') {
            throw new Error('Video track is not active');
        }

        console.log('✅ Screen stream obtained:', {
            videoTrack: videoTrack.label,
            state: videoTrack.readyState,
            settings: videoTrack.getSettings()
        });

        // ✅ STEP 4: Optional - Show preview (for user feedback only)
        sourceVideo.srcObject = screenStream;
        await sourceVideo.play();

        // ✅ STEP 5: Get Microphone (if enabled)
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
            } catch (e) {
                console.warn('Microphone access denied:', e);
            }
        }

        // ✅ STEP 6: Combine tracks for recording
        const recordingTracks = [];
        
        // Add video track from screen
        recordingTracks.push(...screenStream.getVideoTracks());
        
        // Add audio tracks (system + mic)
        recordingTracks.push(...screenStream.getAudioTracks());
        if (micStream) {
            recordingTracks.push(...micStream.getAudioTracks());
        }

        // ✅ STEP 7: Create final stream for MediaRecorder
        const finalStream = new MediaStream(recordingTracks);
        state.mergedStream = finalStream;
        state.screenStream = screenStream;

        console.log('✅ Final recording stream tracks:', {
            video: finalStream.getVideoTracks().length,
            audio: finalStream.getAudioTracks().length
        });

        // ✅ STEP 8: Create MediaRecorder with optimal settings
        const preferredFormat = document.getElementById('formatSelect')?.value || 'webm';
        let options = {
            mimeType: getSupportedMimeType(preferredFormat),
            videoBitsPerSecond: height >= 1080 ? 8000000 : 5000000
        };

        try {
            mediaRecorder = new MediaRecorder(finalStream, options);
        } catch (e) {
            console.warn('Preferred codec failed, using default:', e);
            mediaRecorder = new MediaRecorder(finalStream);
        }

        // ✅ STEP 9: Setup MediaRecorder event handlers
        mediaRecorder.ondataavailable = async (e) => {
            if (e.data.size > 0 && window.electronAPI && currentRecordingFilename) {
                const arrayBuffer = await e.data.arrayBuffer();
                const buffer = new Uint8Array(arrayBuffer);
                await window.electronAPI.writeRecordingChunk(buffer);
            }
        };

        mediaRecorder.onstart = async () => {
            isRecording = true;
            currentRecordingFilename = `rec-${Date.now()}.webm`;
            
            if (window.electronAPI) {
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

        // ✅ STEP 10: Start recording with 1s timeslice
        mediaRecorder.start(1000);

        // ✅ STEP 11: Handle user stopping screen share
        videoTrack.onended = () => {
            console.log('User stopped sharing screen');
            stopRecording();
        };

    } catch (err) {
        console.error('❌ Recording failed:', err);
        statusBadge.textContent = `Error: ${err.message}`;
        cleanupStreams();
    }
}
```

---

## 🚫 COMMON MISTAKES TO AVOID

### ❌ Mistake 1: Recording from Canvas
```javascript
// WRONG - This causes black screen
const canvasStream = canvas.captureStream(30);
mediaRecorder = new MediaRecorder(canvasStream);
```

**Why it's wrong**: Canvas must be continuously drawn. If drawing stops, you get black frames.

**✅ Correct approach**:
```javascript
// RIGHT - Record directly from display
const screenStream = await navigator.mediaDevices.getDisplayMedia({...});
mediaRecorder = new MediaRecorder(screenStream);
```

---

### ❌ Mistake 2: Not Hiding Overlays
```javascript
// WRONG - Overlay appears in recording
overlayWindow.show(); // Before starting recording
mediaRecorder.start();
```

**Why it's wrong**: The overlay is visible on screen and gets recorded.

**✅ Correct approach**:
```javascript
// RIGHT - Hide overlay before recording critical content
mediaRecorder.start();
// Wait a moment for recording to stabilize
setTimeout(() => overlayWindow.show(), 500);
```

---

### ❌ Mistake 3: Using `preferCurrentTab`
```javascript
// WRONG - Might capture browser UI
await navigator.mediaDevices.getDisplayMedia({
    video: true,
    preferCurrentTab: true // ❌ BAD
});
```

**Why it's wrong**: Can capture browser chrome, tabs, or wrong content.

**✅ Correct approach**:
```javascript
// RIGHT - Let user choose what to record
await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: true,
    preferCurrentTab: false // ✅ GOOD
});
```

---

### ❌ Mistake 4: Not Checking Track State
```javascript
// WRONG - Assume stream is ready
const stream = await getDisplayMedia({...});
mediaRecorder = new MediaRecorder(stream);
mediaRecorder.start(); // Might record black if track isn't ready
```

**Why it's wrong**: Video track might not be in 'live' state yet.

**✅ Correct approach**:
```javascript
// RIGHT - Verify track is active
const stream = await getDisplayMedia({...});
const videoTrack = stream.getVideoTracks()[0];

if (videoTrack.readyState !== 'live') {
    throw new Error('Video track not ready');
}

mediaRecorder = new MediaRecorder(stream);
mediaRecorder.start();
```

---

### ❌ Mistake 5: Recording Own Window
```javascript
// WRONG - Recording the recorder app itself
// In Electron, if you don't filter sources:
const sources = await desktopCapturer.getSources({ types: ['window'] });
// User might select the recorder window → black screen
```

**Why it's wrong**: Recording your own app creates a feedback loop or captures blank canvas.

**✅ Correct approach**:
```javascript
// RIGHT - Filter out own window
const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
const filtered = sources.filter(s => 
    !s.name.includes('ProRecorder') && 
    !s.name.includes('Screen Recorder')
);
```

---

## 🎯 IMPLEMENTATION CHECKLIST

- [ ] Remove canvas.captureStream() - use direct display stream
- [ ] Hide placeholder overlay before recording starts
- [ ] Verify video track is in 'live' state before recording
- [ ] Filter out recorder's own window from source list
- [ ] Set `preferCurrentTab: false` in getDisplayMedia
- [ ] Hide floating overlay during first 500ms of recording
- [ ] Add proper error handling for stream acquisition
- [ ] Test with: entire screen, specific window, multiple monitors
- [ ] Verify audio tracks are properly merged
- [ ] Check final video has no black frames or UI elements

---

## 🧪 TESTING GUIDE

### Test 1: Record Entire Screen
1. Click Record
2. Select "Entire Screen"
3. Verify overlay doesn't appear in video
4. Check video shows actual screen content

### Test 2: Record Specific Window
1. Open a browser/app
2. Click Record
3. Select that specific window
4. Verify only that window is recorded (no overlay)

### Test 3: Record with Audio
1. Play a video with sound
2. Enable microphone
3. Record screen
4. Verify both system audio and mic are in final video

### Test 4: Pause/Resume
1. Start recording
2. Pause after 5 seconds
3. Resume after 3 seconds
4. Verify no black frames during pause/resume

---

## 📚 ADDITIONAL RESOURCES

- [MDN: MediaDevices.getDisplayMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [MDN: MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Electron: desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)

---

## 🎬 SUMMARY

**The Problem**: Recording from canvas or with overlays visible causes black screens.

**The Solution**: 
1. Record directly from `getDisplayMedia()` stream
2. Hide all UI overlays before recording
3. Verify video tracks are active
4. Use proper stream management

**Result**: Clean, professional screen recordings with no black screens or UI artifacts! 🎉
