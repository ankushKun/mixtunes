/** Host owning the active tab, or null when the popup opened off-host. */
let activeHost = null;

const HOST_ICONS = {
  ytm: "M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z",
  spotify:
    "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z",
  apple:
    "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
  soundcloud:
    "M3 14.5v-3c0-.3.2-.5.5-.5s.5.2.5.5v3c0 .3-.2.5-.5.5s-.5-.2-.5-.5zm2.25 1v-5c0-.3.2-.5.5-.5s.5.2.5.5v5c0 .3-.2.5-.5.5s-.5-.2-.5-.5zm2.25.5V8.5c0-.3.2-.5.5-.5s.5.2.5.5v7.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5zm2.25.2V7.8c0-.3.2-.5.5-.5s.5.2.5.5v8.4c0 .3-.2.5-.5.5s-.5-.2-.5-.5zM17.2 10c-.4-2.3-2.4-4-4.8-4-1.5 0-2.9.7-3.8 1.8v8.2h8.1c2 0 3.6-1.6 3.6-3.6S19.2 10 17.2 10z",
  fallback:
    "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
};

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
  const hostId = activeHost?.id;
  const stored = await chrome.storage.local.get({ overlayEnabled: true });
  toggle.checked = YTunesHosts.overlayOn(stored.overlayEnabled, hostId);
  toggle.addEventListener("change", async () => {
    const current = await chrome.storage.local.get({ overlayEnabled: true });
    await chrome.storage.local.set({
      overlayEnabled: YTunesHosts.overlayPatch(
        current.overlayEnabled,
        hostId,
        toggle.checked
      ),
    });
    window.close();
  });
}

function paintHostDock(currentId) {
  const dock = document.getElementById("host-dock");
  if (!dock) return;
  dock.replaceChildren();
  for (const host of YTunesHosts.destinations()) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.hostId = host.id;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", HOST_ICONS[host.id] || HOST_ICONS.fallback);
    svg.appendChild(path);
    button.appendChild(svg);
    if (host.ready) {
      button.setAttribute("aria-label", `Open ${host.name}`);
      button.title = host.name;
      if (host.id === currentId) button.setAttribute("aria-current", "page");
      button.addEventListener("click", async () => {
        try {
          await openHost(host);
        } catch {
          window.open(host.origin, "_blank", "noopener,noreferrer");
        }
        window.close();
      });
    } else {
      button.disabled = true;
      button.classList.add("is-muted");
      button.setAttribute("aria-label", `${host.name}, coming soon`);
      button.title = `${host.name} — coming soon`;
    }
    dock.appendChild(button);
  }
}

function paintOffHost() {
  const ready = YTunesHosts.list.map((host) => host.name);
  const soon = YTunesHosts.upcoming.map((host) => host.name);
  const hint =
    soon.length > 0
      ? `Works on ${ready.join(" and ")}. ${soon.join(" and ")} coming soon.`
      : `This only works on ${ready.join(", ")}.`;
  document.getElementById("off-hint").textContent = hint;
}

chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  activeHost = YTunesHosts.forUrl(tab?.url);
  const onHost = Boolean(activeHost);
  if (onHost) configurePrefs(activeHost.id);
  document.getElementById("on-ytm").hidden = !onHost;
  document.getElementById("off-ytm").hidden = onHost;
  paintHostDock(activeHost?.id);
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
