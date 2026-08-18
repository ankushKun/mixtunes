/**
 * Origins and the off-host title are duplicated from scripts/hosts-config.js.
 * The service worker cannot importScripts that file — Chrome throws
 * NetworkError on reload, which aborts the whole extension update — and
 * tests/hosts-config.test.js fails if these copies drift.
 */
const HOST_ORIGINS = ["https://music.youtube.com"];
const OFF_HOST_TITLE = "yTunes only works on a supported music site";

function hostOwnsUrl(url) {
  if (!url) return false;
  try {
    return HOST_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

function syncAction(tabId, url) {
  chrome.action.setTitle({
    tabId,
    title: hostOwnsUrl(url) ? "yTunes" : OFF_HOST_TITLE,
  });
}

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  syncAction(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  syncAction(tabId, tab.url);
});
