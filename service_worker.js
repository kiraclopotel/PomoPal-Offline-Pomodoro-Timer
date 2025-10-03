/*
 * Background service worker for the Pomodoro extension.
 *
 * This file contains all of the long‑running logic for the timer. It keeps
 * track of the current phase (work or break), manages alarms to fire at
 * appropriate times, persists preferences and statistics in
 * chrome.storage.local and communicates with the popup and options pages via
 * messaging.  All processing is done locally within the browser – there are
 * no external network calls.
 */

// Default durations (in minutes) for each Pomodoro phase. These values are
// merged with any user defined settings from storage on demand.
const DEFAULT_SETTINGS = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  // UI theme preference. Accepts 'light' or 'dark'. Defaults to light.
  theme: 'light'
};

// A collection of motivational quotes used to add variety to notifications.
// Randomly selected when a session completes to provide a variable reward
// experience. Citations: research shows unpredictable rewards increase
// engagement and motivation【553471993785898†L154-L182】.
const MOTIVATIONAL_QUOTES = [
  'Great job! Keep the momentum going.',
  'Stay focused; you are doing amazing work.',
  'Every session counts towards your goals.',
  'Small steps lead to big achievements.',
  'You’re building discipline one pomodoro at a time.',
  'Another win in the books! Keep it up.',
  'Success is the sum of small efforts repeated daily.',
  'Focus on progress, not perfection.',
  'Your future self will thank you for this work.',
  'One step closer to mastering your craft.'
];

// Internal state representation. This object is kept in memory while the
// service worker is alive. When the worker is suspended (which may happen
// between events) state will be reconstructed on the next event from the
// persisted copies in chrome.storage if necessary. We deliberately keep
// everything simple and serialisable.
let state = {
  phase: 'idle',        // 'idle', 'work', 'short_break', 'long_break'
  running: false,       // whether a timer is currently counting down
  startTime: null,      // epoch ms when the current phase started
  endTime: null,        // epoch ms when the current phase will end
  remainingTime: null,  // ms remaining when paused
  cycleCount: 0         // number of completed work phases since last long break
};

/**
 * Read the user settings from chrome.storage.local and merge with defaults.
 *
 * @returns {Promise<Object>} Resolved settings object
 */
async function getSettings() {
  const result = await chrome.storage.local.get(['settings']);
  return Object.assign({}, DEFAULT_SETTINGS, result.settings || {});
}

/**
 * Persist new settings to chrome.storage.local. Only the provided keys are
 * overwritten; others are preserved.
 *
 * @param {Object} newSettings Partial settings object
 */
async function saveSettings(newSettings) {
  const result = await chrome.storage.local.get(['settings']);
  const settings = Object.assign({}, result.settings || {}, newSettings);
  await chrome.storage.local.set({ settings });
}

/**
 * Retrieve the statistics map from storage. The map keys are ISO date
 * strings (YYYY‑MM‑DD) and the values are integers representing the number
 * of completed work sessions on that date. If no stats are stored yet
 * returns an empty object.
 *
 * @returns {Promise<Object>}
 */
async function getStats() {
  const result = await chrome.storage.local.get(['stats']);
  return result.stats || {};
}

/**
 * Increment the completed work session count for the provided date. This is
 * called whenever a work phase completes. Dates are stored as simple
 * strings using the local timezone in ISO format (YYYY‑MM‑DD).
 *
 * @param {string} dateKey ISO date string
 */
async function incrementStat(dateKey) {
  const stats = await getStats();
  stats[dateKey] = (stats[dateKey] || 0) + 1;
  await chrome.storage.local.set({ stats });
  // Update streak count when a work session completes. A streak is
  // incremented if there was at least one pomodoro on the previous day,
  // otherwise it resets to 1. We store the streak and last date in storage.
  const streakData = await chrome.storage.local.get(['streak', 'lastStreakDate']);
  const lastDate = streakData.lastStreakDate;
  let streak = streakData.streak || 0;
  if (lastDate) {
    const yesterday = new Date(dateKey);
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().split('T')[0];
    if (lastDate === yKey) {
      streak += 1;
    } else if (lastDate !== dateKey) {
      // If it's not the same day and not yesterday, reset streak
      streak = 1;
    }
  } else {
    streak = 1;
  }
  await chrome.storage.local.set({ streak, lastStreakDate: dateKey });
}

