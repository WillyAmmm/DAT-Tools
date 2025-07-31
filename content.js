/*  DAT Tools – content.js  (v4.8.7)  */

const HEARTBEAT_MS = 3000;
let observer = null,
    beatID   = null,
    lastRowCount  = 0,
    lastDelaySent = null;

/* ── background → refreshNow ───────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg.action === "copyCoworkerPosts") {
    copyPostsFromCoworker();
    send({ status: "started" });
    return;
  }
  if (msg.action !== "refreshNow") return;

  if (document.visibilityState !== "visible") {
    refreshDATPosts()
      .then(() => send({ status: "refreshed" }))
      .catch(e => { console.error(e); send({ status: "error", message: e.message }); });
    return true;
  }

  const delay = getLongestTimer();
  if (delay > 0) { send({ status: "delayed", delay }); return true; }

  refreshDATPosts()
    .then(() => send({ status: "refreshed" }))
    .catch(e => { console.error(e); send({ status: "error", message: e.message }); });
  return true;
});

/* ───────── start / stop DOM watchers ───────── */
function startWatchers() {
  if (observer || beatID || document.visibilityState !== "visible") return;
  attachObserver();
  beatID = setInterval(() => evaluate("beat"), HEARTBEAT_MS);
}
function stopWatchers() {
  observer?.disconnect(); observer = null;
  clearInterval(beatID); beatID = null;
}
document.addEventListener("visibilitychange", () => {
  document.visibilityState === "visible" ? startWatchers() : stopWatchers();
});
startWatchers();

/* ───────── mutation observer & evaluator (unchanged) ───────── */
function attachObserver() {
  const box = rowBox();
  if (!box) { setTimeout(attachObserver, 500); return; }

  lastRowCount  = box.querySelectorAll(".ag-row").length;
  lastDelaySent = getLongestTimer();
  observer      = new MutationObserver(() => evaluate("mutation"));
  observer.observe(box, { childList: true });
}
function evaluate(src) {
  const box = rowBox(); if (!box) return;
  const rows  = box.querySelectorAll(".ag-row").length;
  const delay = getLongestTimer();

  let changed = false;
  if (rows !== lastRowCount)              { changed = true; lastRowCount  = rows; }
  else if (delay > lastDelaySent)         { changed = true;               }

  if (changed) {
    lastDelaySent = delay;
    console.log(`[DAT] ${src}: rows=${rows}, longest=${delay}s`);
    chrome.runtime.sendMessage({ action: "postsModified", delay });
  }
}

/* ───────── helpers used by the watcher logic ───────── */
function rowBox() {
  return document.querySelector("cg-grid")
    ?.shadowRoot?.querySelector(".ag-body-viewport .ag-center-cols-container") || null;
}
function getLongestTimer() {
  const box = rowBox(); if (!box) return 0;
  let longest = 0;
  box.querySelectorAll(".ag-row").forEach(r => {
    const age  = r.querySelector("cg-grid-age-cell")?.shadowRoot;
    const host = age?.querySelector("#queue-to-refresh-age-tooltip");
    const span = host?.shadowRoot?.querySelector("span.timer-value");
    if (span) {
      const secs = parseTimer(span.textContent.trim());
      if (secs > longest) longest = secs;
    }
  });
  return longest;
}
const parseTimer = t => {
  const p = t.split(":").map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return (p[0] || 0) * 60;
};

/* ──────────────────────────────────────────────────────────────────────────
   ▼ Core refresh routine – dynamic checkbox wait
   ────────────────────────────────────────────────────────────────────────── */
async function refreshDATPosts() {
  console.log("🚀 Running auto-refresh in content script…");

  const checkboxSel = 'input[type="checkbox"][aria-label="Column with Header Selection"]';
  const cgGrid      = await waitForElement("cg-grid", document, 10_000);
  const gridShadow  = cgGrid.shadowRoot;
  const checkbox    = await waitForElement(checkboxSel, gridShadow, 10_000);

  /* clear any prior selection, then re-select all */
  await ensureCheckboxState(checkbox, false);
  await wait(150);
  await ensureCheckboxState(checkbox, true);
  await wait(200);
  console.log("✅ Select-all checkbox checked");

  /* locate Refresh button (longer window if tab hidden) */
  const bulkActions = await waitForElement("cg-grid-bulk-actions", gridShadow, 10_000);
  const bulkShadow  = bulkActions.shadowRoot;
  const refreshBtn  = await findRefreshButton(bulkShadow, btnTimeout());

  await waitForElementEnabled(refreshBtn, 10_000);
  await wait(250);
  clickRefresh(refreshBtn);
  console.log("✅ Refresh button clicked");

  /* foreground ⇢ full retry ; background ⇢ double-click pattern */
  const isVisible = document.visibilityState === "visible";
  try {
    await waitForCheckboxClearDynamic(gridShadow, checkboxSel, 15_000);
  } catch (err) {
    if (isVisible) {
      console.warn("⚠️ First attempt failed, retrying…");
      await wait(500);
      clickRefresh(refreshBtn);
      await waitForCheckboxClearDynamic(gridShadow, checkboxSel, 15_000);
    } else {
      console.log("ℹ️ Hidden tab: first click didn't clear within 15 s, sending second click.");
      await wait(500);
      clickRefresh(refreshBtn);
    }
  }

  console.log("✅ Refresh completed");
}

/* helper: pick timeout based on visibility */
const btnTimeout = () =>
  document.visibilityState === "visible" ? 10_000 : 30_000;

/* ───────── generic DOM helpers ───────── */
async function waitForElement(selector, root, max = 5_000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < max) {
    const el = root.querySelector(selector);
    if (el) return el;
    await wait(step);
  }
  throw new Error(`Timeout: ${selector} not found`);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

