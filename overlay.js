const { ipcRenderer } = require('electron');

const timerEl = document.getElementById('timer');
const statusInd = document.getElementById('statusIndicator');
const recordBtn = document.getElementById('recordBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const shotBtn = document.getElementById('shotBtn');
const micBtn = document.getElementById('micBtn');

const toast = document.getElementById('toast');
let lastMicState = null;

ipcRenderer.on('update-timer', (event, data) => { // Use 'data' object directly
    timerEl.textContent = data.time;
    const state = data.state;

    // Update indicator and buttons based on state
    if (state === 'recording') {
        statusInd.className = 'indicator'; // active/recording
        recordBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        resumeBtn.classList.add('hidden');
    } else if (state === 'paused') {
        statusInd.className = 'indicator paused';
        recordBtn.classList.add('hidden');
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.remove('hidden');
    } else if (state === 'idle') {
        statusInd.className = 'indicator'; // idle state
        recordBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.add('hidden');
    }

    // Update Mic State
    if (data.micActive !== undefined) {
        const isActive = data.micActive;

        // Check for state change to trigger feedback
        if (lastMicState !== null && lastMicState !== isActive) {
            showToast(isActive ? "Microphone ON" : "Microphone MUTED");
        }
        lastMicState = isActive;

        if (isActive) {
            micBtn.classList.add('active');
            micBtn.classList.remove('muted');
            micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        } else {
            micBtn.classList.remove('active');
            micBtn.classList.add('muted');
            micBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        }
    }
});

function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');

    // Auto hide
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

shotBtn.addEventListener('click', () => ipcRenderer.send('overlay-screenshot'));
pauseBtn.addEventListener('click', () => ipcRenderer.send('overlay-pause'));
resumeBtn.addEventListener('click', () => ipcRenderer.send('overlay-resume'));
stopBtn.addEventListener('click', () => ipcRenderer.send('overlay-stop'));

if (recordBtn) {
    recordBtn.addEventListener('click', () => ipcRenderer.send('overlay-record'));
}

if (micBtn) {
    micBtn.addEventListener('click', () => ipcRenderer.send('overlay-toggle-mic'));
}
