let isRunning = false;
let count = 0;
let nextRefresh = null;
let refreshInterval = 15;

// Restore any previously stored state when the service worker starts
chrome.storage.local.get(
  ["isRunning", "count", "nextRefresh", "refreshInterval"],
  (res) => {
    isRunning = res.isRunning || false;
    count = res.count || 0;
    nextRefresh = res.nextRefresh || null;
    refreshInterval = res.refreshInterval || 15;
  }
);

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    isRunning: false,
    count: 0,
    nextRefresh: null
  });
  chrome.alarms.clear("datRefreshAlarm");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start") {
    console.log("Auto-refresh started via alarm.");
    refreshInterval = Math.max(15, message.interval || 15);

    chrome.alarms.create("datRefreshAlarm", {
      periodInMinutes: refreshInterval + (7 / 60)
    });

    count = 1;
    nextRefresh = Date.now() + (refreshInterval * 60000) + 7000;
    isRunning = true;

    chrome.storage.local.set({
      isRunning: true,
      count,
      nextRefresh,
      refreshInterval
    });

    sendRefreshRequest();

    sendResponse({ status: "started", nextRefresh });

  } else if (message.action === "stop") {
    console.log("Auto-refresh stopped.");
    chrome.alarms.clear("datRefreshAlarm");

    isRunning = false;
    nextRefresh = null;
    count = 0;

    chrome.storage.local.set({
      isRunning: false,
      nextRefresh: null,
      count: 0
    });

    sendResponse({ status: "stopped" });

  } else if (message.action === "getStatus") {
    chrome.storage.local.get(
      ["refreshInterval", "darkMode", "isRunning", "count", "nextRefresh"],
      (res) => {
        sendResponse({
          isRunning: res.isRunning || false,
          count: res.count || 0,
          nextRefresh: res.nextRefresh || null,
          refreshInterval: res.refreshInterval || 15,
          darkMode: res.darkMode || false
        });
      }
    );
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "datRefreshAlarm") {
    console.log("Alarm fired, sending refresh message...");

    // Retrieve the latest count in case the service worker was restarted
    chrome.storage.local.get(["count"], (res) => {
      count = (res.count || 0) + 1;
      nextRefresh = Date.now() + (refreshInterval * 60000) + 7000;

      chrome.storage.local.set({
        count,
        nextRefresh
      });

      sendRefreshRequest();
    });
  }
});

function sendRefreshRequest() {
  chrome.tabs.query({ url: "https://one.dat.com/*" }, (tabs) => {
    if (tabs.length > 0) {
      tabs.forEach((tab) => {
        console.log("Sending refreshNow message to tabId:", tab.id);

        chrome.tabs.sendMessage(tab.id, { action: "refreshNow" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error sending message to content script:",
              chrome.runtime.lastError.message
            );
          } else if (response && response.status === "refreshed") {
            console.log("Content script response:", response);

            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon.png",
              title: "DAT Auto Refresh",
              message: `Your DAT loadboard was just refreshed! (${count}x)`
            });

            chrome.runtime.sendMessage({
              action: "updateCount",
              count
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
    } else {
      console.warn("No DAT loadboard tabs found.");
    }
  });
}
