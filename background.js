/**
 * Origins and the off-host title are duplicated from scripts/hosts-config.js.
 * The service worker cannot importScripts that file — Chrome throws
 * NetworkError on reload, which aborts the whole extension update — and
 * tests/hosts-config.test.js fails if these copies drift.
 */
const HOST_ORIGINS = ["https://music.youtube.com"];
const OFF_HOST_TITLE = "Mixtunes only works on a supported music site";

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
    title: hostOwnsUrl(url) ? "Mixtunes" : OFF_HOST_TITLE,
  });
}

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  syncAction(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  syncAction(tabId, tab.url);
});

function isSiteSender(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname === "ankush.one") {
      return true;
    }
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isSiteSender(sender.url)) return;
  if (!message || message.type !== "mixtunes-version") return;
  sendResponse({ version: chrome.runtime.getManifest().version });
});
