/*
 * Front‑end logic for the popup UI. This script queries the current timer
 * state from the background service worker, updates the display in real
 * time and sends commands back to the background when the user interacts
 * with the controls. It also fetches simple statistics to show how many
 * pomodoros have been completed today and this week.
 */

// Cached references to DOM elements
const timerDisplay = document.getElementById('timer-display');
const phaseLabel = document.getElementById('phase');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const resetBtn = document.getElementById('reset-btn');
const statsTodaySpan = document.getElementById('stats-today');
const statsWeekSpan = document.getElementById('stats-week');
const settingsLink = document.getElementById('settings-link');

// Additional elements for enhancements
const statsStreakSpan = document.getElementById('stats-streak');
const progressFill = document.getElementById('progress-fill');
const shareBtn = document.getElementById('share-btn');

// Store current settings for theme handling
let currentSettings = null;

let currentState = null;
let timerInterval = null;

/**
 * Format a number of milliseconds into a MM:SS string. Values are
 * zero‑padded to two digits. If ms is negative the result will be
 * '00:00'.
 *
 * @param {number} ms Milliseconds remaining
 * @returns {string}
 */
function formatTime(ms) {
  const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Update the timer display each second while the timer is running or
 * paused. Clears any existing interval first. If the timer is idle
 * displays '--:--'.
 */
function startUpdatingTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = setInterval(() => {
    if (!currentState || currentState.phase === 'idle') {
      timerDisplay.textContent = '--:--';
      if (progressFill) progressFill.style.width = '0%';
      return;
    }
    let msLeft;
    if (currentState.running) {
      msLeft = currentState.endTime - Date.now();
    } else if (currentState.remainingTime != null) {
      msLeft = currentState.remainingTime;
    } else {
      msLeft = 0;
    }
    timerDisplay.textContent = formatTime(msLeft);
    // Update progress bar every second
    if (progressFill) {
      const duration = (currentState.endTime - currentState.startTime) || currentState.remainingTime || 1;
      const elapsed = duration - Math.max(msLeft, 0);
      const percent = Math.min(Math.max(elapsed / duration, 0), 1) * 100;
      progressFill.style.width = `${percent}%`;
    }
  }, 1000);
}

/**
 * Refresh the UI elements based on the current state. Shows/hides
 * appropriate buttons and labels. Also updates the time immediately.
 */
function updateUI() {
  if (!currentState) return;
  // Update phase text
  const phaseMap = {
    idle: 'Idle',
    work: 'Work',
    short_break: 'Break',
    long_break: 'Long Break'
  };
  phaseLabel.textContent = phaseMap[currentState.phase] || 'Idle';
  // Update buttons visibility
  if (currentState.phase === 'idle') {
    startBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.add('hidden');
    resetBtn.classList.add('hidden');
  } else if (currentState.running) {
    startBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    resumeBtn.classList.add('hidden');
    resetBtn.classList.remove('hidden');
  } else {
    // paused
    startBtn.classList.add('hidden');
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.remove('hidden');
    resetBtn.classList.remove('hidden');
  }
  // Update timer immediately
  if (currentState.phase === 'idle') {
    timerDisplay.textContent = '--:--';
    if (progressFill) progressFill.style.width = '0%';
  } else {
    let msLeft;
    if (currentState.running) {
      msLeft = currentState.endTime - Date.now();
    } else if (currentState.remainingTime != null) {
      msLeft = currentState.remainingTime;
    } else {
      msLeft = 0;
    }
    timerDisplay.textContent = formatTime(msLeft);
    if (progressFill) {
      const duration = (currentState.endTime - currentState.startTime) || currentState.remainingTime || 1;
      const elapsed = duration - Math.max(msLeft, 0);
      const percent = Math.min(Math.max(elapsed / duration, 0), 1) * 100;
      progressFill.style.width = `${percent}%`;
    }
  }
}

/**
 * Send a command message to the background service worker.
 *
 * @param {string} command The command identifier
 * @param {Object} [payload] Optional additional data
 * @returns {Promise<any>}
 */
function sendCommand(command, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ command, ...payload }, (response) => {
      resolve(response);
    });
  });
}

/**
 * Fetch the current state from the background and refresh the UI. Also
 * start the periodic timer update loop.
 */
async function refreshStateAndUI() {
  const resp = await sendCommand('getState');
  currentState = resp.state;
  updateUI();
  startUpdatingTimer();
  // Fetch stats separately
  const stats = await sendCommand('getStats');
  statsTodaySpan.textContent = stats.today;
  statsWeekSpan.textContent = stats.week;
  if (statsStreakSpan) {
    statsStreakSpan.textContent = stats.streak;
  }
  // Fetch settings for theme
  const settingsResp = await sendCommand('getSettings');
  currentSettings = settingsResp.settings;
  const theme = currentSettings.theme || 'light';
  document.body.setAttribute('data-theme', theme);
}

// Event listeners for buttons
startBtn.addEventListener('click', async () => {
  await sendCommand('start');
  await refreshStateAndUI();
});

pauseBtn.addEventListener('click', async () => {
  await sendCommand('pause');
  await refreshStateAndUI();
});

resumeBtn.addEventListener('click', async () => {
  await sendCommand('resume');
  await refreshStateAndUI();
});

resetBtn.addEventListener('click', async () => {
  await sendCommand('reset');
  await refreshStateAndUI();
});

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Share progress button copies a summary to the clipboard
if (shareBtn) {
  shareBtn.addEventListener('click', async () => {
    const stats = await sendCommand('getStats');
    const text = `I'm using PomoPal and completed ${stats.today} pomodoros today and ${stats.week} this week!`;
    try {
      await navigator.clipboard.writeText(text);
      alert('Progress copied to clipboard! Share it with your friends.');
    } catch (err) {
      alert('Unable to copy to clipboard: ' + err);
    }
  });
}

// Listen for updates from the background to keep the UI in sync
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'statusUpdate') {
    currentState = message.state;
    updateUI();
  }
});

// Initialise on load
document.addEventListener('DOMContentLoaded', () => {
  refreshStateAndUI();
});