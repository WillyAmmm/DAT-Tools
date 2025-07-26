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
    isDelayed = res.isDelayed || false;
    count = res.count || 0;
    nextRefresh = res.nextRefresh || null;
    refreshInterval = res.refreshInterval || 15;
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

    isDelayed = false;
    count = 1;
    nextRefresh = Date.now();
    isRunning = true;

    chrome.alarms.create("datRefreshAlarm", { when: Date.now() });

    chrome.storage.local.set({
      isRunning: true,
      count,
      nextRefresh,
      refreshInterval,
      isDelayed
    });

    sendRefreshRequest();

    sendResponse({ status: "started", nextRefresh, isDelayed });

  } else if (message.action === "stop") {
    console.log("Auto-refresh stopped.");
  chrome.alarms.clear("datRefreshAlarm");

  isRunning = false;
  isDelayed = false;
  nextRefresh = null;
  count = 0;

  chrome.storage.local.set({
    isRunning: false,
    nextRefresh: null,
    count: 0,
    isDelayed: false
  });

    sendResponse({ status: "stopped", isDelayed });

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

    chrome.storage.local.get(["count"], (res) => {
      count = (res.count || 0) + 1;
      chrome.storage.local.set({ count });
      sendRefreshRequest();
    });
  }
});

function sendRefreshRequest() {
  chrome.tabs.query({ url: "https://one.dat.com/*" }, (tabs) => {
    if (tabs.length === 0) {
      console.warn("No DAT loadboard tabs found.");
      return;
    }

    tabs.forEach((tab) => {
      console.log("Sending refreshNow message to tabId:", tab.id);
      chrome.tabs.sendMessage(tab.id, { action: "refreshNow" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message to content script:", chrome.runtime.lastError.message);
          return;
        }

        if (response?.status === "refreshed") {
          console.log("Content script response:", response);
          isDelayed = false;
          nextRefresh = Date.now() + refreshInterval * 60000 + 30000;
          chrome.storage.local.set({ count, nextRefresh, isDelayed });
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "DAT Auto Refresh",
            message: `Your DAT loadboard was just refreshed! (${count}x)`
          });
          chrome.runtime.sendMessage({ action: "updateCount", count });
          chrome.runtime.sendMessage({ action: "updateNextRefresh", nextRefresh, isDelayed });
          chrome.alarms.create("datRefreshAlarm", { when: nextRefresh });
        } else if (response?.status === "delayed") {
          isDelayed = true;
          nextRefresh = response.delayUntil;
          chrome.storage.local.set({ nextRefresh, isDelayed });
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "DAT Auto Refresh",
            message: `Refresh delayed for ${formatMs(nextRefresh - Date.now())}`
          });
          chrome.runtime.sendMessage({ action: "updateNextRefresh", nextRefresh, isDelayed });
          chrome.alarms.create("datRefreshAlarm", { when: nextRefresh });
        } else {
          console.error("Refresh failed:", response);
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "DAT Auto Refresh",
            message: `Refresh failed: ${response?.message || "unknown error"}`
          });
        }
      });
    });
  });
}

const formatMs = (ms) => {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
};