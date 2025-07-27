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

    chrome.alarms.create("datRefreshAlarm", {
      periodInMinutes: refreshInterval + 30 / 60
    });

    count = 0;
    nextRefresh = Date.now() + refreshInterval * 60000 + 30000;
    isRunning = true;
    isDelayed = false;

    chrome.storage.local.set({
      isRunning: true,
      count,
      nextRefresh,
      refreshInterval,
      isDelayed
    });

    sendRefreshRequest();

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

    sendResponse({ status: "stopped" });

  } else if (message.action === "getStatus") {
    chrome.storage.local.get(
      [
        "refreshInterval",
        "darkMode",
        "isRunning",
        "count",
        "nextRefresh",
        "isDelayed"
      ],
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

const scheduleAlarm = (ms) => {
  chrome.alarms.clear("datRefreshAlarm");
  chrome.alarms.create("datRefreshAlarm", {
    when: Date.now() + ms,
    periodInMinutes: refreshInterval + 30 / 60
  });
};

function sendRefreshRequest() {
  chrome.tabs.query({ url: "https://one.dat.com/*" }, (tabs) => {
    if (!tabs.length) {
      console.warn("No DAT loadboard tabs found.");
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
          return;
        }

        if (!response) {
          console.error("No response from content script");
          return;
        }

        if (response.status === "delayed") {
          const delay = response.delay;
          isDelayed = true;
          nextRefresh = Date.now() + delay;
          scheduleAlarm(delay);
          chrome.storage.local.set({ nextRefresh, isDelayed });
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "DAT Auto Refresh",
            message: `Refresh delayed ${(Math.round(delay / 1000))}s`
          });
          chrome.runtime.sendMessage({
            action: "updateNextRefresh",
            nextRefresh,
            delayed: true
          });
          return;
        }

        if (response.status === "refreshed") {
          chrome.storage.local.get(["count"], (res) => {
            count = (res.count || 0) + 1;
            isDelayed = false;
            nextRefresh = Date.now() + refreshInterval * 60000 + 30000;
            chrome.storage.local.set({ count, nextRefresh, isDelayed });
            scheduleAlarm(refreshInterval * 60000 + 30000);

            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon.png",
              title: "DAT Auto Refresh",
              message: `Your DAT loadboard was just refreshed! (${count}x)`
            });

            chrome.runtime.sendMessage({ action: "updateCount", count });
            chrome.runtime.sendMessage({
              action: "updateNextRefresh",
              nextRefresh,
              delayed: false
            });
          });
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
