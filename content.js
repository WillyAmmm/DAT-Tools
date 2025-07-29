/* DAT Tools – content.js  (v4.8.1: skip timer logic while hidden) */

const HEARTBEAT_MS = 3000;
let observer = null,
    beatID   = null,
    lastRowCount  = 0,
    lastDelaySent = null;

/* ── bg → refreshNow ─────────────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg,_s,send)=>{
  if(msg.action!=="refreshNow") return;

  /* If tab not visible, timers are frozen – skip delay check */
  if(document.visibilityState!=="visible"){
    refreshDATPosts()
      .then(()=>send({status:"refreshed"}))
      .catch(e=>{console.error(e);send({status:"error"});});
    return true;
  }

  const delay=getLongestTimer();
  if(delay>0){ send({status:"delayed",delay}); return true; }

  refreshDATPosts()
    .then(()=>send({status:"refreshed"}))
    .catch(e=>{console.error(e);send({status:"error"});});
  return true;
});

/* ───────── Start / Stop watchers ───────── */
function startWatchers(){
  if(observer||beatID||document.visibilityState!=="visible") return;
  attachObserver();
  beatID=setInterval(()=>evaluate("beat"),HEARTBEAT_MS);
}
function stopWatchers(){
  observer?.disconnect(); observer=null;
  clearInterval(beatID);  beatID=null;
}
document.addEventListener("visibilitychange",()=>{
  document.visibilityState==="visible"?startWatchers():stopWatchers();
});
startWatchers();

/* ───────── Mutation observer ───────── */
function attachObserver(){
  const box=rowBox();
  if(!box){ setTimeout(attachObserver,500); return; }
  lastRowCount=box.querySelectorAll(".ag-row").length;
  lastDelaySent=getLongestTimer();
  observer=new MutationObserver(()=>evaluate("mutation"));
  observer.observe(box,{childList:true});
}

/* ───────── Decide if we should notify bg ───────── */
function evaluate(src){
  const box=rowBox(); if(!box) return;
  const rows   = box.querySelectorAll(".ag-row").length;
  const delay  = getLongestTimer();

  let changed = false;
  if(rows!==lastRowCount){ changed=true; lastRowCount=rows; }
  else if(delay>lastDelaySent){          // timer *extended* (new row ready soon)
    changed=true;
  }

  if(changed){
    lastDelaySent=delay;
    console.log(`[DAT] ${src}: rows=${rows}, longest=${delay}s`);
    chrome.runtime.sendMessage({action:"postsModified",delay});
  }
}

/* ───────── Helpers ───────── */
function rowBox(){
  return document.querySelector("cg-grid")
    ?.shadowRoot?.querySelector(".ag-body-viewport .ag-center-cols-container")||null;
}

function getLongestTimer(){
  const box=rowBox(); if(!box) return 0;
  let longest=0;
  box.querySelectorAll(".ag-row").forEach(r=>{
    const age=r.querySelector("cg-grid-age-cell")?.shadowRoot;
    const host=age?.querySelector("#queue-to-refresh-age-tooltip");
    const span=host?.shadowRoot?.querySelector("span.timer-value");
    if(span){
      const secs=parseTimer(span.textContent.trim());
      if(secs>longest) longest=secs;
    }
  });
  return longest;
}
const parseTimer=t=>{
  const p=t.split(":").map(Number);
  if(p.length===3) return p[0]*3600+p[1]*60+p[2];
  if(p.length===2) return p[0]*60+p[1];
  return (p[0]||0)*60;
};

