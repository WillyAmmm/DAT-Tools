let isRunning = false;
let isDelayed = false;
let count = 0;
let nextRefresh = null;
let refreshInterval = 15;

// Restore any previously stored state when the service worker starts
chrome.storage.local.get(
  ["isRunning", "count", "nextRefresh", "refreshInterval", "isDelayed"],
  (res) => {
    isRunning = res.isRunning || false;
    count = res.count || 0;
    nextRefresh = res.nextRefresh || null;
    refreshInterval = res.refreshInterval || 15;
    isDelayed = res.isDelayed || false;
  }
);

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    isRunning: false,
    count: 0,
    nextRefresh: null,
    isDelayed: false
  });
  chrome.alarms.clear("datRefreshAlarm");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start") {
    console.log("Auto-refresh started via alarm.");
    refreshInterval = Math.max(15, message.interval || 15);

    count = 1;
    isRunning = true;
    isDelayed = false;

    chrome.storage.local.set({
      isRunning: true,
      count,
      refreshInterval,
      isDelayed
    });

    scheduleNextAlarm(refreshInterval * 60000 + 30000);
    sendRefreshRequest();

    chrome.runtime.sendMessage({ action: "updateNextRefresh", nextRefresh, isDelayed });

    sendResponse({ status: "started", nextRefresh });

  } else if (message.action === "stop") {
    console.log("Auto-refresh stopped.");
    chrome.alarms.clear("datRefreshAlarm");

    isRunning = false;
    nextRefresh = null;
    count = 0;
    isDelayed = false;

    chrome.storage.local.set({
      isRunning: false,
      nextRefresh: null,
      count: 0,
      isDelayed: false
    });

    chrome.runtime.sendMessage({ action: "updateNextRefresh", nextRefresh: null, isDelayed: false });

    sendResponse({ status: "stopped" });

  } else if (message.action === "getStatus") {
    chrome.storage.local.get(
      ["refreshInterval", "darkMode", "isRunning", "count", "nextRefresh", "isDelayed"],
      (res) => {
        sendResponse({
          isRunning: res.isRunning || false,
          count: res.count || 0,
          nextRefresh: res.nextRefresh || null,
          refreshInterval: res.refreshInterval || 15,
          darkMode: res.darkMode || false,
          isDelayed: res.isDelayed || false
        });
      }
    );
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "datRefreshAlarm") {
    console.log("Alarm fired, sending refresh message...");
    sendRefreshRequest();
  }
});

function sendRefreshRequest() {
  chrome.tabs.query({ url: "https://one.dat.com/*" }, (tabs) => {
    if (tabs.length === 0) {
      console.warn("No DAT loadboard tabs found.");
      scheduleNextAlarm(refreshInterval * 60000 + 30000);
      chrome.runtime.sendMessage({ action: "updateNextRefresh", nextRefresh, isDelayed });
      return;
    }

    tabs.forEach((tab) => {
      console.log("Sending refreshNow message to tabId:", tab.id);

      chrome.tabs.sendMessage(tab.id, { action: "refreshNow" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending message to content script:",
            chrome.runtime.lastError.message
          );
          scheduleNextAlarm(refreshInterval * 60000 + 30000);
          chrome.runtime.sendMessage({ action: "updateNextRefresh", nextRefresh, isDelayed });
          return;
        }

        if (response && response.status === "refreshed") {
          console.log("Content script response:", response);
          count += 1;
          isDelayed = false;

          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "DAT Auto Refresh",
            message: `Your DAT loadboard was just refreshed! (${count}x)`
          });

          chrome.runtime.sendMessage({ action: "updateCount", count });

          scheduleNextAlarm(refreshInterval * 60000 + 30000);
        } else if (response && response.status === "delayed") {
          isDelayed = true;
          const delay = response.delay;

          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "DAT Auto Refresh",
            message: `Refresh delayed for ${Math.ceil(delay / 1000)}s`
          });

          scheduleNextAlarm(delay);
        } else {
          console.error("Refresh failed:", response);
          isDelayed = false;
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "DAT Auto Refresh",
            message: `Refresh failed: ${response?.message || "unknown error"}`
          });
          scheduleNextAlarm(refreshInterval * 60000 + 30000);
        }

        chrome.runtime.sendMessage({ action: "updateNextRefresh", nextRefresh, isDelayed });
        chrome.storage.local.set({ count, nextRefresh, isDelayed });
      });
    });
  });
}

function scheduleNextAlarm(delay) {
  chrome.alarms.clear("datRefreshAlarm", () => {
    chrome.alarms.create("datRefreshAlarm", { when: Date.now() + delay });
  });
  nextRefresh = Date.now() + delay;
  chrome.storage.local.set({ nextRefresh, count, isDelayed });
}