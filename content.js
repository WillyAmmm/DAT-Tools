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

  const cgGrid = await waitForElement('cg-grid', document, 10000);
  if (!cgGrid) throw new Error("❌ cg-grid not found");

  const gridShadow = cgGrid.shadowRoot;
  if (!gridShadow) throw new Error("❌ cg-grid shadowRoot not found");

  const checkbox = await waitForElement(checkboxSelector, gridShadow, 10000);
  if (!checkbox) throw new Error("❌ Select-all checkbox not found");

  clickElement(checkbox);
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(150);
  console.log("✅ Select-all checkbox clicked");

  // Dynamic wait for refresh button
  const bulkActions = await waitForElement(
    'cg-grid-bulk-actions',
    gridShadow,
    10000
  );
  const bulkShadow = bulkActions.shadowRoot;
  if (!bulkShadow) throw new Error("❌ cg-grid-bulk-actions shadowRoot not found");

  const refreshButton = await waitForElement(
    'cg-button#refresh',
    bulkShadow,
    10000
  );
  const refreshShadow = refreshButton.shadowRoot;
  if (!refreshShadow) throw new Error("❌ Refresh button shadowRoot not found");

  const refreshInner = refreshShadow.querySelector('button');
  if (!refreshInner) throw new Error("❌ Refresh button element not found");

  // Wait until the refresh button is enabled before clicking
  await waitForElementEnabled(refreshInner, 10000);

  clickElement(refreshInner);
  console.log("✅ Refresh button clicked");

  try {
    // Wait for the select-all checkbox to clear which indicates refresh finished
    await waitForCheckboxToBeUnchecked(checkboxSelector, 10000);
  } catch (err) {
    console.warn("⚠️ First refresh attempt failed, retrying...");
    clickElement(refreshInner);
    await wait(300);
    await waitForCheckboxToBeUnchecked(checkboxSelector, 10000);
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

async function waitForCheckboxToBeUnchecked(selector, maxWait = 5000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const cgGrid = document.querySelector('cg-grid');
    const gridShadow = cgGrid?.shadowRoot;
    const checkbox = gridShadow?.querySelector(selector);
    const isChecked = checkbox && (checkbox.checked || checkbox.getAttribute('aria-checked') === 'true');
    if (!isChecked) return true;
    await wait(interval);
  }
  console.warn('⚠️ Timeout waiting for checkbox to uncheck');
  throw new Error('Timeout: checkbox still checked');
}

function clickElement(el) {
  if (!el) return;
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}