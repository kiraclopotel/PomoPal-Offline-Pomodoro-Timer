/*
 * Logic for the options page. This script retrieves existing settings and
 * statistics from the background service worker, allows the user to
 * customise durations and intervals, and persists changes back to
 * storage. It also provides the ability to clear accumulated statistics.
 */

const form = document.getElementById('settings-form');
const workDurationInput = document.getElementById('work-duration');
const shortBreakInput = document.getElementById('short-break-duration');
const longBreakInput = document.getElementById('long-break-duration');
const longBreakIntervalInput = document.getElementById('long-break-interval');
const themeSelect = document.getElementById('theme-select');
const resetDefaultsBtn = document.getElementById('reset-defaults');
const clearStatsBtn = document.getElementById('clear-stats');
const statsTodaySpan = document.getElementById('stats-today');
const statsWeekSpan = document.getElementById('stats-week');

// Default values matching those in service_worker.js
const DEFAULTS = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  theme: 'light'
};

/**
 * Send a command to the background service worker.
 *
 * @param {string} command Command identifier
 * @param {Object} [payload]
 * @returns {Promise<any>}
 */
function sendCommand(command, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ command, ...payload }, (response) => {
      resolve(response);
    });
  });
}

async function loadSettings() {
  const resp = await sendCommand('getSettings');
  const settings = resp.settings;
  workDurationInput.value = settings.workDuration;
  shortBreakInput.value = settings.shortBreakDuration;
  longBreakInput.value = settings.longBreakDuration;
  longBreakIntervalInput.value = settings.longBreakInterval;
  // Load theme preference
  themeSelect.value = settings.theme || 'light';
}

async function loadStats() {
  const summary = await sendCommand('getStats');
  statsTodaySpan.textContent = summary.today;
  statsWeekSpan.textContent = summary.week;
}

// Populate form inputs when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadStats();
});

// Save settings on form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newSettings = {
    workDuration: parseInt(workDurationInput.value, 10),
    shortBreakDuration: parseInt(shortBreakInput.value, 10),
    longBreakDuration: parseInt(longBreakInput.value, 10),
    longBreakInterval: parseInt(longBreakIntervalInput.value, 10),
    theme: themeSelect.value
  };
  await sendCommand('saveSettings', { settings: newSettings });
  // Provide user feedback
  alert('Settings saved successfully');
});

// Reset to default values
resetDefaultsBtn.addEventListener('click', async () => {
  workDurationInput.value = DEFAULTS.workDuration;
  shortBreakInput.value = DEFAULTS.shortBreakDuration;
  longBreakInput.value = DEFAULTS.longBreakDuration;
  longBreakIntervalInput.value = DEFAULTS.longBreakInterval;
  themeSelect.value = DEFAULTS.theme;
  await sendCommand('saveSettings', { settings: DEFAULTS });
  alert('Defaults restored');
});

// Clear statistics
clearStatsBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all statistics?')) {
    await sendCommand('clearStats');
    loadStats();
    alert('Statistics cleared');
  }
});