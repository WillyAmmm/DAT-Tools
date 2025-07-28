/*  DAT Tools – popup.js  (v4.4: label always resets to “Running” after success)  */
const tgl  = document.getElementById("toggleRefresh");
const lbl  = document.getElementById("toggleLabel");
const tim  = document.getElementById("timer");
const cnt  = document.getElementById("count");
const dTgl = document.getElementById("darkMode");
const egg  = document.getElementById("copyCoworkerBtn");

let timerID;

/* ───── restore UI on popup open ───── */
chrome.runtime.sendMessage({ action: "getStatus" }, d => {
  chrome.storage.local.get("darkMode", s => {
    const dark = !!s.darkMode;
    dTgl.checked = dark;
    document.body.classList.toggle("dark", dark);
  });

  tgl.checked     = d.isRunning;
  cnt.textContent = d.count.toString();

  if (d.isRunning && d.nextRefresh) updateRunning(d.isDelayed, d.nextRefresh);
  else resetUI();
});

/* ───── start / stop toggle ───── */
tgl.addEventListener("change", () => {
  const action = tgl.checked ? "start" : "stop";
  chrome.runtime.sendMessage({ action }, res => {
    if (action === "start") updateRunning(false, res.nextRefresh);
    else resetUI();
  });
});

/* ───── dark-mode toggle ───── */
dTgl.addEventListener("change", () => {
  const dark = dTgl.checked;
  document.body.classList.toggle("dark", dark);
  chrome.storage.local.set({ darkMode: dark });
});

/* ───── live pushes from background ───── */
chrome.runtime.onMessage.addListener(m => {
  if (m.action === "updateCount") {
    cnt.textContent = m.count.toString();
    lbl.textContent = "Running";                // <── always reset here
    if (m.nextRefresh) startClock(m.nextRefresh);
  }
  if (m.action === "delay")    updateRunning(true,  m.nextRefresh);
  if (m.action === "updateDelay") updateRunning(m.isDelayed, m.nextRefresh);
});

/* ───── helpers ───── */
function updateRunning(delayed, ts) {
  lbl.textContent = delayed ? "Refresh Delayed" : "Running";
  startClock(ts);
}
function resetUI() {
  lbl.textContent = "Stopped";
  tim.textContent = "--:--";
  cnt.textContent = "0";
  clearInterval(timerID);
}
function startClock(stamp) {
  clearInterval(timerID);
  const tick = () => {
    const diff = stamp - Date.now();
    if (diff <= 0) { tim.textContent = "Refreshing…"; return; }
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    tim.textContent = `${m}:${s}`;
  };
  tick();
  timerID = setInterval(tick, 1000);
}

/* Easter-egg placeholder */
egg.addEventListener("click", () => alert("👀 Curious? Coming soon!"));
