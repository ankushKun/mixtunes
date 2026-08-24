configurePrefs(MusicHost.id);

const OVERLAY_KEY = "overlayEnabled";
const OVERLAY_PREF_KEY = "ytunes-overlay";
const LAUNCH_ID = "ytunes-launch";
const STYLE_IDS = {
  host: "ytunes-css-host",
  hide: "ytunes-css-hide",
  shell: "ytunes-css-shell",
};

/** The query flag that means "leave this tab alone", e.g. `?newytm=true`. */
function escapeParam() {
  return MusicHost.escapeParam;
}

function overlayParamOff() {
  const flag = new URLSearchParams(location.search).get(escapeParam());
  return flag === "true" || flag === "1";
}

function stripOverlayParam() {
  const url = new URL(location.href);
  if (!url.searchParams.has(escapeParam())) return;
  url.searchParams.delete(escapeParam());
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function persistOverlayPref(enabled) {
  const on = Boolean(enabled);
  try {
    localStorage.setItem(OVERLAY_PREF_KEY, on ? "1" : "0");
  } catch {
    /* storage can be blocked */
  }
  const root = document.documentElement;
  root.dataset.ytunesOverlay = on ? "on" : "off";
  if (!on) {
    delete root.dataset.ytunesBoot;
    delete root.dataset.ytunesShell;
    document.getElementById("ytunes-boot-inline")?.remove();
  }
  document.dispatchEvent(
    new CustomEvent("ytunes-overlay-pref", { detail: on ? "1" : "0" })
  );
}

// One boolean, because only one host origin ships today. A second host will need
// per-origin keys: this listener reloads every tab that is listening.
async function readOverlayEnabled() {
  if (overlayParamOff()) {
    stripOverlayParam();
    persistOverlayPref(false);
    await chrome.storage.local.set({ [OVERLAY_KEY]: false });
    return false;
  }
  const stored = await chrome.storage.local.get({ [OVERLAY_KEY]: true });
  return stored[OVERLAY_KEY] !== false;
}

async function writeOverlayEnabled(enabled) {
  persistOverlayPref(enabled);
  await chrome.storage.local.set({ [OVERLAY_KEY]: Boolean(enabled) });
}

function injectSheet(id, file) {
  const href = chrome.runtime.getURL(file);
  let link = document.getElementById(id);
  if (link) return link;
  link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(
    (node) => node.href === href
  );
  if (link) {
    link.id = id;
    return link;
  }
  link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  (document.head || document.documentElement).appendChild(link);
  return link;
}

function whenSheetReady(link) {
  if (!link) return Promise.resolve();
  try {
    if (link.sheet) return Promise.resolve();
  } catch {
    /* ignore */
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
    // Cached sheets may already be complete without a load event.
    requestAnimationFrame(() => {
      try {
        if (link.sheet) finish();
      } catch {
        /* ignore */
      }
    });
    setTimeout(finish, 1200);
  });
}

async function injectOverlayStyles() {
  const links = [
    injectSheet(STYLE_IDS.host, "scripts/content.css"),
    injectSheet(STYLE_IDS.hide, MusicHost.hideSheet),
    injectSheet(STYLE_IDS.shell, "layouts/shell/style.css"),
  ];
  await Promise.all(links.map(whenSheetReady));
}

function removeOverlayStyles() {
  for (const id of Object.values(STYLE_IDS)) {
    document.getElementById(id)?.remove();
  }
}

function bootSurface() {
  return document.documentElement.dataset.ytunesTheme === "graphite"
    ? "#3a3a3a"
    : "#cfcfcf";
}

function markShellPainted() {
  const root = document.documentElement;
  delete root.dataset.ytunesBoot;
  root.dataset.ytunesShell = "1";
  document.getElementById("ytunes-boot-inline")?.remove();
}

function teardownOverlay() {
  document.getElementById("ytunes-root")?.remove();
  removeOverlayStyles();
  MusicHost.markIdle();
  delete document.documentElement.dataset.ytunesShell;
}

function bindBootFail(root) {
  root.querySelector("#ytunes-boot-retry")?.addEventListener("click", () => {
    teardownOverlay();
    startOverlay();
  });
  root.querySelector("#ytunes-boot-original")?.addEventListener("click", async () => {
    try {
      await writeOverlayEnabled(false);
    } catch {
      location.reload();
    }
  });
}

