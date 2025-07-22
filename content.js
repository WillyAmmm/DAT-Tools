chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "refreshNow") {
    refreshDATPosts().then(() => {
      sendResponse({ status: "refreshed" });
    }).catch((err) => {
      console.error("❌ refreshDATPosts failed:", err);
      sendResponse({ status: "error", message: err.message });
    });
    return true; // tell Chrome this is async
  }

  if (message.action === "countPosts") {
    const gridShadow = document.querySelector("cg-grid")?.shadowRoot;
    const rows = gridShadow?.querySelectorAll(".ag-center-cols-container .ag-row") || [];
    sendResponse({ count: rows.length });
  }

  if (message.action === "copyCoworkerPosts") {
    copyPostsFromCoworker();
    sendResponse({ status: "copying" });
  }
});

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

  const refreshButton = await findRefreshButton(bulkShadow, 10000);
  const refreshShadow = await waitForShadowRoot(refreshButton, 5000);
  const refreshInner = refreshShadow.querySelector("button");
  if (!refreshInner) throw new Error("❌ Refresh button element not found");

  // ✅ FIXED: Wait for outer refreshButton to be enabled before clicking
  await waitForElementEnabled(refreshButton, 10000);
  await wait(250);
  clickElement(refreshButton);
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
