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
    // `trackId` is the host-neutral now-playing key. On YouTube Music it is the
    // video id, so `videoId` stays as an alias for the popup and play counter.
    trackId: videoId,
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

/**
 * The single object the iTunes chrome talks to. Only one adapter is ever loaded —
 * the manifest picks it by origin — so this is always "the current host".
 *
 * The shell must never reach past this object into YouTube Music: no InnerTube
 * bodies, no browse ids, no `ytmusic-*` selectors, no watch endpoints. Anything
 * the shell needs that is host-shaped belongs here as a method.
 *
 * Adding a host means writing this object for that site: a catalog reader, a real
 * player, and a boot/probe. It is not a config file. What you get for free is the
 * entire chrome — Cover Flow, the track table, the LCD, dialogs, and orchestration.
 */
// Teach the isolated world's playback-core what a YouTube Music id looks like. The
// MAIN world cannot share this instance, so page-core.js carries its own copy.
YTunesPlayback.configure(YTunesYtmIds);

globalThis.MusicHost = (() => {
  const host = YTunesHosts.byId("ytm");

  function queryIn(node, selector) {
    if (!node) return null;
    return node.shadowRoot?.querySelector(selector) || node.querySelector(selector) || null;
  }

  /**
   * The nav bar re-renders often and its right side lives in a shadow root, so the
   * slot is resolved fresh on every placement and reports the nodes worth observing.
   */
  function findLaunchSlot() {
    const bar = document.querySelector("ytmusic-nav-bar");
    if (!bar) return null;
    const right = queryIn(bar, "#right-content") || queryIn(bar, ".right-content");
    const before =
      queryIn(right || bar, "ytmusic-cast-button") ||
      queryIn(bar, "ytmusic-cast-button") ||
      queryIn(right || bar, "ytmusic-settings-button") ||
      queryIn(bar, "ytmusic-settings-button");
    const watch = [bar, bar.shadowRoot].filter(Boolean);
    if (before?.parentNode) return { parent: before.parentNode, before, watch };
    if (right) return { parent: right, before: right.firstElementChild, watch };
    return null;
  }

  function trackId(track) {
    return YTunesPlayback.trackId(track);
  }

  /**
   * Turn a track plus a resolved context into the watch endpoint YouTube Music
   * navigates to. This is the only place a watch endpoint is built.
   */
  function sendPlay(track, listId, index, ownList) {
    const endpoint = track.endpoint ? { ...track.endpoint } : {};
    const watch = {
      ...(endpoint.watchEndpoint || {}),
      videoId: trackId(track) || endpoint.watchEndpoint?.videoId,
    };
    if (listId && !ownList) watch.playlistId = YTunesYtmIds.listId(listId);
    else if (ownList) delete watch.playlistId;
    if (Number.isFinite(index) && index >= 0) watch.index = index;
    if (watch.videoId) endpoint.watchEndpoint = watch;
    if (!endpoint.watchEndpoint && !endpoint.browseEndpoint) {
      return Promise.reject(new Error("Nothing to play"));
    }
    YTM.invalidateQueue();
    return YTM.play({ endpoint, ownList: Boolean(ownList) });
  }

  /**
   * Only send a position when the host is playing its own queue for a list we can
   * count. Sending one for a radio or an overlay-driven roster makes YTM jump.
   */
  function wireIndex(ctx, track, context) {
    const trusted =
      !ctx.ownList &&
      ctx.mode === "queue" &&
      ["playlist", "liked", "album"].includes(context.source);
    if (!trusted) return undefined;
    const id = trackId(track);
    const at = (ctx.tracks || []).findIndex((item) => trackId(item) === id);
    return at >= 0 ? at : context.fallbackIndex;
  }

  function hostStatusShuffle() {
    return isPressed(controlNode("shuffle"));
  }

  function rootNodes() {
    const root = document.getElementById("ytunes-root");
    return [root, root?.querySelector(".ytunes-transport")].filter(Boolean);
  }

  return {
    id: host.id,
    name: host.name,
    strings: host.strings,
    escapeParam: host.escapeParam,
    hideSheet: "scripts/hosts/ytm/hide.css",

    /**
     * Sources and actions the chrome may offer. A missing capability hides UI; it
     * never fakes data. A host without lyrics simply has no lyrics pane.
     */
    capabilities: {
      sources: [
        "home",
        "explore",
        "charts",
        "songs",
        "liked",
        "albums",
        "artists",
        "videos",
        "podcasts",
        "mixes",
        "recents",
        "playlist",
        "album",
        "artist",
        "mood",
        "search",
        "now",
        "radio",
      ],
      lyrics: true,
      like: true,
      dislike: true,
      enqueue: true,
      playlistEdit: true,
      signedIn: true,
      radio: true,
      automix: true,
      shuffle: true,
      repeat: true,
      seek: true,
      volume: true,
    },

    // --- boot -------------------------------------------------------------

    /** Resolves once the host's own player exists and can take commands. */
    waitUntilReady() {
      return waitForPlayerBar();
    },

    /**
     * Where the launch button goes while the overlay is off.
     * @returns {{ parent: Node, before: Node|null, watch: Node[] }|null}
     */
    launchSlot() {
      return findLaunchSlot();
    },

    markReady: markHostReady,
    markIdle: markHostIdle,

    /** True when the player bar shows the site's own name instead of a track. */
    isIdleTitle(title) {
      return YTunesYtmIds.idleTitle(title);
    },

    // --- catalog ----------------------------------------------------------

    browse: YtmCatalog.browse,
    search: YtmCatalog.search,
    suggest: YtmCatalog.suggest,
    playlists: YtmCatalog.playlists,
    moods: YtmCatalog.moods,
    collectionQuery: YtmCatalog.collectionQuery,
    listIdFor: YtmCatalog.listIdFor,
    isSongCover: YtmCatalog.isSongCover,
    trackFromCover: YtmCatalog.trackFromCover,
    albumOf: YtmCatalog.albumOf,
    artistOf: YtmCatalog.artistOf,
    signedIn: YtmCatalog.signedIn,
    lyrics: YtmCatalog.lyrics,

    /**
     * List ids that duplicate a built-in sidebar source, so the dynamic
     * playlist list can drop them (e.g. the liked-songs playlist is already
     * the Liked Songs source). Values are host list ids; the shell compares
     * canonically.
     */
    builtinLists() {
      return { liked: "VLLM", listenLater: "VLLL" };
    },

    // --- playback ---------------------------------------------------------

    /**
     * Start a track. The host decides whether that means an endless radio, its own
     * queue for a concrete list, or a roster the overlay advances itself.
     *
     * @param {object} args
     * @param {object} args.track
     * @param {object} args.context iTunes view state the decision needs:
     *   `source`, `playlistId`, `session`, `cover`, `sessionTracks`,
     *   `mixedStorefront`, and `fallbackIndex` (the shell's own row position).
     * @returns {Promise<{mode: string, listId: string, tracks: object[], ownList: boolean}>}
     *   the resolved context, so the shell can record the session it just started.
     */
    async play({ track, context = {} }) {
      if (!track) return null;
      const ctx = YTunesPlayback.resolvePlayContext(
        {
          source: context.source,
          playlistId: context.playlistId,
          session: context.session,
        },
        track,
        {
          cover: context.cover,
          sessionTracks: context.sessionTracks,
          mixedStorefront: context.mixedStorefront,
        }
      );
      await sendPlay(track, ctx.ownList ? "" : ctx.listId, wireIndex(ctx, track, context), ctx.ownList);
      return ctx;
    },

    /** Resume a remembered track without the overlay's session machinery. */
    resume(track) {
      const id = trackId(track);
      if (!id) return Promise.reject(new Error("Nothing to play"));
      return YTM.play({
        endpoint: {
          watchEndpoint: {
            videoId: id,
            playlistId: YTunesYtmIds.listId(track?.playlistId) || undefined,
          },
        },
      });
    },

    /** Load a track into the player without starting playback. */
    cue(track) {
      const id = trackId(track);
      if (!id) return Promise.resolve(null);
      return YTM.cue({
        videoId: id,
        playlistId: YTunesYtmIds.listId(track?.playlistId) || undefined,
      });
    },

    /** The station id for a track without starting it, or "" when there is none. */
    radioListFor(track) {
      return YTunesYtmIds.radioFor(trackId(track));
    },

    /**
     * Play a track's station.
     * @returns {Promise<{listId: string, trackId: string}|null>} null when this host
     *   cannot build a station for the track.
     */
    async startRadio(track) {
      const id = trackId(track);
      const listId = YTunesYtmIds.radioFor(id);
      if (!listId) return null;
      try {
        await YTM.play({
          endpoint: { watchEndpoint: { videoId: id, playlistId: listId } },
          ownList: false,
        });
      } catch {
        /* the Now Playing view still opens on the new list */
      }
      return { listId, trackId: id };
    },

    queue(id, listId) {
      return YTM.queueCached(id, YTunesYtmIds.listId(listId));
    },

    playerQueue() {
      return YTM.playerQueue();
    },

    invalidateQueue() {
      YTM.invalidateQueue();
    },

    // --- transport --------------------------------------------------------

    probe,

    /** Re-read the host player so the next probe() is fresh. */
    refreshStatus(force) {
      return refreshPlayerSnap(force);
    },

    control(action) {
      return controlPlayback(action);
    },

    seek(ratio) {
      return seekToRatio(ratio);
    },

    volume(ratio) {
      return setVolumeRatio(ratio);
    },

    /**
     * Shuffle the host's own queue. The overlay shuffles its own roster itself, so
     * this only matters while YouTube Music is driving playback.
     */
    setShuffle(on) {
      if (Boolean(on) === Boolean(hostStatusShuffle())) return false;
      return clickControl("shuffle");
    },

    /**
     * YouTube Music has no "set repeat" API, only a three-state button, so cycle it
     * until it lands. The shell must not know that.
     * @returns {Promise<string>} the mode actually reached.
     */
    async setRepeat(mode) {
      const want = mode === "one" || mode === "all" ? mode : "off";
      for (let i = 0; i < 3; i += 1) {
        clickControl("repeat");
        await refreshPlayerSnap();
        if ((probe().repeat || "off") === want) break;
      }
      return probe().repeat || "off";
    },

    /**
     * Publish the roster the MAIN world reads when it advances tracks. Ids travel as
     * a comma-joined string, which is safe for YouTube Music's ids; a host with
     * comma-bearing ids must encode them here, not in the shell.
     *
     * @param {{ids: string[], listId: string, ownList: boolean, mode: string,
     *   playingId: string}} roster
     * @returns {{ids: string[], index: number}} the accepted roster and the position
     *   the host believes is playing, accounting for an in-flight skip.
     */
    syncSkipRoster({ ids, listId, ownList, mode, playingId } = {}) {
      const roster = (ids || []).map(String).filter((id) => YTunesYtmIds.playable(id));
      const list = YTunesYtmIds.listId(listId);
      const skipList = ownList ? (YTunesYtmIds.isConcreteList(list) ? list : "") : list;
      const nodes = rootNodes();
      const pendingId = nodes.map((node) => node.dataset.pendingSkip).find(Boolean) || "";
      const pendingUntil = Number(
        nodes.map((node) => node.dataset.pendingSkipUntil).find(Boolean) || 0
      );
      const index = YTunesPlayback.skipIndexAfterPending(
        roster,
        playingId || "",
        pendingId,
        pendingUntil,
        Date.now()
      );
      const expired = Boolean(pendingId) && Date.now() >= pendingUntil;
      for (const node of nodes) {
        if (expired) {
          delete node.dataset.pendingSkip;
          delete node.dataset.pendingSkipUntil;
        }
        if (roster.length) node.dataset.skipIds = roster.join(",");
        else delete node.dataset.skipIds;
        if (skipList) node.dataset.skipPlaylist = skipList;
        else delete node.dataset.skipPlaylist;
        if (ownList) node.dataset.ownList = "1";
        else delete node.dataset.ownList;
        const session = mode || (ownList ? "list" : "queue");
        if (session) node.dataset.sessionMode = session;
        else delete node.dataset.sessionMode;
        if (index >= 0) node.dataset.skipIndex = String(index);
        else delete node.dataset.skipIndex;
      }
      return { ids: roster, index };
    },

    /** The host may switch itself to a station when an overlay roster runs out. */
    forcedSessionMode() {
      return document.getElementById("ytunes-root")?.dataset?.sessionMode || "";
    },

    // --- library writes ---------------------------------------------------

    /**
     * Rate a track. When the API call fails for the track that is playing, fall
     * back to the player bar's own button so the rating still lands.
     */
    async like(track, rating) {
      const id = trackId(track);
      if (!id) throw new Error("No track");
      try {
        return await YTM.like(id, rating);
      } catch (error) {
        if (probe().trackId === id) {
          clickControl(rating === "dislike" ? "dislike" : "like");
        }
        throw error;
      }
    },

    enqueue(track, position) {
      const id = trackId(track);
      if (!id) return Promise.reject(new Error("No track"));
      return YTM.enqueue(id, position);
    },

    async createPlaylist(title) {
      const result = await YTM.createPlaylist(title);
      YtmCatalog.forgetPlaylists();
      return YTunesYtmIds.listId(result?.playlistId || result?.id);
    },

    async addToPlaylist(playlistId, track) {
      const id = trackId(track);
      if (!id) return Promise.reject(new Error("No track"));
      return YTM.addToPlaylist(YTunesYtmIds.listId(playlistId), id);
    },

    /** `setVideoId` is a YouTube Music row handle; the shell never sees it. */
    removeFromPlaylist(playlistId, track) {
      return YTM.removeFromPlaylist(
        YTunesYtmIds.listId(playlistId),
        track?.setVideoId,
        trackId(track)
      );
    },
  };
})();
