const YTM_ORIGIN = "https://music.youtube.com";

function isYouTubeMusic(url) {
  if (!url) return false;
  try {
    return new URL(url).origin === YTM_ORIGIN;
  } catch {
    return false;
  }
}

function syncAction(tabId, url) {
  const onYtm = isYouTubeMusic(url);
  chrome.action.setTitle({
    tabId,
    title: onYtm ? "yTunes" : "yTunes only works on YouTube Music",
  });
}

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  syncAction(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  syncAction(tabId, tab.url);
});
