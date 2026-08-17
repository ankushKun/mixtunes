const REQ = "ytunes-page-req";
const RES = "ytunes-page-res";

function readDetail(event) {
  const detail = event.detail;
  if (typeof detail === "string") return JSON.parse(detail);
  return detail;
}

function cookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function sha1Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sapisidHash() {
  const sapisid = cookie("SAPISID") || cookie("__Secure-3PAPISID");
  if (!sapisid) return "";
  const origin = "https://music.youtube.com";
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = await sha1Hex(`${timestamp} ${sapisid} ${origin}`);
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

function ytcfgData() {
  return window.ytcfg?.data_ || {};
}

function innertubeContext() {
  const data = ytcfgData();
  if (data.INNERTUBE_CONTEXT) return data.INNERTUBE_CONTEXT;
  return {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: data.INNERTUBE_CLIENT_VERSION || "1.20240601.00.00",
      hl: document.documentElement.lang || "en",
    },
  };
}

async function innertube(endpoint, payload) {
  const started = Date.now();
  while (
    Date.now() - started < 8000 &&
    !ytcfgData().INNERTUBE_API_KEY &&
    !ytcfgData().INNERTUBE_CONTEXT
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const data = ytcfgData();
  const key = data.INNERTUBE_API_KEY || "";
  const visitor =
    data.VISITOR_DATA || data.INNERTUBE_CONTEXT?.client?.visitorData || "";
  const version =
    data.INNERTUBE_CLIENT_VERSION ||
    data.INNERTUBE_CONTEXT?.client?.clientVersion ||
    "";
  const auth = await sapisidHash();
  const url = new URL(`/youtubei/v1/${endpoint}`, location.origin);
  url.searchParams.set("prettyPrint", "false");
  if (key) url.searchParams.set("key", key);

  const headers = {
    "Content-Type": "application/json",
    "X-YouTube-Client-Name": "67",
    Origin: location.origin,
  };
  if (version) headers["X-YouTube-Client-Version"] = version;
  if (visitor) headers["X-Goog-Visitor-Id"] = visitor;
  if (auth) headers.Authorization = auth;

  const response = await fetch(url.toString(), {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ context: innertubeContext(), ...payload }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    const message = json?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return json;
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

function playerApiFrom(node) {
  if (!node) return null;
  const keys = ["playerApi", "playerApi_", "player", "player_"];
  for (const key of keys) {
    try {
      const value = typeof node[key] === "function" ? node[key]() : node[key];
      if (
        value &&
        (typeof value.seekTo === "function" ||
          typeof value.setVolume === "function" ||
          typeof value.getPlayerState === "function")
      ) {
        return value;
      }
    } catch {
      /* property may be a broken getter */
    }
  }
  return null;
}

let cachedMoviePlayer = null;

function moviePlayer() {
  const cached = cachedMoviePlayer;
  if (
    cached &&
    cached.isConnected !== false &&
    (typeof cached.seekTo === "function" ||
      typeof cached.setVolume === "function" ||
      typeof cached.getPlayerState === "function" ||
      cached.id === "movie_player")
  ) {
    return cached;
  }
  const direct = document.querySelector("#movie_player");
  if (direct) {
    cachedMoviePlayer = direct;
    return direct;
  }
  const hosts = [
    document.querySelector("ytmusic-player"),
    document.querySelector("ytmusic-player-page"),
    document.querySelector("ytmusic-player-bar"),
    document.querySelector("ytmusic-app"),
  ];
  for (const host of hosts) {
    if (!host) continue;
    const api = playerApiFrom(host);
    if (api) {
      cachedMoviePlayer = api;
      return api;
    }
    const inner =
      host.shadowRoot?.querySelector("#movie_player") ||
      host.querySelector("#movie_player") ||
      queryDeep(host, "#movie_player");
    if (inner) {
      cachedMoviePlayer = inner;
      return inner;
    }
  }
  cachedMoviePlayer = null;
  return null;
}

function mediaElement() {
  const player = moviePlayer();
  const fromPlayer =
    player?.querySelector?.("video, audio") ||
    (player?.shadowRoot && queryDeep(player, "video, audio"));
  if (fromPlayer) return fromPlayer;
  const hosts = [
    document.querySelector("ytmusic-player"),
    document.querySelector("ytmusic-player-page"),
    document.querySelector("ytmusic-app"),
  ];
  for (const host of hosts) {
    if (!host) continue;
    const media =
      host.querySelector("video.html5-main-video, video, audio") ||
      host.shadowRoot?.querySelector("video.html5-main-video, video, audio") ||
      queryDeep(host, "video.html5-main-video") ||
      queryDeep(host, "video");
    if (media) return media;
  }
  return null;
}

function findBarSlider(kind) {
  const bar = document.querySelector("ytmusic-player-bar");
  if (!bar) return null;
  const selectors =
    kind === "volume"
      ? [
          "#volume-slider",
          "#expand-volume-slider",
          "tp-yt-paper-slider#volume-slider",
          "tp-yt-paper-slider#expand-volume-slider",
        ]
      : [
          "#progress-bar",
          "tp-yt-paper-slider#progress-bar",
          "#progress-bar-slider",
        ];
  for (const selector of selectors) {
    const node =
      bar.querySelector(selector) ||
      bar.shadowRoot?.querySelector(selector) ||
      queryDeep(bar, selector);
    if (node) return node;
  }
  return null;
}

function setPaperSlider(slider, ratio) {
  if (!slider) return false;
  const max = Number(
    slider.max ?? slider.getAttribute("max") ?? slider.getAttribute("aria-valuemax") ?? 100
  );
  if (!Number.isFinite(max) || max <= 0) return false;
  const value = Math.max(0, Math.min(max, Number(ratio) * max));
  try {
    if (typeof slider.set === "function") slider.set("value", value);
  } catch {
    /* Polymer set() may reject */
  }
  try {
    slider.value = value;
    slider.immediateValue = value;
  } catch {
    /* some sliders are read-only from this realm */
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

function callPlayer(name, ...args) {
  const player = moviePlayer();
  if (!player || typeof player[name] !== "function") return undefined;
  try {
    return player[name](...args);
  } catch {
    return undefined;
  }
}

function ran(name, ...args) {
  const player = moviePlayer();
  if (!player || typeof player[name] !== "function") return false;
  try {
    player[name](...args);
    return true;
  } catch {
    return false;
  }
}

function applySeek(payload) {
  const media = mediaElement();
  const duration =
    Number(callPlayer("getDuration")) ||
    Number(media?.duration) ||
    0;
  let seconds = Number(payload?.seconds);
  if (!Number.isFinite(seconds) && Number.isFinite(Number(payload?.ratio)) && duration > 0) {
    seconds = Number(payload.ratio) * duration;
  }
  if (!Number.isFinite(seconds)) return false;
  if (duration > 0) seconds = Math.max(0, Math.min(duration, seconds));
  else seconds = Math.max(0, seconds);
  let ok = ran("seekTo", seconds, true) || ran("seekTo", seconds);
  if (media && Number.isFinite(media.duration)) {
    try {
      media.currentTime = seconds;
      ok = true;
    } catch {
      /* media may reject seeks while loading */
    }
  }
  if (duration > 0) ok = setPaperSlider(findBarSlider("progress"), seconds / duration) || ok;
  return ok;
}

function applyVolume(payload) {
  const volume = Math.max(0, Math.min(100, Math.round(Number(payload?.volume))));
  if (!Number.isFinite(volume)) return false;
  if (volume > 0) ran("unMute");
  else ran("mute");
  let ok = ran("setVolume", volume);
  const media = mediaElement();
  if (media) {
    try {
      media.muted = volume === 0;
      media.volume = volume / 100;
      ok = true;
    } catch {
      /* media volume may be locked */
    }
  }
  if (!ok) ok = setPaperSlider(findBarSlider("volume"), volume / 100);
  return ok;
}

function playerThumbnail() {
  try {
    const thumbs =
      moviePlayer()?.getPlayerResponse?.()?.videoDetails?.thumbnail?.thumbnails ||
      [];
    return thumbs.length ? thumbs[thumbs.length - 1].url || "" : "";
  } catch {
    return "";
  }
}

function playerSnapshot() {
  const data = callPlayer("getVideoData") || {};
  const state = callPlayer("getPlayerState");
  const media = mediaElement();
  const current = Number(callPlayer("getCurrentTime") ?? media?.currentTime);
  const duration = Number(callPlayer("getDuration") ?? media?.duration);
  const rawVolume = callPlayer("getVolume");
  const volume = Number(
    rawVolume ?? (media ? (media.muted ? 0 : media.volume * 100) : NaN)
  );
  const videoId = data.video_id || data.videoId || "";
  const playlist = callPlayer("getPlaylist");
  const playing =
    state === 1 || (state == null && media ? !media.paused && !media.ended : false);
  return {
    hasPlayer: Boolean(moviePlayer() || media),
    videoId,
    title: data.title || "",
    author: data.author || "",
    playing,
    current: Number.isFinite(current) ? current : 0,
    duration: Number.isFinite(duration) ? duration : 0,
    volume: Number.isFinite(volume) ? volume : null,
    muted: Boolean(callPlayer("isMuted") ?? media?.muted),
    thumbnail: playerThumbnail(),
    playlistId: data.list || callPlayer("getPlaylistId") || "",
    playlistIds: Array.isArray(playlist) ? playlist.filter(Boolean) : [],
  };
}

function queueItemText(item, selectors) {
  for (const selector of selectors) {
    const text = item.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function watchFrom(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (node.watchEndpoint?.videoId) return node.watchEndpoint;
  if (node.navigationEndpoint?.watchEndpoint?.videoId) {
    return node.navigationEndpoint.watchEndpoint;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = watchFrom(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const child of Object.values(node)) {
    if (child && typeof child === "object") {
      const found = watchFrom(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function runsJoin(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.text && !node.runs) return String(node.text);
  return (node.runs || []).map((run) => run.text || "").join("");
}

function trackFromPanel(panel) {
  if (!panel || typeof panel !== "object") return null;
  const watch = watchFrom(panel) || {};
  const videoId = String(watch.videoId || "").trim();
  const title = runsJoin(panel.title);
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const byline = runsJoin(panel.longBylineText || panel.shortBylineText);
  const bits = byline.split("•").map((part) => part.trim()).filter(Boolean);
  const thumbs =
    panel.thumbnail?.thumbnails ||
    panel.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    [];
  return {
    id: videoId || `q:${title}`,
    title: title || videoId,
    artist: bits[0] || runsJoin(panel.shortBylineText) || "",
    album: bits.find((bit, i) => i > 0 && !/^\d{4}$/.test(bit)) || "",
    duration: runsJoin(panel.lengthText),
    artwork: thumbs.length ? thumbs[thumbs.length - 1].url || "" : "",
    videoId,
    playlistId: watch.playlistId || "",
    endpoint: { watchEndpoint: watch.videoId ? watch : { videoId } },
  };
}

function trackFromQueueItem(item) {
  const data = item.data || item.__data?.data || item.__data || {};
  const panel =
    data.playlistPanelVideoRenderer ||
    data.primaryRenderer?.playlistPanelVideoRenderer ||
    null;
  const fromPanel = trackFromPanel(panel);
  const videoId = String(
    fromPanel?.videoId || item.videoId || item.getAttribute?.("video-id") || ""
  ).trim();
  const title =
    queueItemText(item, [
      ".song-title",
      "#song-title",
      "yt-formatted-string.song-title",
    ]) ||
    fromPanel?.title ||
    "";
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const byline = queueItemText(item, [
    ".byline",
    ".subtitle",
    ".secondary-flex-columns",
  ]);
  const bits = byline.split("•").map((part) => part.trim()).filter(Boolean);
  return {
    id: videoId || fromPanel?.id || `q:${title}`,
    title: title || fromPanel?.title || videoId,
    artist: bits[0] || fromPanel?.artist || "",
    album:
      bits.find((bit, i) => i > 0 && !/^\d{4}$/.test(bit)) ||
      fromPanel?.album ||
      "",
    duration:
      queueItemText(item, [".duration", ".time", ".song-info-duration"]) ||
      fromPanel?.duration ||
      "",
    artwork: fromPanel?.artwork || "",
    videoId,
    playlistId: fromPanel?.playlistId || "",
    endpoint: fromPanel?.endpoint || {
      watchEndpoint: { videoId },
    },
  };
}

function collectQueueItems(root) {
  if (!root) return [];
  const items = [];
  const pushAll = (node) => {
    if (!node?.querySelectorAll) return;
    node.querySelectorAll("ytmusic-player-queue-item").forEach((item) => {
      items.push(item);
    });
  };
  pushAll(root);
  if (root.shadowRoot) pushAll(root.shadowRoot);
  return items;
}

function playerQueueElements() {
  const seen = new Set();
  const queues = [];
  const addAll = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("ytmusic-player-queue").forEach((queue) => {
      if (seen.has(queue)) return;
      seen.add(queue);
      queues.push(queue);
    });
  };
  addAll(document);
  const page = document.querySelector("ytmusic-player-page");
  addAll(page);
  addAll(page?.shadowRoot);
  return queues;
}

function queueItemNodes() {
  const seen = new Set();
  const items = [];
  const add = (item) => {
    if (!item || seen.has(item)) return;
    seen.add(item);
    items.push(item);
  };
  playerQueueElements().forEach((queue) => {
    collectQueueItems(queue).forEach(add);
  });
  return items;
}

function polymerBlob(el) {
  if (!el) return null;
  try {
    return (
      el.queueDatas ||
      el.queueData ||
      el.data ||
      el.__data?.data ||
      el.__data ||
      null
    );
  } catch {
    return null;
  }
}

function queueDataRoots() {
  const roots = [];
  const add = (node) => {
    if (node && typeof node === "object") roots.push(node);
  };
  playerQueueElements().forEach((queue) => add(polymerBlob(queue)));
  return roots;
}

function tracksFromQueueData(root) {
  const tracks = [];
  const seen = new Set();
  const seenNodes = new WeakSet();
  const remember = (track) => {
    if (!track) return;
    const key = String(track.videoId || "").trim();
    if (!/^[\w-]{11}$/.test(key) || seen.has(key)) return;
    seen.add(key);
    tracks.push(track);
  };
  const walk = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 14) return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    if (node.automixPreviewVideoRenderer) return;
    if (node.playlistPanelVideoRenderer) {
      remember(trackFromPanel(node.playlistPanelVideoRenderer));
      return;
    }
    const wrapper = node.playlistPanelVideoWrapperRenderer;
    if (wrapper) {
      walk(wrapper.primaryRenderer, depth + 1);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, depth + 1));
      return;
    }
    for (const child of Object.values(node)) {
      if (child && typeof child === "object") walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return tracks;
}

function uniqueQueueTracks(parts) {
  const tracks = [];
  const seen = new Set();
  for (const track of parts) {
    const key = String(track.videoId || "").trim();
    if (!/^[\w-]{11}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    tracks.push({ ...track, videoId: key, id: key });
  }
  return tracks;
}

function readPlayerQueue() {
  const fromDom = [];
  queueItemNodes().forEach((item) => {
    const track = trackFromQueueItem(item);
    if (track) fromDom.push(track);
  });
  const fromData = [];
  queueDataRoots().forEach((root) => {
    tracksFromQueueData(root).forEach((track) => fromData.push(track));
  });
  const primary = fromDom.length > 1 ? fromDom : fromData;
  const secondary = fromDom.length > 1 ? fromData : fromDom;
  const tracks = uniqueQueueTracks(primary.concat(secondary));
  return {
    tracks,
    playlistId: tracks.find((track) => track.playlistId)?.playlistId || "",
  };
}

let autoplayArmed = true;

function allowUserPlayback() {
  autoplayArmed = false;
}

function markGesture() {
  allowUserPlayback();
  document.documentElement.dataset.ytunesGesture = String(Date.now());
}

function pauseAutoplay() {
  if (!autoplayArmed) return;
  if (callPlayer("getPlayerState") === 1) callPlayer("pauseVideo");
  document.querySelectorAll("video, audio").forEach((media) => {
    try {
      if (!media.paused) media.pause();
    } catch {
      /* media element may already be tearing down */
    }
  });
}

function bindAutoplayGuard() {
  document.addEventListener(
    "playing",
    (event) => {
      if (!autoplayArmed) return;
      if (!(event.target instanceof HTMLMediaElement)) return;
      try {
        event.target.pause();
      } catch {
        /* ignore */
      }
      pauseAutoplay();
    },
    true
  );

  const hookPlayer = () => {
    const player = moviePlayer();
    if (!player || player.__ytunesNoAutoplay) return;
    player.__ytunesNoAutoplay = true;
    try {
      player.addEventListener("onStateChange", (state) => {
        if (autoplayArmed && state === 1) pauseAutoplay();
      });
    } catch {
      /* player may not expose YT event listeners yet */
    }
  };

  const tick = () => {
    if (!autoplayArmed) {
      clearInterval(timer);
      return;
    }
    hookPlayer();
    pauseAutoplay();
  };
  tick();
  const timer = window.setInterval(tick, 200);
}

function clickBarControl(kind) {
  const selectors = {
    next: [".next-button", "#next-button"],
    previous: [".previous-button", "#previous-button"],
    playPause: [".play-pause-button", "#play-pause-button"],
  };
  const bar = document.querySelector("ytmusic-player-bar");
  if (!bar) return false;
  for (const selector of selectors[kind] || []) {
    const node = bar.querySelector(selector);
    if (!node) continue;
    const target = node.matches?.("button, [role='button']")
      ? node
      : node.querySelector?.("button, [role='button']") || node;
    allowUserPlayback();
    target.click();
    return true;
  }
  return false;
}

function playerControl(payload) {
  const method = payload?.method || "get";
  if (method === "get") return playerSnapshot();

  if (
    method === "play" ||
    method === "playPause" ||
    method === "next" ||
    method === "previous" ||
    method === "seek" ||
    method === "volume"
  ) {
    allowUserPlayback();
  }

  if (method === "play") return { ok: ran("playVideo") || cueLcdWatch() };
  if (method === "pause") return { ok: ran("pauseVideo") };
  if (method === "playPause") {
    const snap = playerSnapshot();
    if (snap.playing) return { ok: ran("pauseVideo") };
    if (snap.videoId) return { ok: ran("playVideo") };
    return { ok: cueLcdWatch() };
  }
  if (method === "seek") return { ok: applySeek(payload) };
  if (method === "volume") return { ok: applyVolume(payload) };
  if (method === "next" || method === "previous") {
    return skipPlayback(method);
  }
  return { ok: false };
}

let skipAt = 0;
let replacingWatch = 0;

function markWatchReplace() {
  replacingWatch = Date.now();
}

function overlayRepeat() {
  const node = document.querySelector("#ytunes-root [data-action='repeat']");
  const value = String(node?.dataset?.repeat || "").toLowerCase();
  if (value === "one" || value === "all") return value;
  return "off";
}

function watchListId(id) {
  return String(id || "").replace(/^VL/, "");
}

function concreteListId(id) {
  const list = watchListId(id);
  if (!list || list.startsWith("RD")) return "";
  return list;
}

function overlaySkipRoster() {
  const root = document.getElementById("ytunes-root");
  const transport = root?.querySelector?.(".ytunes-transport");
  const raw = transport?.dataset?.skipIds || root?.dataset?.skipIds || "";
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[\w-]{11}$/.test(id));
  const rawList = transport?.dataset?.skipPlaylist || root?.dataset?.skipPlaylist || "";
  const ownList = (transport?.dataset?.ownList || root?.dataset?.ownList) === "1";
  const indexRaw = transport?.dataset?.skipIndex || root?.dataset?.skipIndex || "";
  const skipIndex = Number(indexRaw);
  return {
    ids,
    playlistId: ownList ? "" : watchListId(rawList),
    ownList,
    skipIndex: Number.isFinite(skipIndex) ? skipIndex : -1,
  };
}

function queueSkipIds() {
  const queued = readPlayerQueue();
  const ids = (queued.tracks || [])
    .map((track) => track.videoId)
    .filter((id) => /^[\w-]{11}$/.test(id));
  const snap = playerSnapshot();
  const playerIds = Array.isArray(snap.playlistIds) ? snap.playlistIds.filter(Boolean) : [];
  return {
    ids: ids.length > 1 ? ids : playerIds,
    playlistId: concreteListId(queued.playlistId || snap.playlistId),
  };
}

function adjacentInRoster(ids, currentId, kind, wrap = true, hintIndex = -1) {
  if (!ids.length) return { videoId: "", index: -1 };
  const index =
    hintIndex >= 0 &&
    (!currentId || ids[hintIndex] === currentId || !ids.includes(currentId))
      ? hintIndex
      : currentId
        ? ids.indexOf(currentId)
        : -1;
  if (kind === "next") {
    if (index < 0) return { videoId: ids[0], index: 0 };
    if (index + 1 < ids.length) return { videoId: ids[index + 1], index: index + 1 };
    if (wrap) return { videoId: ids[0], index: 0 };
    return { videoId: "", index: -1 };
  }
  if (index < 0) return { videoId: ids[ids.length - 1], index: ids.length - 1 };
  if (index > 0) return { videoId: ids[index - 1], index: index - 1 };
  if (wrap) return { videoId: ids[ids.length - 1], index: ids.length - 1 };
  return { videoId: "", index: -1 };
}

function skipPlayback(kind, options = {}) {
  const auto = Boolean(options.auto);
  if (auto && autoplayArmed) return { ok: false };
  allowUserPlayback();
  const now = Date.now();
  if (now - skipAt < 280) return { ok: true };
  skipAt = now;

  const snap = playerSnapshot();
  const repeat = overlayRepeat();

  if (auto && kind === "next" && repeat === "one") {
    ran("seekTo", 0, true) || ran("seekTo", 0);
    ran("playVideo");
    return { ok: true };
  }

  if (!auto && kind === "previous" && Number(snap.current) > 3) {
    return { ok: ran("seekTo", 0, true) || ran("seekTo", 0) };
  }

  const overlay = overlaySkipRoster();
  const queued = overlay.ids.length > 1 ? overlay : queueSkipIds();
  const ids = queued.ids.length ? queued.ids : overlay.ids;
  const ownList = Boolean(overlay.ownList);
  const playlistId = ownList
    ? ""
    : queued.playlistId ||
      overlay.playlistId ||
      watchListId(snap.playlistId) ||
      watchListId(document.querySelector("#ytunes-lcd")?.dataset?.playlist);
  const currentId =
    snap.videoId || document.querySelector("#ytunes-lcd")?.dataset?.video || "";
  const wrap = !auto || repeat === "all";
  const next = adjacentInRoster(ids, currentId, kind, wrap, overlay.skipIndex);
  if (next.videoId) {
    if (auto && snap.videoId === next.videoId) return { ok: true };
    const transport = document.querySelector("#ytunes-root .ytunes-transport");
    if (transport && next.index >= 0) transport.dataset.skipIndex = String(next.index);
    const ok = play({
      ownList,
      endpoint: {
        watchEndpoint:
          playlistId && !ownList
            ? {
                videoId: next.videoId,
                playlistId,
                index: next.index >= 0 ? next.index : undefined,
              }
            : { videoId: next.videoId },
      },
    });
    if (auto) {
      window.setTimeout(() => {
        callPlayer("playVideo");
        mediaElement()?.play?.().catch(() => {});
      }, 120);
    }
    return { ok: Boolean(ok) };
  }

  if (auto) return { ok: true };

  return {
    ok:
      clickBarControl(kind) ||
      (kind === "next" ? ran("nextVideo") : ran("previousVideo")),
  };
}

function bindMediaKeys() {
  const skip = (kind) => skipPlayback(kind);

  const session = navigator.mediaSession;
  if (session && typeof session.setActionHandler === "function") {
    const nativeSet = session.setActionHandler.bind(session);
    const ours = {
      nexttrack: () => skip("next"),
      previoustrack: () => skip("previous"),
    };
    session.setActionHandler = (action, handler) => {
      if (ours[action]) return nativeSet(action, ours[action]);
      return nativeSet(action, handler);
    };
    try {
      nativeSet("nexttrack", ours.nexttrack);
      nativeSet("previoustrack", ours.previoustrack);
    } catch {
      /* some browsers reject media session actions */
    }
  }

  document.addEventListener(
    "keydown",
    (event) => {
      const name = `${event.key || ""} ${event.code || ""}`.toLowerCase();
      if (name.includes("mediatracknext")) {
        event.preventDefault();
        skip("next");
        return;
      }
      if (name.includes("mediatrackprevious")) {
        event.preventDefault();
        skip("previous");
      }
    },
    true
  );
}

function isSignedIn() {
  return Boolean(cookie("SAPISID") || cookie("__Secure-3PAPISID"));
}

function queueAdd(payload) {
  const videoId = payload?.videoId;
  if (!videoId) return false;
  const position =
    payload?.position === "next"
      ? "INSERT_AFTER_CURRENT_VIDEO"
      : "INSERT_AT_END";
  return tryNavigate({
    queueAddEndpoint: {
      queueTarget: { videoId },
      queueInsertPosition: position,
    },
  });
}

function tryNavigate(endpoint) {
  const app = document.querySelector("ytmusic-app");
  if (!endpoint || !app) return false;
  try {
    if (typeof app.handleCommand === "function") {
      app.handleCommand({
        clickTrackingParams: "",
        command: endpoint,
        ...endpoint,
      });
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof app.navigate === "function") {
      app.navigate(endpoint);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof app.navigate_ === "function") {
      app.navigate_(endpoint);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

function loadWatch(watch) {
  const videoId = watch?.videoId;
  if (!videoId) return false;
  const player = moviePlayer();
  if (!player) return false;
  const snap = playerSnapshot();
  markWatchReplace();
  if (videoId === snap.videoId) {
    if (typeof player.seekTo === "function") player.seekTo(0, true);
    if (typeof player.playVideo === "function") {
      player.playVideo();
      return true;
    }
    return false;
  }
  if (typeof player.loadVideoById !== "function") return false;
  try {
    player.loadVideoById({ videoId, startSeconds: 0 });
    return true;
  } catch {
    try {
      player.loadVideoById(videoId);
      return true;
    } catch {
      return false;
    }
  }
}

function loadPlaylistAt(watch) {
  const player = moviePlayer();
  const list = String(watch?.playlistId || "").replace(/^VL/, "");
  if (!player || !list || typeof player.loadPlaylist !== "function") return false;
  const index = Number(watch.index);
  try {
    if (Number.isFinite(index) && index >= 0) {
      player.loadPlaylist(list, index);
    } else {
      player.loadPlaylist({
        list,
        listType: "playlist",
        index: 0,
      });
    }
    return true;
  } catch {
    try {
      player.loadPlaylist({ list, listType: "playlist" });
      return true;
    } catch {
      return false;
    }
  }
}

function lcdWatch() {
  const lcd = document.querySelector("#ytunes-lcd");
  const videoId = lcd?.dataset?.video || "";
  if (!videoId) return null;
  const playlistId = lcd.dataset.playlist || "";
  return playlistId ? { videoId, playlistId } : { videoId };
}

function cueLcdWatch() {
  const watch = lcdWatch();
  return Boolean(watch && play({ endpoint: { watchEndpoint: watch } }));
}

function bindOverlayPlayGesture() {
  const inRoot = (node) => node instanceof Element && node.closest("#ytunes-root");

  document.addEventListener(
    "dblclick",
    (event) => {
      if (!inRoot(event.target)) return;
      const row = event.target.closest("#ytunes-tracks tr[data-index]");
      const cover = event.target.closest(".ytunes-cf-cover");
      const videoId =
        row?.dataset.video ||
        (cover?.dataset.video && cover.dataset.video === cover.dataset.id
          ? cover.dataset.video
          : "");
      if (!videoId) return;
      markGesture();
      const playlistId = row?.dataset.playlist || cover?.dataset.playlist || "";
      const ownList =
        document.querySelector("#ytunes-root .ytunes-transport")?.dataset?.ownList === "1";
      play({
        ownList,
        endpoint: {
          watchEndpoint:
            playlistId && !ownList ? { videoId, playlistId } : { videoId },
        },
      });
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!inRoot(event.target)) return;
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (!["playPause", "play", "next", "previous"].includes(action)) return;
      markGesture();
      playerControl({ method: action === "play" ? "playPause" : action });
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== " " && event.code !== "Space") return;
      if (!document.getElementById("ytunes-root")) return;
      const typing = event.target?.closest?.("input, textarea, [contenteditable]");
      if (typing) return;
      markGesture();
      playerControl({ method: "playPause" });
    },
    true
  );
}

function play(payload) {
  allowUserPlayback();
  const endpoint = payload?.endpoint;
  const watch = { ...(endpoint?.watchEndpoint || payload || {}) };
  if (watch.playlistId) {
    watch.playlistId = String(watch.playlistId).replace(/^VL/, "");
  }
  const snap = playerSnapshot();
  const playlistId = watch.playlistId || "";
  const videoId = watch.videoId || "";
  const ownList = Boolean(payload?.ownList);
  const command = endpoint?.watchEndpoint
    ? { ...endpoint, watchEndpoint: { ...endpoint.watchEndpoint, ...watch } }
    : { watchEndpoint: watch };

  if (playlistId && ownList) {
    if (loadWatch(watch)) return true;
    return tryNavigate({ watchEndpoint: { videoId } }) || tryNavigate(command);
  }

  if (playlistId) {
    tryNavigate(command);
    if (videoId) loadWatch(watch);
    if (videoId && videoId === snap.videoId) return true;
    window.setTimeout(() => {
      const now = playerSnapshot();
      if (videoId && now.videoId === videoId) return;
      loadPlaylistAt(watch);
    }, 400);
    return true;
  }

  const wantNavigate = !snap.videoId;
  const navigated = wantNavigate ? tryNavigate(command) : false;
  if (loadWatch(watch)) return true;
  if (navigated) return true;
  if (!wantNavigate && tryNavigate(command)) return true;
  return false;
}

function reply(id, ok, result, error) {
  document.dispatchEvent(
    new CustomEvent(RES, {
      detail: JSON.stringify({ id, ok, result, error }),
    })
  );
}

document.addEventListener(REQ, async (event) => {
  let req;
  try {
    req = readDetail(event);
  } catch {
    return;
  }
  if (!req?.id || !req.action) return;
  try {
    if (req.action === "innertube") {
      const result = await innertube(req.payload.endpoint, req.payload.body);
      reply(req.id, true, result);
      return;
    }
    if (req.action === "play") {
      const ok = play(req.payload);
      if (!ok) {
        reply(req.id, false, null, "Could not play");
        return;
      }
      reply(req.id, true, { ok: true });
      return;
    }
    if (req.action === "player") {
      reply(req.id, true, playerControl(req.payload));
      return;
    }
    if (req.action === "signedIn") {
      reply(req.id, true, { signedIn: isSignedIn() });
      return;
    }
    if (req.action === "queueAdd") {
      const ok = queueAdd(req.payload);
      if (!ok) {
        reply(req.id, false, null, "Could not add to queue");
        return;
      }
      reply(req.id, true, { ok: true });
      return;
    }
    if (req.action === "playerQueue") {
      reply(req.id, true, readPlayerQueue());
      return;
    }
    throw new Error(`unknown action ${req.action}`);
  } catch (error) {
    reply(req.id, false, null, error?.message || String(error));
  }
});

function bindQueueAdvance() {
  const trackFinished = () => {
    const snap = playerSnapshot();
    if (snap.duration > 8) return snap.current + 2 >= snap.duration;
    return snap.current > 5;
  };

  const onEnded = (fromMedia) => {
    if (autoplayArmed) return;
    if (Date.now() - replacingWatch < 900) return;
    if (!fromMedia && !trackFinished()) return;
    skipPlayback("next", { auto: true });
  };

  document.addEventListener(
    "ended",
    (event) => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement)) return;
      if (
        !media.closest?.(
          "#movie_player, ytmusic-player, ytmusic-player-page, ytmusic-player-bar"
        )
      ) {
        return;
      }
      if (media.duration > 8 && media.currentTime < 3) return;
      onEnded(true);
    },
    true
  );

  const hookPlayer = () => {
    const player = moviePlayer();
    if (!player || player.__ytunesAdvance) return;
    player.__ytunesAdvance = true;
    try {
      player.addEventListener("onStateChange", (state) => {
        if (state === 0) onEnded(false);
      });
    } catch {
      /* player may not expose YT event listeners yet */
    }
  };
  hookPlayer();
  window.setInterval(hookPlayer, 1500);
}

bindMediaKeys();
bindAutoplayGuard();
bindOverlayPlayGesture();
bindQueueAdvance();
