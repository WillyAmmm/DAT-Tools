/*  DAT Tools – background.js  (v5.0, 2025-07-28)
    ▸ Switches to single ‘refreshNow’ handshake (content.js v4.8.1)
    ▸ Accurate first-run delay, no 15-second loops
    ▸ Popup always in sync, no phantom ‘posts modified’ spam              */

const BUFFER_SEC      = 30;    // add to longest timer
const MIN_DELAY_MIN   = 0.1;   // Chrome alarms ≥ 0.1 min (≈6 s)
const REFRESH_INT_MIN = 15;    // 15 m 30 s incl. buffer

let isRunning   = false;
let isDelayed   = false;
let count       = 0;
let nextRefresh = null;        // epoch-ms
let lastRefresh = 0;           // epoch-ms of last successful refresh

/* ───────── restore persisted state ───────── */
chrome.storage.local.get(
  ["isRunning","isDelayed","count","nextRefresh"],
  d => {
    isRunning   = !!d.isRunning;
    isDelayed   = !!d.isDelayed;
    count       = d.count       || 0;
    nextRefresh = d.nextRefresh || null;
  }
);

/* full browser restart → reset */
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ isRunning:false, isDelayed:false, count:0, nextRefresh:null });
  chrome.alarms.clear("datRefreshAlarm");
});

/* ───────── popup ⇄ background ───────── */
chrome.runtime.onMessage.addListener((msg,_s,send)=>{
  switch (msg.action) {

    case "start":
      isRunning = true; isDelayed = false; count = 0;
      chrome.storage.local.set({ isRunning, isDelayed, count });
      sendRefreshRequest();                      // kick off immediately
      send({ status:"started" });
      break;

    case "stop":
      chrome.alarms.clear("datRefreshAlarm");
      isRunning = isDelayed = false; count = 0; nextRefresh = null;
      chrome.storage.local.set({ isRunning, isDelayed, count, nextRefresh });
      send({ status:"stopped" });
      break;

    case "getStatus":
      chrome.storage.local.get(
        ["isRunning","isDelayed","count","nextRefresh","darkMode"],
        d=>send({
          isRunning:   !!d.isRunning,
          isDelayed:   !!d.isDelayed,
          count:       d.count       || 0,
          nextRefresh: d.nextRefresh || null,
          darkMode:    !!d.darkMode
        })
      );
      return true;                              // async

    case "copyCoworker":
      chrome.tabs.query({ url:"https://one.dat.com/*" }, tabs => {
        if(tabs.length) {
          chrome.tabs.sendMessage(tabs[0].id, { action:"copyCoworker" });
        }
      });
      send({ status:"copying" });
      break;

    /* mutation from content-script */
    case "postsModified": {
      if(!isRunning) break;
      if(Date.now() - lastRefresh < 7000) break;        // ignore own churn
      if(msg.delay === 0) break;

      const proposedNext = Date.now() + (msg.delay + BUFFER_SEC)*1000;
      if(nextRefresh && proposedNext <= nextRefresh + 5000) break; // ≤5 s shift

      isDelayed = true;
      scheduleAlarm((msg.delay + BUFFER_SEC)/60,false);
      notifyPopupDelay(true);

      chrome.notifications.create({
        type:"basic", iconUrl:"icon.png",
        title:"DAT Auto Refresh",
        message:`Posts modified – refreshing in ${fmt(msg.delay + BUFFER_SEC)}`
      });
      break;
    }
  }
});

/* ───────── alarm fires ───────── */
chrome.alarms.onAlarm.addListener(a=>{
  if(a.name==="datRefreshAlarm" && isRunning) sendRefreshRequest();
});

/* ───────── main refresh routine ───────── */
function sendRefreshRequest(){
  chrome.tabs.query({ url:"https://one.dat.com/*" }, tabs=>{
    if(!tabs.length) return;

    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId,{action:"refreshNow"},res=>{
      /* No listener yet → retry in 15 s */
      if(chrome.runtime.lastError || !res){
        scheduleAlarm(0.25,false);
        notifyPopupDelay(true);
        return;
      }

      /* content says: still counting down */
      if(res.status === "delayed"){
        const totalSec = res.delay + BUFFER_SEC;
        if(!isDelayed){
          chrome.notifications.create({
            type:"basic", iconUrl:"icon.png",
            title:"DAT Auto Refresh",
            message:`Refresh delayed – waiting ${fmt(totalSec)}`
          });
        }
        isDelayed = true;
        scheduleAlarm(totalSec/60,false);
        notifyPopupDelay(true);
        return;
      }

      /* content performed refresh OK */
      if(res.status === "refreshed"){
        count++; isDelayed=false; lastRefresh=Date.now();
        chrome.storage.local.set({ count, isDelayed });

        createNotification(`DAT loadboard refreshed! (${count})`);
        scheduleAlarm(REFRESH_INT_MIN+0.5,true);        // 15 m 30 s
        chrome.runtime.sendMessage({ action:"updateCount", count, nextRefresh });
        return;
      }

      /* any explicit error from content */
      if(res.status === "error"){
        createNotification(`Refresh failed: ${res.message||"unknown error"}`);
        scheduleAlarm(REFRESH_INT_MIN+0.5,true);
        notifyPopupDelay(false);
      }
    });
  });
}

/* ───────── push delay info to popup ───────── */
function notifyPopupDelay(flag){
  chrome.runtime.sendMessage({ action:"delay", isDelayed:flag, nextRefresh });
}

/* ───────── alarm helper ───────── */
function scheduleAlarm(delayMin, repeat){
  const mins = Math.max(delayMin, MIN_DELAY_MIN);
  const info = { delayInMinutes: mins };
  if(repeat) info.periodInMinutes = REFRESH_INT_MIN + 0.5;
  chrome.alarms.create("datRefreshAlarm", info);

  nextRefresh = Date.now() + mins*60_000;
  chrome.storage.local.set({ nextRefresh });
}

/* ───────── misc helpers ───────── */
function fmt(sec){
  const m = Math.floor(sec/60);
  const s = String(sec%60).padStart(2,"0");
  return `${m}:${s}`;
}
function createNotification(msg){
  chrome.notifications.create({
    type:"basic", iconUrl:"icon.png", title:"DAT Auto Refresh", message:msg
  });
}