async function refreshDATPosts() {
  console.log("🚀 Running auto-refresh in content script...");

  const checkboxSelector =
    'input[type="checkbox"][aria-label="Column with Header Selection"]';

  const cgGrid = await waitForElement("cg-grid", document, 10000);
  if (!cgGrid) throw new Error("❌ cg-grid not found");

  const gridShadow = cgGrid.shadowRoot;
  if (!gridShadow) throw new Error("❌ cg-grid shadowRoot not found");

  const checkbox = await waitForElement(checkboxSelector, gridShadow, 10000);
  if (!checkbox) throw new Error("❌ Select-all checkbox not found");

  // Ensure no rows are pre-selected
  await ensureCheckboxState(checkbox, false);
  await wait(150);

  // Select all rows for refresh
  await ensureCheckboxState(checkbox, true);
  await wait(200);
  console.log("✅ Select-all checkbox checked");

  // Dynamic wait for refresh button
  const bulkActions = await waitForElement(
    "cg-grid-bulk-actions",
    gridShadow,
    10000
  );
  const bulkShadow = bulkActions.shadowRoot;
  if (!bulkShadow) throw new Error("❌ cg-grid-bulk-actions shadowRoot not found");

  // Use a robust helper to locate the refresh button from anywhere in the document.
  // When the tab is hidden, the bulkActions shadow DOM may not be constructed yet.  
  // waitForRefreshButton recursively searches through light DOM and shadow roots and
  // polls until the button exists.  Once found, wait until it becomes enabled
  // before clicking.
  const refreshButton = await waitForRefreshButton(document, 20000, 500);

  // Wait for the button to be enabled (not disabled or aria-disabled) before clicking
  await waitForElementEnabled(refreshButton, 10000);
  await wait(250);

  clickRefresh(refreshButton);
  console.log("✅ Refresh button clicked");

  try {
    // Wait for the select-all checkbox to clear which indicates refresh finished
    await waitForCheckboxState(checkbox, false, 10000);
  } catch (err) {
    console.warn("⚠️ First refresh attempt failed, retrying...");
    clickElement(refreshButton);
    await wait(500);
    await waitForCheckboxState(checkbox, false, 10000);
  }
  console.log("✅ Refresh completed");
}

async function waitForElement(selector, root, maxWait = 5000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const el = root.querySelector(selector);
    if (el) return el;
    await wait(interval);
  }
  console.warn(`⚠️ Timeout waiting for selector: ${selector}`);
  throw new Error(`Timeout: ${selector} not found`);
}

async function copyPostsFromCoworker() {
  console.log("Starting copy routine...");

  const gridShadow = document.querySelector("cg-grid")?.shadowRoot;
  const rows = gridShadow?.querySelectorAll(".ag-center-cols-container .ag-row");
  if (!rows || rows.length === 0) {
    console.log("No rows found to copy.");
    return;
  }

  const firstRow = rows[0];
  const firstOwnerCell = firstRow.querySelector("cg-grid-owner-cell");
  const targetOwner = firstOwnerCell?.textContent.trim();
  if (!targetOwner) {
    console.warn("❌ Could not determine owner from first row.");
    return;
  }

  console.log(`Target owner detected: ${targetOwner}`);
  let copiedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const ownerCell = row.querySelector("cg-grid-owner-cell");
      const owner = ownerCell?.textContent.trim();
      if (owner !== targetOwner) {
        console.log(`Skipping row ${i}: owner is ${owner}`);
        continue;
      }

      console.log(`Copying row ${i}...`);

      const actionCell = row.querySelector("cg-grid-action-cell");
      const menuButton = actionCell?.shadowRoot
        ?.querySelector("div > cg-icon-button")
        ?.shadowRoot?.querySelector("button");

      if (!menuButton) {
        console.warn(`⚠️ 3-dot menu button not found for row ${i}`);
        continue;
      }

      menuButton.click();
      await wait(100);

      const menu = document.querySelector("body > cg-grid-menu")?.shadowRoot;
      const copyOption = [...menu?.querySelectorAll("cg-option") || []]
        .find(el => el.textContent.trim() === "Copy");

      const clickable = copyOption?.querySelector("div.option-content > div");
      if (!clickable) {
        console.warn(`⚠️ Copy option not clickable for row ${i}`);
        continue;
      }

      clickable.click();
      await wait(100);

      const postBtn = [...document.querySelectorAll("button")]
        .find(el => el.textContent.trim() === "Post");

      if (!postBtn) {
        console.warn(`⚠️ Post button not found after copying row ${i}`);
        continue;
      }

      postBtn.click();
      await wait(100);

      console.log(`✅ Copied and posted row ${i}`);
      copiedCount++;

    } catch (err) {
      console.error(`❌ Error copying row ${i}:`, err);
    }
  }

  console.log(`✅ Done. Copied ${copiedCount} post(s) for owner: ${targetOwner}`);
}

