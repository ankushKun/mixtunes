const YTM_ORIGIN = "https://music.youtube.com";

function isYouTubeMusic(url) {
  if (!url) return false;
  try {
    return new URL(url).origin === YTM_ORIGIN;
  } catch {
    return false;
  }
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

const artwork = document.getElementById("artwork");
artwork.addEventListener("error", () => {
  const src = artwork.getAttribute("src") || "";
  if (src.includes("/hq720.")) {
    artwork.src = src.replace("/hq720.", "/mqdefault.");
  }
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
    playPause.textContent = "Play/Pause";
    artwork.removeAttribute("src");
    artworkFrame.hidden = true;
    return;
  }

  const line = [status.title, status.subtitle].filter(Boolean).join(" — ");
  nowPlaying.textContent = line || "YouTube Music player is alive.";
  hostStatus.textContent = status.hasMoviePlayer
    ? "Host: player bar + movie player"
    : "Host: player bar";
  playPause.textContent = status.playing ? "Pause" : "Play";

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