/**
 * Clear all stored statistics. Useful for resetting weekly/daily counts.
 */
async function clearStats() {
  await chrome.storage.local.remove('stats');
  await chrome.storage.local.remove('streak');
  await chrome.storage.local.remove('lastStreakDate');
}

/**
 * Compute the number of completed pomodoros today and in the last 7 days.
 *
 * @returns {Promise<{today: number, week: number}>}
 */
async function computeStatsSummary() {
  const stats = await getStats();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  let todayCount = stats[isoToday] || 0;
  // Compute past 7 days including today
  let weekCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    weekCount += stats[key] || 0;
  }
  // Load the current streak from storage
  const streakData = await chrome.storage.local.get(['streak']);
  const streak = streakData.streak || 0;
  return { today: todayCount, week: weekCount, streak };
}

/**
 * Update the browser action badge to reflect the current timer status. We
 * display the number of minutes remaining (rounded up) while running or
 * paused and show a check mark when a phase completes. When idle the
 * badge is cleared. Badge text is limited to 4 characters.
 */
function updateBadge() {
  if (state.phase === 'idle') {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  if (!state.running && state.remainingTime == null) {
    // just completed a phase; show check mark briefly
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    return;
  }
  // Compute remaining minutes based on either endTime or remainingTime
  let msLeft;
  if (state.running) {
    msLeft = Math.max(state.endTime - Date.now(), 0);
  } else {
    msLeft = state.remainingTime;
  }
  const minutes = Math.ceil(msLeft / 60000);
  chrome.action.setBadgeText({ text: String(minutes) });
  // Change colour based on phase
  const color = state.phase === 'work' ? '#E53935' : '#43A047';
  chrome.action.setBadgeBackgroundColor({ color });
}

/**
 * Send a status update to all connected views (e.g. popup) so that they
 * refresh their UI when the internal state changes. Listeners can act on
 * the `type` property to filter messages.
 */
function broadcastStatus() {
  chrome.runtime.sendMessage({ type: 'statusUpdate', state });
}

/**
 * Schedule the alarms necessary for the current phase. The end alarm will
 * fire when the phase completes and the badge alarm will fire every
 * minute to refresh the badge text. Any existing alarms are cleared
 * beforehand.
 */
function scheduleAlarms() {
  chrome.alarms.clearAll(() => {
    if (!state.running) return;
    // One‑shot alarm for the end of the current phase
    chrome.alarms.create('timerEnd', { when: state.endTime });
    // Repeating alarm every minute to update the badge
    chrome.alarms.create('updateBadge', { when: Date.now() + 1000, periodInMinutes: 1 });
  });
}

/**
 * Begin a new phase based on the current state and user settings. When
 * initiating a work phase we use the configured workDuration. When
 * starting a break phase we increment the cycle count and decide between
 * short and long breaks based on the longBreakInterval setting.
 */
async function startNextPhase() {
  const settings = await getSettings();
  let durationMinutes;
  if (state.phase === 'idle' || state.phase === 'short_break' || state.phase === 'long_break') {
    // Start a work session
    state.phase = 'work';
    durationMinutes = settings.workDuration;
  } else if (state.phase === 'work') {
    // Work just finished; update stats and decide which break to take next
    state.cycleCount = (state.cycleCount || 0) + 1;
    if (state.cycleCount % settings.longBreakInterval === 0) {
      state.phase = 'long_break';
      durationMinutes = settings.longBreakDuration;
    } else {
      state.phase = 'short_break';
      durationMinutes = settings.shortBreakDuration;
    }
  } else {
    // Unexpected state; reset to idle
    resetTimer();
    return;
  }
  // Start the timer
  state.running = true;
  state.startTime = Date.now();
  state.endTime = state.startTime + durationMinutes * 60 * 1000;
  state.remainingTime = null;
  scheduleAlarms();
  updateBadge();
  broadcastStatus();
}

/**
 * Pause the current timer. The end and update alarms are cleared and the
 * remaining time is captured so that the timer can be resumed later. If
 * the timer is already paused or idle this has no effect.
 */
function pauseTimer() {
  if (!state.running) return;
  const now = Date.now();
  state.running = false;
  state.remainingTime = Math.max(state.endTime - now, 0);
  chrome.alarms.clearAll();
  updateBadge();
  broadcastStatus();
}

/**
 * Resume a previously paused timer. Remaining time is used to compute the
 * new end timestamp. Alarms are scheduled as normal. If the timer isn't
 * paused this does nothing.
 */
function resumeTimer() {
  if (state.running || state.remainingTime == null) return;
  state.running = true;
  state.startTime = Date.now();
  state.endTime = state.startTime + state.remainingTime;
  state.remainingTime = null;
  scheduleAlarms();
  updateBadge();
  broadcastStatus();
}

/**
 * Reset the timer to the idle state. All alarms are cleared and the
 * internal state is returned to its defaults. Cycle count is reset so
 * long breaks will be recalculated from scratch.
 */
function resetTimer() {
  state = {
    phase: 'idle',
    running: false,
    startTime: null,
    endTime: null,
    remainingTime: null,
    cycleCount: 0
  };
  chrome.alarms.clearAll();
  updateBadge();
  broadcastStatus();
}

/**
 * Display a notification when a phase completes. Notifications inform the
 * user that it's time to start the next phase. Because this extension
 * doesn't request sound files we rely on the browser's default sound.
 *
 * @param {string} title Notification title
 * @param {string} message Body text
 */
function showNotification(title, message) {
  // Choose a random quote 50% of the time to create a variable reward
  // pattern. Research suggests unpredictable rewards keep users engaged【553471993785898†L154-L182】.
  let fullMessage = message;
  if (Math.random() < 0.5) {
    const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    fullMessage = `${message}\n\n${quote}`;
  }
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message: fullMessage,
    priority: 2
  });
}