async function waitForShadowRoot(el, max = 5_000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < max) {
    if (el.shadowRoot) return el.shadowRoot;
    await wait(step);
  }
  throw new Error("Timeout: shadowRoot not found");
}
async function waitForElementEnabled(el, max = 5_000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < max) {
    const disabled = el.disabled || el.getAttribute("disabled") !== null ||
                     el.getAttribute("aria-disabled") === "true";
    if (!disabled) return true;
    await wait(step);
  }
  throw new Error("Timeout: element still disabled");
}

/* ───── checkbox helpers ───── */
const isCheckboxChecked = el =>
  el && (el.checked || el.getAttribute("aria-checked") === "true");

async function waitForCheckboxClearDynamic(root, selector, max = 10_000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < max) {
    const el = root.querySelector(selector);
    if (!el || !isCheckboxChecked(el)) return true;   // gone OR unchecked
    await wait(step);
  }
  throw new Error("Timeout: checkbox state mismatch");
}

async function ensureCheckboxState(el, shouldBe) {
  if (isCheckboxChecked(el) !== shouldBe) {
    clickElement(el);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await waitForCheckboxState(el, shouldBe);
}
function waitForCheckboxState(el, shouldBe, max = 5_000, step = 100) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function loop() {
      if (isCheckboxChecked(el) === shouldBe) return resolve(true);
      if (Date.now() - start > max) return reject(new Error("Timeout"));
      setTimeout(loop, step);
    })();
  });
}

/* ───── click helpers ───── */
function clickElement(el) {
  if (!el) return;
  ["mousedown", "mouseup", "click"].forEach(type =>
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })));
}
function clickRefresh(el) {
  clickElement(el);
  el.shadowRoot?.querySelector("button") && clickElement(el.shadowRoot.querySelector("button"));
}

/* locate the custom <cg-button id="refresh"> just like LIVE */
async function findRefreshButton(root, max = 10_000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < max) {
    let btn = root.querySelector("cg-button#refresh");
    if (!btn) {
      btn = [...root.querySelectorAll("cg-button")].find(b => {
        const id    = b.id?.toLowerCase() || "";
        const label = b.getAttribute("aria-label")?.toLowerCase() || "";
        const text  = b.textContent.trim().toLowerCase();
        return id.includes("refresh") || label.includes("refresh") || text === "refresh";
      });
    }
    if (btn) return btn;
    await wait(step);
  }
  throw new Error("Timeout: refresh button not found");
}

/* ───────── utility: copy coworker posts ───────── */
const copyPostsFromCoworker = async () => {
  console.log("Starting copy routine…");

  const grid     = await waitForElement("cg-grid", document, 10_000).catch(() => null);
  const gridRoot = grid && (await waitForShadowRoot(grid).catch(() => null));
  const container = gridRoot?.querySelector(".ag-center-cols-container");
  const rows = [...container?.querySelectorAll(".ag-row") || []];
  const ids  = rows.map(r => r.getAttribute("row-id")).filter(Boolean);
  if (!ids.length) { alert("No posts found to copy."); return; }

  const estSec = ids.length * 4;
  const estMsg = `${Math.floor(estSec/60)}m${String(estSec%60).padStart(2,"0")}s`;
  if (!confirm(`Duplicate ${ids.length} posts? Estimated time: ${estMsg}`)) return;

  for (const id of ids) {
    try {
      const row = await waitForRow(id, 20_000);
      if (!row) { console.warn(`Row ${id} not found`); continue; }

      const menuBtn = row.querySelector("cg-grid-action-cell")
        ?.shadowRoot?.querySelector("div > cg-icon-button")
        ?.shadowRoot?.querySelector("button");
      if (!menuBtn) { console.warn(`Menu button missing for ${id}`); continue; }
      clickElement(menuBtn); await wait(200);

      const menu = await waitForElement("body > cg-grid-menu", document, 5_000).catch(() => null);
      const menuRoot = menu && (await waitForShadowRoot(menu).catch(() => null));
      const copyOpt = [...menuRoot?.querySelectorAll("cg-option") || []]
        .find(o => o.textContent.trim() === "Copy");
      const clickable = copyOpt?.querySelector("div.option-content > div");
      if (!clickable) { console.warn(`Copy option not found for ${id}`); continue; }
      clickElement(clickable); await wait(300);

      const postBtn = await waitForElement("#shipment-submit-button", document, 15_000).catch(() => null);
      if (!postBtn) { console.warn(`Post button missing for ${id}`); continue; }
      await waitForElementEnabled(postBtn, 15_000).catch(() => null);
      clickElement(postBtn); await wait(300);

      await waitForGrid(20_000);
      await wait(300);
      console.log(`✅ Copied ${id}`);
    } catch (err) {
      console.error(`❌ Error copying ${id}:`, err);
    }
  }

  alert(`Finished copying ${ids.length} post(s).`);
};

const waitForRow = async (id, max = 10_000, step = 200) => {
  const start = Date.now();
  while (Date.now() - start < max) {
    const gridRoot = document.querySelector("cg-grid")?.shadowRoot;
    const row = gridRoot?.querySelector(`.ag-row[row-id="${id}"]`);
    if (row) return row;
    await wait(step);
  }
  return null;
};

const waitForGrid = async (max = 10_000, step = 200) => {
  const start = Date.now();
  while (Date.now() - start < max) {
    const gridRoot = document.querySelector("cg-grid")?.shadowRoot;
    if (gridRoot?.querySelector(".ag-row")) return true;
    await wait(step);
  }
  throw new Error("Timeout waiting for grid");
};
