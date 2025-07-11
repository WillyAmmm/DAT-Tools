const toggle = document.getElementById("toggleRefresh");
const label = document.getElementById("toggleLabel");
const timerDisplay = document.getElementById("timer");
const countDisplay = document.getElementById("count");
const darkToggle = document.getElementById("darkMode");
const copyButton = document.getElementById("copyCoworkerBtn");

let timerInterval;

toggle.addEventListener("change", () => {
  const action = toggle.checked ? "start" : "stop";

  // Fixed: remove intervalSelect and hardcode to 15
  const interval = 15;

  chrome.runtime.sendMessage({ action, interval }, (res) => {
    if (action === "start") {
      label.textContent = "Running";
      startCountdown(res.nextRefresh);
    } else {
      label.textContent = "Stopped";
      countDisplay.textContent = "0";
      timerDisplay.textContent = "--:--";
      clearInterval(timerInterval);
    }
  });
});

darkToggle.addEventListener("change", () => {
  const isDark = darkToggle.checked;
  document.body.classList.toggle("dark", isDark);
  chrome.storage.local.set({ darkMode: isDark });
});

function startCountdown(timestamp) {
  clearInterval(timerInterval);

  function update() {
    const diff = timestamp - Date.now();
    if (diff <= 0) {
      timerDisplay.textContent = "Refreshing...";
      clearInterval(timerInterval);
      return;
    }

    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    timerDisplay.textContent = `${min}:${sec.toString().padStart(2, "0")}`;
  }

  update();
  timerInterval = setInterval(update, 1000);
}

// 🔄 Restore state when popup opens
chrome.runtime.sendMessage({ action: "getStatus" }, (data) => {
  toggle.checked = data.isRunning;
  label.textContent = data.isRunning ? "Running" : "Stopped";
  countDisplay.textContent = data.count.toString();

  darkToggle.checked = data.darkMode;
  document.body.classList.toggle("dark", data.darkMode);

  if (data.isRunning && data.nextRefresh) {
    startCountdown(data.nextRefresh);
  } else {
    timerDisplay.textContent = "--:--";
  }
});

// 🔥 Listen for live count updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "updateCount") {
    countDisplay.textContent = message.count.toString();
  }
});

// 🥚 Easter egg: Copy button shows fun message
copyButton.addEventListener("click", () => {
  alert("👀 Curious? This feature’s not ready yet — coming soon!");
});
