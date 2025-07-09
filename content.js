// content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "refreshNow") {
    refreshDATPosts();
    sendResponse({ status: "refreshed" });
  }
});

function refreshDATPosts() {
  console.log("Running auto-refresh in content script...");

  // 1. Check the "Select All" checkbox
  //    New selector: <input class="ag-input-field-input ag-checkbox-input" type="checkbox" aria-label="Column with Header Selection">
  const checkbox = document.querySelector(
    'input.ag-input-field-input.ag-checkbox-input[aria-label="Column with Header Selection"]'
  );
  if (checkbox?.checked === false) {
    checkbox.click();
    console.log("Checkbox selected.");
  } else {
    console.log("Checkbox not found or already checked.");
  }

  // 2. Click the "Refresh" button
  //    New selector: <cg-button id="refresh"> with shadow root containing <span class="bulk-action-label">.
  const refreshButton = document
    .querySelector('cg-button#refresh')
    ?.shadowRoot?.querySelector('span.bulk-action-label');
  if (refreshButton) {
    refreshButton.click();
    console.log("Refresh button clicked.");
  } else {
    console.log("Refresh button not found.");
  }
}
