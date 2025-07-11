chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "refreshNow") {
    refreshDATPosts();
    sendResponse({ status: "refreshed" });
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

  try {
    const cgGrid = document.querySelector('cg-grid');
    if (!cgGrid) return console.error("❌ cg-grid not found");

    const gridShadow = cgGrid.shadowRoot;
    if (!gridShadow) return console.error("❌ cg-grid shadowRoot not found");

    const checkbox = gridShadow.querySelector('input[type="checkbox"][aria-label="Column with Header Selection"]');
    if (!checkbox) return console.error("❌ Select-all checkbox not found");

    checkbox.click();
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    console.log("✅ Select-all checkbox clicked");

    // ⏳ Wait for refresh button to appear
    const bulkActions = await waitForElement('cg-grid-bulk-actions', gridShadow);
    const bulkShadow = bulkActions.shadowRoot;
    if (!bulkShadow) return console.error("❌ cg-grid-bulk-actions shadowRoot not found");

    const refreshButton = await waitForElement('cg-button#refresh', bulkShadow);
    const refreshShadow = refreshButton.shadowRoot;
    if (!refreshShadow) return console.error("❌ Refresh button shadowRoot not found");

    refreshButton.click();
    console.log("✅ Refresh button clicked");

  } catch (err) {
    console.error("💥 Script crashed:", err);
  }
}

async function waitForElement(selector, root, maxWait = 5000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const element = root.querySelector(selector);
    if (element) return element;
    await wait(interval);
  }
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
        console.warn(⚠️ 3-dot menu button not found for row ${i}`);
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
