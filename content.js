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
  //    The <mat-checkbox> with class "select-all-shipments-checkbox" 
  //    and the nested <input> with class "mat-checkbox-input".
  const checkbox = document.querySelector(
    "mat-checkbox.select-all-shipments-checkbox input.mat-checkbox-input"
  );
  if (checkbox && !checkbox.checked) {
    checkbox.click();
    console.log("Checkbox selected.");
  } else {
    console.log("Checkbox not found or already checked.");
  }

  // 2. Click the "Refresh" button
  //    According to your snippet, there's a <div class="refresh-btn"> inside a <button>.
  const refreshButton = document.querySelector("div.refresh-btn");
  if (refreshButton) {
    refreshButton.click();
    console.log("Refresh button clicked.");
  } else {
    console.log("Refresh button not found.");
  }
}
