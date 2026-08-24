/**
 * document_start: kill the white canvas before first paint, mirror the user's
 * theme into a boot background, and kick off stylesheet downloads early.
 */
(() => {
  const OVERLAY_PREF_KEY = "ytunes-overlay";
  const BOOT_THEME_KEY = "ytunes-boot-theme";
  const ESCAPE = "newytm";
  const INLINE_ID = "ytunes-boot-inline";
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
      if (value === null) return true;
      return value !== "0" && value !== "false";
    } catch {
      return true;
    }
  }

  function resolveBootTheme() {
    try {
      const stored = localStorage.getItem(BOOT_THEME_KEY);
      if (stored === "graphite" || stored === "light") return stored;
    } catch {
      /* ignore */
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "graphite"
        : "light";
    } catch {
      return "light";
    }
  }

  if (escapeOff() || !prefEnabled()) {
    root.dataset.ytunesOverlay = "off";
    delete root.dataset.ytunesBoot;
    delete root.dataset.ytunesTheme;
    delete root.dataset.ytunesShell;
    document.getElementById(INLINE_ID)?.remove();
    return;
  }

  const theme = resolveBootTheme();
  const bg = theme === "graphite" ? "#3a3a3a" : "#cfcfcf";
  root.dataset.ytunesOverlay = "on";
  root.dataset.ytunesBoot = "1";
  root.dataset.ytunesTheme = theme;
  delete root.dataset.ytunesShell;

  // Inline styles beat the browser's default white paint even before boot-hide.css.
  let style = document.getElementById(INLINE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = INLINE_ID;
    (document.head || root).appendChild(style);
  }
  style.textContent = `
html:not([data-ytunes-overlay="off"]),
html:not([data-ytunes-overlay="off"]) body {
  background: ${bg} !important;
  color-scheme: ${theme === "graphite" ? "dark" : "light"} !important;
}
html:not([data-ytunes-overlay="off"]):not([data-ytunes-shell="1"])::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  background: ${bg};
}
`;

  // Prefetch shell CSS so it is warm before content.js mounts the UI.
  const sheets = [
    "scripts/content.css",
    "scripts/hosts/ytm/hide.css",
    "layouts/shell/style.css",
  ];
  for (const file of sheets) {
    const id = `ytunes-prefetch-${file.replace(/[^\w]+/g, "-")}`;
    if (document.getElementById(id)) continue;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL(file);
    (document.head || root).appendChild(link);
  }
})();