function injectBootFail() {
  if (document.getElementById("ytunes-root")) return;
  const root = document.createElement("div");
  root.id = "ytunes-root";
  root.style.background = bootSurface();
  setHtml(
    root,
    `
    <div class="ytunes-app ytunes-boot-fail">
      <header class="ytunes-top">
        <div class="ytunes-lcd">
          <div class="ytunes-lcd-meta">
            <div id="ytunes-lcd-title">Mixtunes</div>
            <div id="ytunes-lcd-sub"></div>
          </div>
        </div>
      </header>
      <div class="ytunes-boot-body">
        <p>The player never appeared. Audio may still work in the tab after you retry.</p>
        <div class="ytunes-dialog-actions">
          <button type="button" id="ytunes-boot-retry">Retry</button>
          <button type="button" id="ytunes-boot-original"></button>
        </div>
      </div>
    </div>
  `
  );
  root.querySelector("#ytunes-lcd-sub").textContent = MusicHost.strings.bootFail;
  root.querySelector("#ytunes-boot-original").textContent =
    MusicHost.strings.originalLabel;
  if (document.documentElement.dataset.ytunesTheme === "graphite") {
    root.querySelector(".ytunes-app")?.classList.add("is-graphite");
  }
  (document.body || document.documentElement).appendChild(root);
  bindBootFail(root);
  markShellPainted();
}

async function injectShell() {
  if (document.getElementById("ytunes-root")) return;
  const html = await fetch(chrome.runtime.getURL("layouts/shell/index.html")).then(
    (response) => response.text()
  );
  const root = document.createElement("div");
  root.id = "ytunes-root";
  root.style.background = bootSurface();
  // Trusted package HTML from web_accessible_resources (layouts/shell/index.html).
  setHtml(root, html);
  if (document.documentElement.dataset.ytunesTheme === "graphite") {
    root.querySelector(".ytunes-app")?.classList.add("is-graphite");
  }
  (document.body || document.documentElement).appendChild(root);
  bindShell(root);
  // Let the browser paint the styled shell once before dropping the veil.
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  markShellPainted();
}

function launchInPlace(button, slot) {
  return button.parentNode === slot.parent && button.nextElementSibling === slot.before;
}

const launchWatched = new WeakSet();
let launchTimer = 0;
let launchPageWatch = null;

function watchLaunchNode(node) {
  if (!node || launchWatched.has(node)) return;
  launchWatched.add(node);
  new MutationObserver(() => scheduleLaunchPlace()).observe(node, { childList: true });
}

function scheduleLaunchPlace() {
  if (launchTimer) return;
  launchTimer = window.setTimeout(() => {
    launchTimer = 0;
    placeLaunchButton();
  }, 250);
}

function bindLaunchButton(button) {
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await writeOverlayEnabled(true);
    } catch {
      location.reload();
    }
  });
}

function placeLaunchButton() {
  if (document.getElementById("ytunes-root") || document.documentElement.dataset.ytunesHost === "ready") {
    document.getElementById(LAUNCH_ID)?.remove();
    return;
  }
  const slot = MusicHost.launchSlot();
  if (!slot) return;
  const existing = document.getElementById(LAUNCH_ID);
  if (existing) {
    if (!launchInPlace(existing, slot)) slot.parent.insertBefore(existing, slot.before);
    watchLaunchNode(slot.parent);
    return;
  }
  const button = document.createElement("button");
  button.id = LAUNCH_ID;
  button.type = "button";
  button.title = "Open Mixtunes";
  button.setAttribute("aria-label", "Open Mixtunes");
  setHtml(
    button,
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>'
  );
  bindLaunchButton(button);
  slot.parent.insertBefore(button, slot.before);
  watchLaunchNode(slot.parent);
  for (const node of slot.watch || []) watchLaunchNode(node);
}

function startLauncher() {
  injectSheet(STYLE_IDS.host, "scripts/content.css");
  placeLaunchButton();
  if (launchPageWatch) return;
  launchPageWatch = new MutationObserver(() => scheduleLaunchPlace());
  launchPageWatch.observe(document.documentElement, { childList: true, subtree: true });
}

async function startOverlay() {
  const stylesReady = injectOverlayStyles();
  MusicHost.markReady();
  try {
    const ok = await MusicHost.waitUntilReady();
    if (!(await readOverlayEnabled())) {
      teardownOverlay();
      startLauncher();
      return;
    }
    await stylesReady;
    if (!ok) {
      injectBootFail();
      return;
    }
    await injectShell();
  } catch {
    await stylesReady.catch(() => {});
    injectOverlayStyles();
    MusicHost.markReady();
    injectBootFail();
  }
}

async function boot() {
  teardownOverlay();
  const enabled = await readOverlayEnabled();
  persistOverlayPref(enabled);
  if (enabled) await startOverlay();
  else startLauncher();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ytunes.probe") {
    sendResponse(MusicHost.probe());
    return;
  }
  if (message?.type === "ytunes.control") {
    MusicHost.control(message.action).then((ok) => sendResponse({ ok }));
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
  persistOverlayPref(changes[OVERLAY_KEY].newValue !== false);
  location.reload();
});

boot();
