const YTM_ORIGIN = "https://music.youtube.com";

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

function isYouTubeMusic(url) {
  if (!url) return false;
  try {
    return new URL(url).origin === YTM_ORIGIN;
  } catch {
    return false;
  }
}

async function openYouTubeMusic() {
  const tabs = await chrome.tabs.query({ url: `${YTM_ORIGIN}/*` });
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
  await chrome.tabs.create({ url: YTM_ORIGIN });
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

const artwork = document.getElementById("artwork");
artwork?.addEventListener("error", () => {
  const src = artwork.getAttribute("src") || "";
  const next = src
    .replace("/hq720.", "/hqdefault.")
    .replace("/maxresdefault.", "/hqdefault.");
  if (next !== src) artwork.src = next;
});

function renderStatus(status) {
  const nowPlaying = document.getElementById("now-playing");
  const hostStatus = document.getElementById("host-status");
  const playPause = document.getElementById("play-pause");
  const artworkFrame = document.querySelector(".artwork");
  const artwork = document.getElementById("artwork");

  if (!status?.hostAlive) {
    nowPlaying.textContent = "Player bar not found. Start a song, then reload.";
    hostStatus.textContent = "Host: missing";
    playPause.classList.remove("is-playing");
    playPause.setAttribute("aria-label", "Play");
    artwork.removeAttribute("src");
    artworkFrame.hidden = true;
    return;
  }

  const line = [status.title, status.subtitle].filter(Boolean).join(" — ");
  nowPlaying.textContent = line || "YouTube Music player is alive.";
  hostStatus.textContent = status.hasMoviePlayer
    ? "Host: player bar + movie player"
    : "Host: player bar";
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

document.getElementById("open-ytm")?.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    await openYouTubeMusic();
  } catch {
    window.open(YTM_ORIGIN, "_blank", "noopener,noreferrer");
  }
  window.close();
});

chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  const onYtm = isYouTubeMusic(tab?.url);
  document.getElementById("on-ytm").hidden = !onYtm;
  document.getElementById("off-ytm").hidden = onYtm;
  if (!onYtm || tab?.id == null) return;

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
