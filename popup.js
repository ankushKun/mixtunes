const YTM_ORIGIN = "https://music.youtube.com";

function isYouTubeMusic(url) {
  if (!url) return false;
  try {
    return new URL(url).origin === YTM_ORIGIN;
  } catch {
    return false;
  }
}

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  const onYtm = isYouTubeMusic(tab?.url);
  document.getElementById("on-ytm").hidden = !onYtm;
  document.getElementById("off-ytm").hidden = onYtm;
});
