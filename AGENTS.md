\# 🤖 AGENTS.md – DAT Tools Chrome Extension



This document describes the structure, behavior, and development instructions for Codex and GitHub Copilot to contribute to the DAT Tools Chrome Extension effectively.



---



\## 📦 Overview



\*\*DAT Tools\*\* is a Manifest V3 Chrome Extension designed to:



\- Automatically refresh DAT load board posts every \*\*15 minutes and 30 seconds\*\*

\- Maintain session activity and post visibility

\- Provide a user-facing popup for start/stop control and dark mode toggle

\- (In development) Copy a coworker's visible load board posts into your own



---



\## 🧠 Agent Roles \& File Responsibilities



| File            | Role                    | Description                                                                 |

|-----------------|-------------------------|-----------------------------------------------------------------------------|

| `background.js` | Service Worker Agent     | Manages refresh alarms, global state, messaging, and notifications         |

| `content.js`    | Page DOM Agent           | Executes refresh logic and (optionally) copy routine via shadow DOM access |

| `popup.js`      | UI Logic Controller      | Handles user toggle actions, countdown timer, dark mode                    |

| `popup.html`    | UI Layout                | Structured HTML popup interface                                            |

| `popup.css`     | UI Styling               | Light/dark theming, responsive formatting                                  |

| `manifest.json` | Extension Manifest       | Declares permissions, background, content script, popup config             |



---



\## 🔁 Message Protocols \& Flow



\*\*All agent interactions rely on message-passing using `chrome.runtime.sendMessage()` and `chrome.tabs.sendMessage()`\*\*



\### Popup → Background

| Action            | Description                         |

|-------------------|-------------------------------------|

| `"start"`         | Begins 15:30 refresh cycle          |

| `"stop"`          | Ends refresh and resets state       |

| `"getStatus"`     | Restores current state on popup open|



\### Background → Content

| Action            | Description                         |

|-------------------|-------------------------------------|

| `"refreshNow"`    | Triggers page-level refresh script  |



\### Content → Background

| Response Status   | Description                         |

|-------------------|-------------------------------------|

| `"refreshed"`     | Refresh success                     |

| `"error"`         | Refresh failed (with error message) |



\### Background → Popup

| Action            | Description                         |

|-------------------|-------------------------------------|

| `"updateCount"`   | Pushes new refresh count to popup   |



---



\## ⏱ Refresh Logic – 15:30 Interval



\### Triggering

\- When `popup.js` sends `"start"` to background:

&nbsp; - `background.js` creates a Chrome alarm:

&nbsp;   ```js

&nbsp;   chrome.alarms.create("datRefreshAlarm", {

&nbsp;     periodInMinutes: 15 + (30 / 60)

&nbsp;   });

&nbsp;   ```

&nbsp; - Also sets `nextRefresh = now + 15min30sec`



\### Execution

\- When alarm fires:

&nbsp; - Background sends `"refreshNow"` to all tabs matching `https://one.dat.com/\*`

&nbsp; - Content script performs refresh routine via UI clicks and waits

&nbsp; - Response is returned (`"refreshed"` or `"error"`)

&nbsp; - Notification created with refresh count

&nbsp; - State updated (`nextRefresh`, `count++`), pushed to popup if open



---



\## 📋 DOM Agent – `content.js` Behavior



\### Refresh Flow

1\. Wait for `cg-grid` and its shadow DOM

2\. Click the select-all checkbox

3\. Wait for `cg-grid-bulk-actions` to render

4\. Find and click the \*\*Refresh\*\* button

5\. Wait until checkbox unchecks (indicates refresh completed)

6\. If checkbox fails to clear, retry refresh once



\### Key APIs

\- `waitForElement(selector, root)`

\- `waitForCheckboxToBeUnchecked(selector)`

\- `clickElement(el)`

\- `waitForElementEnabled(el)`



\### Copy Posts (WIP)

\- Target owner is determined from first row

\- Loops rows, matches owner, copies via menu interaction

\- Posts copied via UI click events (not yet exposed in popup)



---



\## 🎨 UI Logic – `popup.js` Behavior



\### On Load

\- Sends `"getStatus"` to background

\- Restores:

&nbsp; - Toggle state

&nbsp; - Countdown to `nextRefresh`

&nbsp; - Dark mode preference



\### On Toggle

\- `"start"` → Begins refresh + timer

\- `"stop"` → Ends timer, resets UI

\- `countDisplay` and `timerDisplay` updated live



\### On Message

\- `"updateCount"` → Refresh count live-updated in popup



\### UI Extras

\- “Copy” button shows alert only — not wired to function yet



---



\## 🧑‍💻 Coding Conventions



\- \*\*Use modern ES6+\*\* syntax and modules

\- \*\*Use arrow functions\*\* unless `this` context is required

\- \*\*Use double quotes\*\* for strings

\- \*\*Shadow DOM\*\*: Always check `.shadowRoot` before querying nested elements

\- Prefer `async/await` with `try/catch`

\- All messages should follow `{ action: string }` format

\- Use `chrome.storage.local` for shared state

\- Don't mutate shared variables across scopes — always re-get if needed



---



\## 🧪 Testing \& Validation



\### Manual QA

1\. Load extension via `chrome://extensions` → “Load unpacked”

2\. Go to `https://one.dat.com/my-shipments`

3\. Open popup → click \*\*Start\*\*

4\. Watch for:

&nbsp;  - Checkbox being selected

&nbsp;  - Refresh button being clicked

&nbsp;  - Posts being refreshed

&nbsp;  - Popup count updating

&nbsp;  - Timer displaying accurate countdown



\### Debugging Tips

\- Use DevTools in the popup (click "Inspect popup" in extensions page)

\- Use DevTools console on DAT tab to view content script logs

\- Check `chrome://serviceworker-internals` to view background script status



---



\## ⚠️ Design Constraints



\- Refresh cannot occur more often than every \*\*15 minutes and 30 seconds\*\*

\- `DAT` tab must remain on `My Shipments` for refresh to succeed

\- Refresh assumes current DOM structure — fragile to DAT UI updates

\- Popup does \*\*not\*\* persist across browser restarts (must be toggled again)



---



\## 🚧 Roadmap / Coming Soon



\- Enable Copy Coworker Posts from popup



---



\## ✅ Summary for Codex



You are working on a Chrome Extension that:

\- Runs in the context of the DAT load board

\- Refreshes via DOM interaction

\- Communicates between background, content, and popup scripts

\- Uses Chrome’s `alarms`, `storage`, and `notifications` APIs

\- Requires reliability in shadow DOM traversal

\- Maintains countdown via popup timer synced to background `nextRefresh`



Use these behaviors and patterns when generating new logic or features.





