const PLAYER_BAR = "ytmusic-player-bar";
const SELECTORS = {
  previous: [".previous-button", "#previous-button"],
  playPause: [".play-pause-button", "#play-pause-button"],
  next: [".next-button", "#next-button"],
  title: [".title.ytmusic-player-bar", ".content-info-wrapper .title"],
  subtitle: [
    ".subtitle.ytmusic-player-bar",
    ".content-info-wrapper .subtitle",
    ".byline",
  ],
  artwork: [
    "#song-image img",
    ".image.ytmusic-player-bar img",
    "yt-img-shadow.ytmusic-player-bar img",
    ".thumbnail-image-wrapper img",
  ],
  time: [".time-info", "#left-controls .time-info"],
  progress: ["#progress-bar", "tp-yt-paper-slider#progress-bar"],
  volume: ["#volume-slider", "tp-yt-paper-slider#volume-slider"],
};

function firstMatch(root, selectors) {
  if (!root) return null;
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (node) return node;
  }
  return null;
}

function playerBar() {
  return document.querySelector(PLAYER_BAR);
}

function textOf(node) {
  return node?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function isPlaying(playPause) {
  const label = (
    playPause?.getAttribute("title") ||
    playPause?.getAttribute("aria-label") ||
    ""
  ).toLowerCase();
  return label.includes("pause");
}

function isArtworkSrc(src) {
  if (!src || src.startsWith("data:")) return false;
  if (src.includes("gstatic.com")) return false;
  return /ytimg|googleusercontent|ggpht/.test(src);
}

function squareArtwork(url, size = 240) {
  try {
    const parsed = new URL(url, location.href);
    if (parsed.hostname.includes("ytimg.com")) {
      parsed.pathname = parsed.pathname.replace(
        /\/(hqdefault|mqdefault|sddefault|maxresdefault|default|hq720|[0-3])(\.jpg|\.webp)$/i,
        "/hq720$2"
      );
      return parsed.toString();
    }
    if (/googleusercontent|ggpht/.test(parsed.hostname)) {
      return parsed
        .toString()
        .replace(/w\d+-h\d+/g, `w${size}-h${size}`)
        .replace(/=s\d+/g, `=s${size}`);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function srcFromImg(img, size) {
  const src = img.currentSrc || img.src || "";
  if (isArtworkSrc(src)) return squareArtwork(src, size);
  const srcset = img.getAttribute("srcset") || "";
  const last = srcset.split(",").pop()?.trim().split(/\s+/)[0] || "";
  return isArtworkSrc(last) ? squareArtwork(last, size) : "";
}

function artworkUrl(root, size) {
  if (!root) return "";
  for (const selector of SELECTORS.artwork) {
    const img = root.querySelector(selector);
    const src = img && srcFromImg(img, size);
    if (src) return src;
  }
  for (const img of root.querySelectorAll("img")) {
    const src = srcFromImg(img, size);
    if (src) return src;
  }
  return "";
}

function parseClock(value) {
  const parts = value.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((sum, n) => sum * 60 + n, 0);
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function readProgress(bar) {
  const timeText = textOf(firstMatch(bar, SELECTORS.time));
  const clock = timeText.match(/(\d+:\d+(?::\d+)?)\s*\/\s*(\d+:\d+(?::\d+)?)/);
  if (clock) {
    const current = parseClock(clock[1]);
    const duration = parseClock(clock[2]);
    return {
      current,
      duration,
      ratio: duration ? current / duration : 0,
      currentLabel: clock[1],
      durationLabel: clock[2],
    };
  }

  const slider = firstMatch(bar, SELECTORS.progress);
  const value = Number(slider?.value ?? slider?.getAttribute("aria-valuenow"));
  const max = Number(
    slider?.max ?? slider?.getAttribute("aria-valuemax") ?? 0
  );
  if (max > 0 && Number.isFinite(value)) {
    return {
      current: value,
      duration: max,
      ratio: value / max,
      currentLabel: formatClock(value),
      durationLabel: formatClock(max),
    };
  }

  return {
    current: 0,
    duration: 0,
    ratio: 0,
    currentLabel: "0:00",
    durationLabel: "0:00",
  };
}

function probe() {
  const bar = playerBar();
  const playPause = firstMatch(bar, SELECTORS.playPause);
  const player = document.querySelector("ytmusic-player");
  const subtitle = textOf(firstMatch(bar, SELECTORS.subtitle));
  const bits = subtitle.split("•").map((part) => part.trim()).filter(Boolean);
  return {
    hostAlive: Boolean(bar),
    hasMoviePlayer: Boolean(document.querySelector("#movie_player")),
    hasApp: Boolean(document.querySelector("ytmusic-app")),
    playing: isPlaying(playPause),
    title: textOf(firstMatch(bar, SELECTORS.title)),
    subtitle,
    artist: bits[0] || "",
    album: bits[1] || "",
    artwork: artworkUrl(bar, 240) || artworkUrl(player, 240),
    cover: artworkUrl(bar, 600) || artworkUrl(player, 600),
    progress: readProgress(bar),
    volume: readVolume(bar),
  };
}

function clickControl(action) {
  const bar = playerBar();
  const node = firstMatch(bar, SELECTORS[action]);
  if (!node) return false;
  node.click();
  return true;
}

function setSlider(selectors, ratio) {
  const slider = firstMatch(playerBar(), selectors);
  if (!slider) return false;
  const max = Number(slider.max ?? slider.getAttribute("max") ?? 100);
  if (!Number.isFinite(max) || max <= 0) return false;
  const value = Math.max(0, Math.min(max, ratio * max));
  slider.value = value;
  slider.setAttribute("aria-valuenow", String(value));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function seekToRatio(ratio) {
  return setSlider(SELECTORS.progress, ratio);
}

function setVolumeRatio(ratio) {
  return setSlider(SELECTORS.volume, ratio);
}

function readVolume(bar) {
  const slider = firstMatch(bar, SELECTORS.volume);
  const value = Number(slider?.value ?? slider?.getAttribute("aria-valuenow"));
  const max = Number(slider?.max ?? slider.getAttribute("aria-valuemax") ?? 100);
  if (!Number.isFinite(value) || max <= 0) return 80;
  return Math.round((value / max) * 100);
}

function markHostReady() {
  document.documentElement.dataset.ytunesHost = "ready";
}

function waitForPlayerBar() {
  return new Promise((resolve) => {
    if (playerBar()) {
      markHostReady();
      resolve(true);
      return;
    }

    let observer;
    let timer;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      clearTimeout(timer);
      if (ok) markHostReady();
      else document.documentElement.dataset.ytunesHost = "missing";
      resolve(ok);
    };

    observer = new MutationObserver(() => {
      if (playerBar()) finish(true);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    timer = setTimeout(() => finish(Boolean(playerBar())), 15000);
  });
}
