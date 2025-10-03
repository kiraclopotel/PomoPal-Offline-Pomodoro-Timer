# PomoPal – Offline Pomodoro Timer

PomoPal is a lightweight, privacy‑first Pomodoro timer implemented as a Chrome/Chromium extension. It replaces the now‑unavailable Marinara timer with a modern, customisable experience that never sends your data anywhere. All processing happens locally in your browser, so your productivity stats stay private.

## Features

* **Pomodoro cycles** – Default 25 minute work sessions, 5 minute short breaks and 15 minute long breaks every four cycles, with automatic transitions between phases.
* **Pause/Resume/Reset** – Pause and resume sessions at any time or reset the cycle to start over.
* **Progress bar and badge** – A subtle progress bar fills as time elapses and the toolbar badge shows minutes remaining or a ✓ when a session just completed.
* **Persistent statistics and streaks** – The extension tracks how many pomodoros you’ve completed today and this week and records your current streak of consecutive days with at least one session.
* **Customisable durations & themes** – Configure work/break durations, long break interval and choose between light and dark themes from the settings page.
* **Motivational notifications** – Session completion notifications include randomly selected motivational quotes to create a variable reward experience, a proven engagement technique【553471993785898†L154-L182】.
* **Share your progress** – Quickly copy a summary of your achievements to the clipboard to share on social media or with colleagues.
* **Privacy‑first** – All data lives in `chrome.storage.local`; there are no network requests or server dependencies.

## Installation

1. **Download** the extension source by copying the `pomodoro-extension` folder to your machine.
2. Open your Chromium‑based browser and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top right corner.
4. Click **“Load unpacked”** and select the `pomodoro-extension` folder. Alternatively, you can drag and drop the folder onto the extensions page.
5. The PomoPal icon (a tomato) should appear in your toolbar. Click it to open the popup and start using the timer.

> **Note:** Some managed environments block access to the extensions page. In that case you will not be able to install unpacked extensions.

## Usage

1. Click the tomato icon in your toolbar to open the popup.
2. Press **Start** to begin a work session. The badge will show the remaining minutes.
3. At the end of the work session a browser notification will appear and a break will begin automatically. After four work sessions the break will be a long break.
4. Use **Pause**, **Resume**, and **Reset** as needed. Resetting clears the current cycle and returns the timer to the idle state.
5. The popup displays how many pomodoros you’ve completed today and this week. You can reset statistics from the settings page.
6. To customise durations or the long break interval, click the **Settings** link in the popup or open the extension’s options page from `chrome://extensions`.

## Settings

On the options page you can configure:

- **Work duration** – Length of each focus session in minutes.
- **Short break duration** – Length of short breaks in minutes.
- **Long break duration** – Length of long breaks in minutes.
- **Long break interval** – Number of work sessions before a long break.
- **Theme** – Choose Light or Dark mode.

Press **Save** to apply changes. Press **Reset defaults** to restore the original settings (25/5/15 durations, interval of 4 and light theme).

You can also view your statistics on the options page and clear them with the **Clear statistics** button. All data is stored locally using `chrome.storage.local` and never leaves your device.

## Testing

1. Install the extension as described above.
2. Open the popup and press **Start**. Verify that the timer counts down from the configured work duration and that the badge reflects the remaining minutes.
3. At the end of the work session a desktop notification should appear and the phase should transition to a break automatically.
4. Try pausing, resuming and resetting the timer to ensure state transitions behave correctly.
5. Navigate to the options page via the settings link. Change the durations and interval, save your changes and start another session to confirm the new timings take effect.
6. Complete a few work sessions and verify that the “Completed Today” and “Completed This Week” counters increment accordingly in both the popup and options page.

## Privacy

This extension is designed with privacy in mind:

- **No external requests** – The code makes zero network calls. All logic runs entirely in your browser.
- **Local storage only** – Preferences and statistics are kept in `chrome.storage.local` on your machine. No data is synced or transmitted.
* **Minimal permissions** – Only `alarms`, `notifications` and `storage` permissions are requested. The extension does not require host permissions or network access.

## Contributing

Contributions are welcome! If you discover a bug or have a feature request, please open an issue or submit a pull request. For significant changes please discuss your ideas first.
