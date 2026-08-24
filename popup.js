/** Host owning the active tab, or null when the popup opened off-host. */
let activeHost = null;

function paintPopupTheme(theme) {
  const mode = sanitizeTheme(theme);
  const dark = resolveGraphite(mode);
  document.documentElement.classList.toggle("is-light", mode === "light");
  document.documentElement.classList.toggle("is-graphite", dark);
}

async function syncPopupTheme() {
  const prefs = await loadPrefs();
  paintPopupTheme(prefs.theme);
}

syncPopupTheme();
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.ytunesPrefs) return;
    paintPopupTheme(migratePrefs(changes.ytunesPrefs.newValue).theme);
  });
} catch {
  /* storage events unavailable in tests */
}
try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    syncPopupTheme();
  });
} catch {
  /* matchMedia can be missing */
}

async function openHost(host) {
  const tabs = await chrome.tabs.query({ url: `${host.origin}/*` });
  const current = await chrome.windows.getCurrent();
  const sameWindow = tabs.filter((tab) => tab.windowId === current?.id);
  const pool = sameWindow.length ? sameWindow : tabs;
  const existing =
    pool.find((tab) => tab.audible) ||
    pool.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: host.origin });
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

document.getElementById("artwork")?.addEventListener("error", (event) => {
  event.target.removeAttribute("src");
  document.querySelector(".artwork").hidden = true;
});

function renderStatus(status) {
  const nowPlaying = document.getElementById("now-playing");
  const hostStatus = document.getElementById("host-status");
  const playPause = document.getElementById("play-pause");
  const artworkFrame = document.querySelector(".artwork");
  const artwork = document.getElementById("artwork");

  if (!status?.hostAlive) {
    nowPlaying.textContent = "Player not found. Start a song, then reload.";
    hostStatus.textContent = `${activeHost?.name || "Host"}: missing`;
    playPause.classList.remove("is-playing");
    playPause.setAttribute("aria-label", "Play");
    artwork.removeAttribute("src");
    artworkFrame.hidden = true;
    return;
  }

  const line = [status.title, status.subtitle].filter(Boolean).join(" - ");
  nowPlaying.textContent = line || activeHost?.strings.popupAlive || "Player is alive.";
  hostStatus.textContent = `${activeHost?.name || "Host"}: ${
    status.hasMoviePlayer ? "player ready" : "controls only"
  }`;
  playPause.classList.toggle("is-playing", Boolean(status.playing));
  playPause.setAttribute("aria-label", status.playing ? "Pause" : "Play");

  if (status.artwork) {
    artwork.alt = status.title ? `Artwork for ${status.title}` : "Album artwork";
    if (artwork.getAttribute("src") !== status.artwork) {
      artwork.src = status.artwork;
    }
    artworkFrame.hidden = false;
  } else {
    artwork.removeAttribute("src");
    artworkFrame.hidden = true;
  }
}

async function refresh(tabId) {
  renderStatus(await sendToTab(tabId, { type: "ytunes.probe" }));
}

async function syncOverlayToggle() {
  const toggle = document.getElementById("overlay-enabled");
  const stored = await chrome.storage.local.get({ overlayEnabled: true });
  toggle.checked = stored.overlayEnabled !== false;
  toggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ overlayEnabled: toggle.checked });
    window.close();
  });
}

function paintOffHost() {
  const fallback = YTunesHosts.primary();
  const names = YTunesHosts.list.map((host) => host.name).join(", ");
  const link = document.getElementById("open-ytm");
  document.getElementById("off-hint").textContent = `This only works on ${names}.`;
  if (!link) return;
  link.textContent = fallback.strings.popupOpen;
  link.href = fallback.origin;
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await openHost(fallback);
    } catch {
      window.open(fallback.origin, "_blank", "noopener,noreferrer");
    }
    window.close();
  });
}

chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  activeHost = YTunesHosts.forUrl(tab?.url);
  const onHost = Boolean(activeHost);
  if (onHost) configurePrefs(activeHost.id);
  document.getElementById("on-ytm").hidden = !onHost;
  document.getElementById("off-ytm").hidden = onHost;
  if (!onHost || tab?.id == null) {
    paintOffHost();
    return;
  }

  document.getElementById("overlay-hint").textContent =
    activeHost.strings.popupOverlayHint;
  await syncOverlayToggle();
  await refresh(tab.id);

  document.querySelector(".transport").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    await sendToTab(tab.id, {
      type: "ytunes.control",
      action: button.dataset.action,
    });
    await refresh(tab.id);
  });

  setInterval(() => refresh(tab.id), 800);
});