const waitForShadowRoot = async (el, maxWait = 5000, interval = 100) => {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (el.shadowRoot) return el.shadowRoot;
    await wait(interval);
  }
  console.warn("⚠️ Timeout waiting for shadowRoot");
  throw new Error("Timeout: shadowRoot not found");
};

const findRefreshButton = async (root, maxWait = 10000, interval = 100) => {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    let btn = root.querySelector("cg-button#refresh");
    if (!btn) {
      btn = [...root.querySelectorAll("cg-button")].find((b) => {
        const id = b.id?.toLowerCase() || "";
        const label = b.getAttribute("aria-label")?.toLowerCase() || "";
        const text = b.textContent.trim().toLowerCase();
        return id.includes("refresh") || label.includes("refresh") || text === "refresh";
      });
    }
    if (btn) return btn;
    await wait(interval);
  }
  console.warn("⚠️ Timeout locating refresh button");
  throw new Error("Timeout: refresh button not found");
};

/*
 * [DAT-Fix] Recursively search for the refresh button anywhere in the document.
 * On hidden or minimised tabs, certain shadow DOM roots may not be attached
 * immediately and MutationObservers may be throttled.  This helper uses
 * setInterval polling combined with a recursive search through light DOM and
 * any available shadow roots to locate a button whose id, aria-label or
 * text includes "refresh".  It resolves with the button element once found
 * or rejects after maxWait milliseconds.
 */
async function waitForRefreshButton(root = document, maxWait = 20000, pollInterval = 500) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    function isRefresh(el) {
      const id    = (el.id || "").toLowerCase();
      const label = (el.getAttribute?.("aria-label") || "").toLowerCase();
      const text  = (el.textContent || "").toLowerCase().trim();
      return id.includes("refresh") || label.includes("refresh") || text === "refresh";
    }
    function search(node) {
      if (!node) return null;
      const buttons = node.querySelectorAll?.("button, cg-button, cg-icon-button") || [];
      for (const btn of buttons) {
        if (isRefresh(btn)) return btn;
      }
      for (const child of node.children || []) {
        const found = search(child);
        if (found) return found;
      }
      if (node.shadowRoot) {
        const found = search(node.shadowRoot);
        if (found) return found;
      }
      return null;
    }
    function tick() {
      const btn = search(root);
      if (btn) {
        console.log("[DAT-Fix] refresh button found via polling");
        clearInterval(handle);
        resolve(btn);
        return;
      }
      if (Date.now() - startTime >= maxWait) {
        clearInterval(handle);
        reject(new Error("[DAT-Fix] Timeout: refresh button not found"));
      }
    }
    const handle = setInterval(tick, pollInterval);
    tick();
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForElementEnabled(element, maxWait = 5000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const disabled = element.disabled ||
      element.getAttribute('disabled') !== null ||
      element.getAttribute('aria-disabled') === 'true';
    if (!disabled) return true;
    await wait(interval);
  }
  console.warn('⚠️ Timeout waiting for element to become enabled');
  return false;
}

const isCheckboxChecked = (el) =>
  el && (el.checked || el.getAttribute("aria-checked") === "true");

const waitForCheckboxState = async (
  el,
  shouldBeChecked,
  maxWait = 5000,
  interval = 100
) => {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (isCheckboxChecked(el) === shouldBeChecked) return true;
    await wait(interval);
  }
  console.warn(
    `⚠️ Timeout waiting for checkbox to become ${shouldBeChecked ? "checked" : "unchecked"}`
  );
  throw new Error("Timeout: checkbox state mismatch");
};

const ensureCheckboxState = async (el, shouldBeChecked) => {
  if (isCheckboxChecked(el) !== shouldBeChecked) {
    clickElement(el);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await waitForCheckboxState(el, shouldBeChecked);
};

function clickElement(el) {
  if (!el) return;
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

function clickRefresh(el) {
  if (!el) return;
  clickElement(el);
  const innerBtn = el.shadowRoot?.querySelector('button');
  if (innerBtn && innerBtn !== el) {
    clickElement(innerBtn);
  }
}