// Alarm listener for handling timer completions and badge updates
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'timerEnd') {
    // Timer completed: update stats if finishing a work phase
    if (state.phase === 'work') {
      const dateKey = new Date().toISOString().split('T')[0];
      await incrementStat(dateKey);
    }
    state.running = false;
    state.remainingTime = null;
    updateBadge();
    broadcastStatus();
    // Choose next phase automatically
    const nextPhase = (state.phase === 'work') ? 'break' : 'work';
    // Show a notification to the user
    if (state.phase === 'work') {
      showNotification('Pomodoro complete!', 'Time for a break');
    } else {
      showNotification('Break over!', 'Back to work');
    }
    // Start the next phase after a brief delay to allow UI updates
    setTimeout(() => { startNextPhase(); }, 500);
  } else if (alarm.name === 'updateBadge') {
    updateBadge();
    // keep the alarm; it will fire again automatically due to periodInMinutes
  }
});

// Message listener for popup and options interactions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Commands can be handled synchronously or asynchronously. When a
  // promise is involved we return true so that the response can be sent
  // asynchronously.
  if (!message || !message.command) {
    return false;
  }
  switch (message.command) {
    case 'getState': {
      sendResponse({ state });
      return true;
    }
    case 'start': {
      startNextPhase();
      sendResponse({ state });
      return true;
    }
    case 'pause': {
      pauseTimer();
      sendResponse({ state });
      return true;
    }
    case 'resume': {
      resumeTimer();
      sendResponse({ state });
      return true;
    }
    case 'reset': {
      resetTimer();
      sendResponse({ state });
      return true;
    }
    case 'getSettings': {
      getSettings().then((settings) => sendResponse({ settings }));
      return true;
    }
    case 'saveSettings': {
      saveSettings(message.settings).then(() => sendResponse({ success: true }));
      return true;
    }
    case 'getStats': {
      computeStatsSummary().then((summary) => sendResponse(summary));
      return true;
    }
    case 'clearStats': {
      clearStats().then(() => sendResponse({ success: true }));
      return true;
    }
    default:
      return false;
  }
});

// On installation reset the badge background color so it's visible on all themes
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
});