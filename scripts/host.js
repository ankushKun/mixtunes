const PLAYER_BAR = "ytmusic-player-bar";
const SELECTORS = {
  previous: [".previous-button", "#previous-button"],
  playPause: [".play-pause-button", "#play-pause-button"],
  next: [".next-button", "#next-button"],
  shuffle: [
    "#shuffle-button",
    ".shuffle",
    "ytmusic-player-bar .shuffle-button",
    "tp-yt-paper-icon-button.shuffle",
  ],
  repeat: [
    "#repeat-button",
    ".repeat",
    "ytmusic-player-bar .repeat",
    "tp-yt-paper-icon-button.repeat",
  ],
  like: [
    "ytmusic-like-button-renderer",
    "#like-button-renderer",
    ".like-button-renderer",
  ],
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
  progress: [
    "#progress-bar",
    "tp-yt-paper-slider#progress-bar",
    "#progress-bar-slider",
  ],
  volume: [
    "#volume-slider",
    "#expand-volume-slider",
    "tp-yt-paper-slider#volume-slider",
    "tp-yt-paper-slider#expand-volume-slider",
  ],
};

let playerSnap = null;
let playerRefresh = null;
let barMeta = { videoId: "", subtitle: "" };

function metaLooksLike(a, b) {
  const x = String(a || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const y = String(b || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

function splitByline(text) {
  return String(text || "")
    .split(/\s*[•·—–]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function queryDeep(root, selector) {
  if (!root || !selector) return null;
  const seen = new Set();
  const walk = (node) => {
    if (!node || seen.has(node)) return null;
    seen.add(node);
    try {
      const hit = node.querySelector?.(selector);
      if (hit) return hit;
    } catch {
      /* invalid selector for this root */
    }
    const kids = node.querySelectorAll?.("*") || [];
    for (const kid of kids) {
      if (kid.shadowRoot) {
        const hit = walk(kid.shadowRoot);
        if (hit) return hit;
      }
    }
    return null;
  };
  if (root.shadowRoot) {
    const hit = walk(root.shadowRoot);
    if (hit) return hit;
  }
  return walk(root);
}

function firstMatch(root, selectors) {
  if (!root || !selectors) return null;
  for (const selector of selectors) {
    const node =
      root.querySelector(selector) ||
      root.shadowRoot?.querySelector(selector) ||
      queryDeep(root, selector);
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

function videoThumb(videoId) {
  if (!videoId) return "";
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function squareArtwork(url, size = 240) {
  try {
    const parsed = new URL(url, location.href);
    if (parsed.hostname.includes("ytimg.com")) {
      // hq720 / maxres often 200-OK a gray "..." tile. hqdefault exists for almost every id.
      parsed.pathname = parsed.pathname.replace(
        /\/(hq720|maxresdefault|sddefault|mqdefault|hqdefault|default|[0-3])(\.jpg|\.webp)$/i,
        "/hqdefault$2"
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
  if (!img) return "";
  const shadow = img.closest?.("yt-img-shadow");
  const candidates = [
    img.currentSrc,
    img.getAttribute("src"),
    img.getAttribute("data-src"),
    img.getAttribute("data-thumb"),
    shadow?.src,
    shadow?.getAttribute?.("src"),
  ];
  for (const src of candidates) {
    if (isArtworkSrc(src)) return squareArtwork(src, size);
  }
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
  const parts = String(value || "")
    .split(":")
    .map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((sum, n) => sum * 60 + n, 0);
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  const max = Number(slider?.max ?? slider?.getAttribute("aria-valuemax") ?? 0);
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

function readVolume(bar) {
  const slider = firstMatch(bar, SELECTORS.volume);
  const value = Number(slider?.value ?? slider?.getAttribute("aria-valuenow"));
  const max = Number(slider?.max ?? slider?.getAttribute("aria-valuemax") ?? 100);
  if (!Number.isFinite(value) || max <= 0) return 80;
  return Math.round((value / max) * 100);
}

function labelOf(node) {
  return (
    node?.getAttribute("title") ||
    node?.getAttribute("aria-label") ||
    textOf(node) ||
    ""
  ).toLowerCase();
}

function labeledBarControl(bar, kind) {
  if (!bar) return null;
  const nodes = bar.querySelectorAll("[aria-label], [title]");
  for (const node of nodes) {
    const label = (
      node.getAttribute("aria-label") ||
      node.getAttribute("title") ||
      ""
    ).toLowerCase();
    if (!label) continue;
    if (kind === "shuffle" && label.includes("shuffle")) return node;
    if (kind === "repeat" && label.includes("repeat")) return node;
    if (kind === "dislike") {
      if (/\b(dislike|undislike|disliked)\b/.test(label)) return node;
    }
    if (kind === "like") {
      if (label.includes("dislike")) continue;
      if (/\bunlike\b/.test(label) || label === "like" || /^like /.test(label)) return node;
    }
  }
  return null;
}

function controlRoots() {
  return [
    playerBar(),
    document.querySelector("ytmusic-player-page"),
    document.querySelector("ytmusic-app"),
  ].filter(Boolean);
}

function controlNode(action) {
  for (const root of controlRoots()) {
    if (action === "like") {
      const renderer = root.querySelector("ytmusic-like-button-renderer");
      if (renderer) return renderer;
    }
    const labeled = labeledBarControl(root, action);
    if (labeled) return labeled;
    const matched = firstMatch(root, SELECTORS[action]);
    if (matched) return matched;
  }
  return null;
}

function clickTarget(node) {
  if (!node) return null;
  if (node.matches?.("ytmusic-like-button-renderer")) {
    return (
      node.querySelector(
        "#button-shape-like button, [aria-label='Like' i], [aria-label='Unlike' i], [aria-label^='Like ' i]"
      ) || node
    );
  }
  if (node.matches?.("button, [role='button']")) return node;
  return node.querySelector?.("button, [role='button']") || node;
}

function pressable(node) {
  if (!node) return null;
  return (
    node.closest?.(
      "button, [role='button'], tp-yt-paper-icon-button, yt-button-shape, ytmusic-like-button-renderer"
    ) || node
  );
}

function isPressed(node) {
  if (!node) return false;
  const target = pressable(node) || node;
  const pressed =
    target.getAttribute("aria-pressed") ||
    target.getAttribute("aria-checked") ||
    node.getAttribute("aria-pressed") ||
    node.getAttribute("aria-checked");
  if (pressed === "true") return true;
  if (pressed === "false") return false;
  if (target.classList.contains("active") || target.hasAttribute("selected")) return true;
  const label = labelOf(target) || labelOf(node);
  if (label.includes("shuffle")) {
    if (label.includes("off") || label.includes("enable") || label.includes("turn on")) {
      return false;
    }
    if (label.includes("on") || label.includes("disable") || label.includes("unshuffle")) {
      return true;
    }
  }
  return false;
}

function readRepeat(node) {
  const label = labelOf(node);
  if (label.includes("one")) return "one";
  if (label.includes("all") || (isPressed(node) && !label.includes("off"))) {
    return "all";
  }
  return "off";
}

function readLike() {
  const renderers = document.querySelectorAll("ytmusic-like-button-renderer");
  for (const renderer of renderers) {
    const status = String(
      renderer.getAttribute("like-status") ||
        renderer.getAttribute("like_status") ||
        renderer.likeStatus ||
        renderer.likeStatus_ ||
        ""
    ).toUpperCase();
    if (status === "LIKE" || status === "DISLIKE") return status.toLowerCase();
    const label = labelOf(renderer) || labelOf(renderer.querySelector?.("[aria-label]"));
    if (label.includes("unlike") || label.includes("remove like") || label.includes("liked")) {
      return "like";
    }
  }
  const node = controlNode("like");
  if (!node) return "indifferent";
  const renderer = node.closest?.("ytmusic-like-button-renderer") || node;
  const status = String(
    renderer.getAttribute("like-status") ||
      renderer.getAttribute("like_status") ||
      node.getAttribute("like-status") ||
      ""
  ).toUpperCase();
  if (status === "LIKE" || status === "DISLIKE") return status.toLowerCase();
  const label = labelOf(node) || labelOf(renderer);
  if (label.includes("unlike") || label.includes("liked")) return "like";
  if (label.includes("undislike") || label.includes("disliked")) return "dislike";
  return "indifferent";
}

function progressFromSnap(snap) {
  const current = snap.current || 0;
  const duration = snap.duration || 0;
  return {
    current,
    duration,
    ratio: duration ? current / duration : 0,
    currentLabel: formatClock(current),
    durationLabel: formatClock(duration),
  };
}

function refreshPlayerSnap(force) {
  if (!force && playerRefresh) return playerRefresh;
  if (typeof YTM === "undefined") return Promise.resolve(null);
  playerRefresh = YTM.player({ method: "get" })
    .then((snap) => {
      playerSnap = snap || null;
      return playerSnap;
    })
    .catch(() => {
      playerSnap = null;
      return null;
    })
    .finally(() => {
      playerRefresh = null;
    });
  return playerRefresh;
}

function probe() {
  const bar = playerBar();
  const playPause = firstMatch(bar, SELECTORS.playPause);
  const player = document.querySelector("ytmusic-player");
  const snap = playerSnap;
  const barTitle = textOf(firstMatch(bar, SELECTORS.title));
  const barSubtitle = textOf(firstMatch(bar, SELECTORS.subtitle));
  const barProgress = readProgress(bar);
  const snapTitle = snap?.title && snap.videoId ? snap.title : "";
  const snapAuthor = String(snap?.author || "").trim();
  const title = snapTitle || barTitle;
  const videoId = snap?.videoId || "";
  const barTitleOk = !snapTitle || !barTitle || metaLooksLike(snapTitle, barTitle);
  const barStillOld =
    Boolean(videoId && barSubtitle && videoId !== barMeta.videoId && barSubtitle === barMeta.subtitle);
  const barFresh = Boolean(barSubtitle && barTitleOk && !barStillOld);
  const subtitle = barFresh
    ? barSubtitle
    : [snapAuthor, title].filter(Boolean).join(" • ");
  const bits = splitByline(barFresh ? barSubtitle : "");
  const year = bits.find((bit) => /^\d{4}$/.test(bit)) || "";
  const artist = (barFresh && bits[0]) || snapAuthor || "";
  const album = barFresh ? bits.slice(1).find((bit) => bit !== year) || "" : "";
  if (barFresh) {
    barMeta.videoId = videoId;
    barMeta.subtitle = barSubtitle;
  }

  return {
    hostAlive: Boolean(bar),
    hasMoviePlayer: Boolean(document.querySelector("#movie_player") || snap?.hasPlayer),
    hasApp: Boolean(document.querySelector("ytmusic-app")),
    playing: snap && typeof snap.playing === "boolean" ? snap.playing : isPlaying(playPause),
    title,
    subtitle,
    artist,
    album,
    year,
    author: snapAuthor,
    videoId,
    playlistId: snap?.playlistId || "",
    artwork:
      (snap?.thumbnail && isArtworkSrc(snap.thumbnail)
        ? squareArtwork(snap.thumbnail, 240)
        : "") ||
      artworkUrl(bar, 240) ||
      artworkUrl(player, 240) ||
      videoThumb(snap?.videoId),
    cover:
      (snap?.thumbnail && isArtworkSrc(snap.thumbnail)
        ? squareArtwork(snap.thumbnail, 600)
        : "") ||
      artworkUrl(bar, 600) ||
      artworkUrl(player, 600) ||
      videoThumb(snap?.videoId),
    progress: snap?.duration > 0 ? progressFromSnap(snap) : barProgress,
    volume:
      typeof snap?.volume === "number"
        ? Math.round(snap.volume)
        : readVolume(bar),
    shuffle: isPressed(controlNode("shuffle")),
    repeat: readRepeat(controlNode("repeat")),
    liked: readLike(),
  };
}

function clickControl(action) {
  const node = clickTarget(controlNode(action));
  if (!node) return false;
  node.click();
  return true;
}

function setSlider(selectors, ratio) {
  const slider = firstMatch(playerBar(), selectors);
  if (!slider) return false;
  const max = Number(
    slider.max ?? slider.getAttribute("max") ?? slider.getAttribute("aria-valuemax") ?? 100
  );
  if (!Number.isFinite(max) || max <= 0) return false;
  const value = Math.max(0, Math.min(max, ratio * max));
  try {
    slider.value = value;
    slider.immediateValue = value;
  } catch {
    /* Polymer sliders may reject isolated-world writes */
  }
  slider.setAttribute("aria-valuenow", String(value));
  slider.setAttribute("value", String(value));
  const opts = { bubbles: true, composed: true };
  slider.dispatchEvent(new Event("input", opts));
  slider.dispatchEvent(new Event("change", opts));
  slider.dispatchEvent(new CustomEvent("immediate-value-change", { ...opts, detail: value }));
  slider.dispatchEvent(new CustomEvent("value-change", { ...opts, detail: value }));
  return true;
}

async function playerMethod(payload) {
  if (typeof YTM === "undefined") return null;
  try {
    return await YTM.player(payload);
  } catch {
    return null;
  }
}

async function controlPlayback(action) {
  const methods = {
    playPause: { method: "playPause" },
    pause: { method: "pause" },
    play: { method: "play" },
    next: { method: "next" },
    previous: { method: "previous" },
  };
  const payload = methods[action];
  if (payload) {
    const result = await playerMethod(payload);
    if (result?.ok) {
      await refreshPlayerSnap();
      return true;
    }
  }
  const ok = clickControl(action);
  if (ok) await refreshPlayerSnap();
  return ok;
}

async function seekToRatio(ratio) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  const duration =
    Number(playerSnap?.duration) || Number(probe()?.progress?.duration) || 0;
  const result = await playerMethod({
    method: "seek",
    seconds: duration > 0 ? clamped * duration : undefined,
    ratio: clamped,
  });
  if (result?.ok) {
    await refreshPlayerSnap();
    return true;
  }
  return setSlider(SELECTORS.progress, clamped);
}

async function setVolumeRatio(ratio) {
  const volume = Math.max(0, Math.min(100, Math.round(Number(ratio) * 100)));
  if (playerSnap) {
    playerSnap = { ...playerSnap, volume, muted: volume === 0 };
  }
  const result = await playerMethod({ method: "volume", volume });
  if (result?.ok) {
    await refreshPlayerSnap(true);
    if (playerSnap) {
      playerSnap = { ...playerSnap, volume, muted: volume === 0 };
    }
    return true;
  }
  return setSlider(SELECTORS.volume, volume / 100);
}

function markHostReady() {
  document.documentElement.dataset.ytunesHost = "ready";
}

function markHostIdle() {
  delete document.documentElement.dataset.ytunesHost;
}

function waitForPlayerBar() {
  return new Promise((resolve) => {
    if (playerBar()) {
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
