/**
 * Runs at document_start before first paint when possible.
 * Sets overlay flags synchronously from localStorage so boot-hide CSS can
 * cover stock YouTube Music chrome immediately (avoids a YTM FOUC).
 */
(() => {
  const OVERLAY_PREF_KEY = "ytunes-overlay";
  const ESCAPE = "newytm";
  const root = document.documentElement;

  function escapeOff() {
    try {
      const flag = new URLSearchParams(location.search).get(ESCAPE);
      return flag === "true" || flag === "1";
    } catch {
      return false;
    }
  }

  function prefEnabled() {
    try {
      const value = localStorage.getItem(OVERLAY_PREF_KEY);
      // Match chrome.storage default: enabled unless explicitly "0".
      if (value === null) return true;
      return value !== "0" && value !== "false";
    } catch {
      return true;
    }
  }

  if (escapeOff() || !prefEnabled()) {
    root.dataset.ytunesOverlay = "off";
    delete root.dataset.ytunesBoot;
    return;
  }

  root.dataset.ytunesOverlay = "on";
  root.dataset.ytunesBoot = "1";
})();
