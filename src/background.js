chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "LAYOUT_REVIEW_TOGGLE_PANEL" });
  } catch {
    // The content script may not be ready yet. Reloading the matching page is enough
    // to attach it; we intentionally avoid injecting into unsupported origins.
  }
});
