const OVERLAY_KEY = "overlayEnabled";
const STYLE_IDS = {
  host: "ytunes-css-host",
  shell: "ytunes-css-shell",
};

function overlayParamOff() {
  const params = new URLSearchParams(location.search);
  const flag = params.get("newytm");
  return flag === "true" || flag === "1";
}

function stripOverlayParam() {
  const url = new URL(location.href);
  if (!url.searchParams.has("newytm")) return;
  url.searchParams.delete("newytm");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function readOverlayEnabled() {
  if (overlayParamOff()) {
    stripOverlayParam();
    await chrome.storage.local.set({ [OVERLAY_KEY]: false });
    return false;
  }
  const stored = await chrome.storage.local.get({ [OVERLAY_KEY]: true });
  return stored[OVERLAY_KEY] !== false;
}

async function writeOverlayEnabled(enabled) {
  await chrome.storage.local.set({ [OVERLAY_KEY]: Boolean(enabled) });
}

function injectSheet(id, file) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL(file);
  (document.head || document.documentElement).appendChild(link);
}

function injectOverlayStyles() {
  injectSheet(STYLE_IDS.host, "scripts/content.css");
  injectSheet(STYLE_IDS.shell, "layouts/shell/style.css");
}

function removeOverlayStyles() {
  for (const id of Object.values(STYLE_IDS)) {
    document.getElementById(id)?.remove();
  }
}

function teardownOverlay() {
  document.getElementById("ytunes-root")?.remove();
  removeOverlayStyles();
  if (typeof markHostIdle === "function") markHostIdle();
  else delete document.documentElement.dataset.ytunesHost;
}

async function injectShell() {
  if (document.getElementById("ytunes-root")) return;
  const html = await fetch(chrome.runtime.getURL("layouts/shell/index.html")).then(
    (response) => response.text()
  );
  const root = document.createElement("div");
  root.id = "ytunes-root";
  root.innerHTML = html;
  (document.body || document.documentElement).appendChild(root);
  bindShell(root);
}

async function startOverlay() {
  injectOverlayStyles();
  markHostReady();
  try {
    const ok = await waitForPlayerBar();
    if (!(await readOverlayEnabled())) {
      teardownOverlay();
      return;
    }
    if (!ok) {
      teardownOverlay();
      return;
    }
    await injectShell();
  } catch {
    teardownOverlay();
  }
}

async function boot() {
  teardownOverlay();
  if (await readOverlayEnabled()) await startOverlay();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ytunes.probe") {
    sendResponse(probe());
    return;
  }
  if (message?.type === "ytunes.control") {
    controlPlayback(message.action).then((ok) => sendResponse({ ok }));
    return true;
  }
  if (message?.type === "ytunes.getEnabled") {
    readOverlayEnabled().then((enabled) => sendResponse({ enabled }));
    return true;
  }
  if (message?.type === "ytunes.setEnabled") {
    writeOverlayEnabled(message.enabled).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[OVERLAY_KEY]) return;
  location.reload();
});

boot();
