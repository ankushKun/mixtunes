const REQ = "ytunes-page-req";
const RES = "ytunes-page-res";
const API = "https://api.spotify.com/v1";

function isTrackId(id) {
  return YTunesPageCore.playable(id);
}

function readDetail(event) {
  const detail = event.detail;
  if (typeof detail === "string") return JSON.parse(detail);
  return detail;
}

function tokens() {
  return (
    window.__ytunesSpotify || {
      accessToken: "",
      clientToken: "",
      appPlatform: "",
      appVersion: "",
      hashes: {},
      variables: {},
      payloads: {},
      library: null,
    }
  );
}

function apiHeaders(json) {
  const t = tokens();
  const headers = {
    Authorization: `Bearer ${t.accessToken}`,
    Accept: "application/json",
    "app-platform": t.appPlatform || "WebPlayer",
  };
  if (t.clientToken) headers["client-token"] = t.clientToken;
  if (t.appVersion) headers["spotify-app-version"] = t.appVersion;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function overlayHookState() {
  const pref = (() => {
    try {
      return localStorage.getItem("ytunes-overlay:spotify");
    } catch {
      return null;
    }
  })();
  return {
    pref,
    dataset: document.documentElement.dataset.ytunesOverlay,
    hasRoot: Boolean(document.getElementById("ytunes-root")),
    hasLaunch: Boolean(document.getElementById("ytunes-launch")),
  };
}

function overlayHooksActive() {
  return YTunesPageCore.overlayHooksActive(overlayHookState());
}

function stockSiteUntouched() {
  return YTunesPageCore.stockSiteUntouched(overlayHookState());
}

async function waitForToken(timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (tokens().accessToken) return tokens().accessToken;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const t = tokens();
  return t.accessToken;
}

function v1Path(path) {
  const raw = String(path || "");
  if (raw.startsWith("http")) return raw;
  return `${API}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

let restBackoffUntil = 0;
let snapInflight = null;
let queueCache = { at: 0, value: null };
// The now-playing roster repolls off a 200ms UI loop; keep its API cost low.
const QUEUE_CACHE_MS = 15000;
const BACKOFF_KEY = "ytunes-spotify-rest-backoff";

function readStoredBackoff() {
  try {
    return Number(sessionStorage.getItem(BACKOFF_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function noteRateLimit(response) {
  const retry = Number(response && response.headers && response.headers.get("retry-after"));
  const waitMs = (Number.isFinite(retry) && retry > 0 ? retry : 60) * 1000;
  restBackoffUntil = Math.max(restBackoffUntil, Date.now() + waitMs, readStoredBackoff());
  try {
    sessionStorage.setItem(BACKOFF_KEY, String(restBackoffUntil));
  } catch {
    /* ignore */
  }
}

function restBlocked() {
  restBackoffUntil = Math.max(restBackoffUntil, readStoredBackoff());
  return Date.now() < restBackoffUntil;
}

/** Only a wait this short is worth sitting through inline. */
const RETRY_INLINE_MS = 5000;

function retryAfterMs(response, fallbackSeconds) {
  const retry = Number(response && response.headers && response.headers.get("retry-after"));
  const seconds = Number.isFinite(retry) && retry > 0 ? retry : fallbackSeconds;
  return seconds * 1000;
}

function describeWait(ms) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 90) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

/**
 * Say how long to wait, not just that we failed. Spotify escalates 429s, so a
 * blind retry against a long Retry-After spends a request to earn a longer
 * penalty — report the wait and stop instead.
 */
function rateLimitError(waitMs) {
  return new Error(`Spotify rate limit — try again in ${describeWait(waitMs)}`);
}

/**
 * `background` marks the player polls (/me/player, /me/player/queue). Only they
 * honor the shared backoff: a poll's 429 must never block a user-initiated
 * library read, which is the high-value request and is already paced. A
 * foreground read instead gets one Retry-After-aware retry before giving up.
 */
async function rest(method, path, body, opts = {}) {
  const background = Boolean(opts.background);
  if (background && restBlocked()) throw new Error("API rate limit exceeded");
  const token = await waitForToken();
  if (!token) throw new Error("Spotify is not ready");
  const send = () =>
    fetch(v1Path(path), {
      method: method || "GET",
      headers: apiHeaders(body !== undefined),
      credentials: "omit",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let response = await send();
  if (response.status === 429) {
    const waitMs = retryAfterMs(response, 60);
    noteRateLimit(response);
    // Retry only a genuinely short wait. A long Retry-After means Spotify has
    // escalated; another request now just extends the penalty.
    if (background || waitMs > RETRY_INLINE_MS) throw rateLimitError(waitMs);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await send();
    if (response.status === 429) {
      const againMs = retryAfterMs(response, 60);
      noteRateLimit(response);
      throw rateLimitError(againMs);
    }
  }
  if (response.status === 204) return {};
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || `HTTP ${response.status}`;
    if (/rate limit/i.test(message)) noteRateLimit(response);
    throw new Error(message);
  }
  return json;
}

async function pathfinder(operationName, variables) {
  const t = tokens();
  const hash = t.hashes?.[operationName];
  if (!hash) throw new Error(`No harvested query for ${operationName}`);
  const stored = t.variables?.[operationName];
  const vars =
    variables && typeof variables === "object" && Object.keys(variables).length
      ? { ...(stored || {}), ...variables }
      : stored || {};
  const token = await waitForToken();
  if (!token) throw new Error("Spotify is not ready");
  const headers = apiHeaders(true);
  const response = await fetch("https://api-partner.spotify.com/pathfinder/v2/query", {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({
      operationName,
      variables: vars,
      extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.errors) {
    const message = json?.errors?.[0]?.message || json?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return json;
}

let meCache = { at: 0, value: null };
async function currentUser() {
  if (meCache.value && Date.now() - meCache.at < 300000) return meCache.value;
  const me = await rest("GET", "/me");
  meCache = { at: Date.now(), value: me };
  return me;
}

function isSignedIn() {
  if (YTunesPageCore.sessionHint(location.pathname) === "in") return true;
  if (
    document.querySelector('[data-testid="user-widget-link"]') ||
    document.querySelector('[data-testid="user-widget"]') ||
    document.querySelector('[data-testid="user-widget-avatar"]')
  ) {
    return true;
  }
  if (
    document.querySelector('[data-testid="login-button"]') ||
    document.querySelector('[data-testid="signup-button"]') ||
    document.querySelector('a[href*="accounts.spotify.com/login"]')
  ) {
    return false;
  }
  return false;
}

function nowPlayingBar() {
  return document.querySelector('[data-testid="now-playing-bar"]');
}

function controlButton(testId) {
  return document.querySelector(`[data-testid="${testId}"]`);
}

function clickControl(testId) {
  const node = controlButton(testId);
  if (!node) return false;
  node.click();
  return true;
}

function nativeSkip(kind) {
  return clickControl(kind === "previous" ? "control-button-skip-back" : "control-button-skip-forward");
}

function isPlayingDom() {
  const label = (
    controlButton("control-button-playpause")?.getAttribute("aria-label") || ""
  ).toLowerCase();
  return label.includes("pause");
}

function progressFromDom() {
  const input = document.querySelector(
    '[data-testid="playback-progressbar"] input[type="range"]'
  );
  if (!input) return { current: 0, duration: 0 };
  const max = Number(input.max) || 0;
  const value = Number(input.value) || Number(input.getAttribute("value")) || 0;
  return { current: value / 1000, duration: max / 1000 };
}

function nowPlayingFromDom() {
  const widget =
    document.querySelector('[data-testid="now-playing-widget"]') || nowPlayingBar();
  const titleEl =
    document.querySelector('[data-testid="context-item-info-title"]') ||
    document.querySelector('[data-testid="nowplaying-track-link"]') ||
    widget?.querySelector("a[href*='/track/']") ||
    widget?.querySelector("[data-testid='entityTitle']");
  const artistEl =
    document.querySelector('[data-testid="context-item-info-artist"]') ||
    widget?.querySelector("a[href*='/artist/']");
  const link =
    widget?.querySelector('a[href*="/track/"]') ||
    titleEl?.querySelector("a") ||
    (titleEl && titleEl.closest("a"));
  const id = YTunesPageCore.trackIdOf(link?.getAttribute("href") || "");
  return {
    trackId: id,
    title: String(titleEl?.textContent || "").trim(),
    artist: String(artistEl?.textContent || "").trim(),
    artwork: widget?.querySelector("img")?.getAttribute("src") || "",
  };
}

let snapCache = { at: 0, value: null };
const SNAP_REST_MS = 5000;

function mapApiTrack(item) {
  const track = item?.track || item;
  if (!track || track.type === "episode" || track.type === "ad") return null;
  const id = YTunesPageCore.trackIdOf(track.id || track.uri);
  if (!id) return null;
  const artists = (track.artists || []).map((artist) => artist.name).filter(Boolean);
  const images = track.album?.images || track.images || [];
  const art = images[0]?.url || images[images.length - 1]?.url || "";
  const year = String(track.album?.release_date || "").slice(0, 4);
  const durationMs = Number(track.duration_ms) || 0;
  return {
    id,
    videoId: id,
    uri: track.uri || `spotify:track:${id}`,
    title: track.name || "",
    artist: artists.join(", "),
    album: track.album?.name || "",
    year,
    artwork: art,
    durationMs,
    duration: formatClock(durationMs),
    albumId: track.album?.id || "",
    artistId: track.artists?.[0]?.id || "",
    playlistId: "",
  };
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function fetchSnapshot(force) {
  if (!force && restBlocked()) return snapCache.value || {};
  if (!force && snapCache.value && Date.now() - snapCache.at < SNAP_REST_MS) {
    return snapCache.value;
  }
  if (snapInflight) return snapInflight;
  snapInflight = (async () => {
    try {
      const data = await rest("GET", "/me/player", undefined, { background: true });
      snapCache = { at: Date.now(), value: data || {} };
      return snapCache.value;
    } catch (error) {
      snapCache = { at: Date.now(), value: snapCache.value || {} };
      return snapCache.value;
    }
  })().finally(() => {
    snapInflight = null;
  });
  return snapInflight;
}

function playerSnapshot() {
  const data = snapCache.value || {};
  const item = data.item || {};
  const mapped = mapApiTrack(item) || {};
  const ad = data.currently_playing_type === "ad";
  const dom = nowPlayingFromDom();
  const id = ad ? "" : mapped.id || dom.trackId || "";
  const progress = progressFromDom();
  const durationMs = Number(item.duration_ms) || progress.duration * 1000;
  const progressMs = Number(data.progress_ms);
  const current =
    Number.isFinite(progressMs) && progressMs >= 0 ? progressMs / 1000 : progress.current;
  const duration = durationMs > 0 ? durationMs / 1000 : progress.duration;
  const device = data.device || {};
  return {
    trackId: id,
    videoId: id,
    uri: mapped.uri || "",
    title: ad ? "Advertisement" : mapped.title || dom.title || "",
    artist: mapped.artist || dom.artist || "",
    album: mapped.album || "",
    year: mapped.year || "",
    artwork: mapped.artwork || dom.artwork || "",
    playing: typeof data.is_playing === "boolean" ? data.is_playing : isPlayingDom(),
    current,
    duration,
    shuffle: Boolean(data.shuffle_state),
    repeat: data.repeat_state === "track" ? "one" : data.repeat_state === "context" ? "all" : "off",
    volume: Number.isFinite(device.volume_percent) ? device.volume_percent : 100,
    playlistId: data.context?.uri || "",
    deviceId: device.id || "",
    deviceName: device.name || "",
    deviceLocal: /web player/i.test(device.name || "") || Boolean(nowPlayingBar()),
    ad,
    hasPlayer: Boolean(nowPlayingBar() || device.id),
  };
}

async function thisDeviceId() {
  const devices = await rest("GET", "/me/player/devices");
  const list = devices.devices || [];
  const web =
    list.find((device) => /web player/i.test(device.name || "")) ||
    list.find((device) => device.type === "Computer" && !device.is_restricted) ||
    list.find((device) => device.is_active);
  return web?.id || snapCache.value?.device?.id || "";
}

let lastTransferError = "";

async function ensureThisDevice() {
  lastTransferError = "";
  const id = await thisDeviceId();
  if (!id) {
    lastTransferError = "No Spotify Web Player device";
    throw new Error(lastTransferError);
  }
  const current = snapCache.value?.device?.id;
  if (current === id) return id;
  try {
    await rest("PUT", "/me/player", { device_ids: [id], play: false });
  } catch (error) {
    lastTransferError = error?.message || "Could not play on this tab";
    throw error;
  }
  return id;
}

function contextUriFor(listId, userId) {
  const value = String(listId || "");
  if (!value) return "";
  if (value === "collection" || value.endsWith(":collection")) {
    return userId ? `spotify:user:${userId}:collection` : value;
  }
  if (value.startsWith("spotify:")) return value;
  if (value.startsWith("album:")) return `spotify:album:${value.slice(6)}`;
  if (/^[A-Za-z0-9]{22}$/.test(value)) return `spotify:playlist:${value}`;
  return value;
}

function mediaProbe() {
  const found = [];
  const walk = (root, depth) => {
    if (!root || depth > 14) return;
    try {
      found.push(...root.querySelectorAll("video, audio"));
    } catch {
      return;
    }
    let nodes;
    try {
      nodes = root.querySelectorAll("*");
    } catch {
      return;
    }
    for (const el of nodes) {
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
    }
  };
  walk(document, 0);
  for (const iframe of document.querySelectorAll("iframe")) {
    try {
      if (iframe.contentDocument) walk(iframe.contentDocument, 0);
    } catch {
      /* cross-origin */
    }
  }
  return found.slice(0, 8).map((el) => ({
    tag: el.tagName,
    w: el.clientWidth,
    h: el.clientHeight,
    paused: el.paused,
    error: el.error ? el.error.code : 0,
    hasSrc: Boolean(el.src || el.currentSrc),
  }));
}

function playUriViaDom(trackUri) {
  const id = YTunesPageCore.trackIdOf(trackUri);
  if (id) {
    const href = document.querySelector(`a[href*="/track/${id}"]`);
    const row = href?.closest('[data-testid="tracklist-row"]') || href?.closest("div[role='row']");
    const playBtn =
      row?.querySelector('button[data-testid="play-button"]') ||
      row?.querySelector('button[aria-label*="Play" i]');
    if (playBtn) {
      playBtn.click();
      return true;
    }
    if (href) {
      href.click();
      return true;
    }
  }
  return clickControl("control-button-playpause");
}

async function playTrack(payload) {
  const uri = payload?.uri || YTunesPageCore.trackIdOf(payload?.id || payload?.uri);
  const trackUri = uri.startsWith("spotify:")
    ? uri
    : uri
      ? `spotify:track:${YTunesPageCore.trackIdOf(uri)}`
      : "";
  if (!trackUri) throw new Error("Nothing to play");
  if (restBlocked() || !tokens().accessToken) {
    const ok = playUriViaDom(trackUri);
    if (!ok) throw new Error("Could not start playback");
    return { ok: true, via: "dom" };
  }
  const me = await currentUser().catch(() => null);
  const contextUri = contextUriFor(payload?.contextUri || payload?.playlistId, me?.id);
  try {
    const deviceId = await ensureThisDevice();
    const body = contextUri
      ? { context_uri: contextUri, offset: { uri: trackUri } }
      : { uris: [trackUri] };
    await rest("PUT", `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, body);
    return { ok: true, deviceId };
  } catch (error) {
    const ok = playUriViaDom(trackUri);
    if (!ok) throw error;
    return { ok: true, via: "dom" };
  }
}

async function playerControl(payload) {
  const action = payload?.action || payload;
  if (action === "playPause") {
    const ok = clickControl("control-button-playpause");
    return ok || (!restBlocked() && snapshotToggle());
  }
  if (action === "play") {
    if (isPlayingDom()) return { ok: true };
    return clickControl("control-button-playpause") || (!restBlocked() && rest("PUT", "/me/player/play").then(() => ({ ok: true })));
  }
  if (action === "pause") {
    if (!isPlayingDom()) return { ok: true };
    return clickControl("control-button-playpause") || (!restBlocked() && rest("PUT", "/me/player/pause").then(() => ({ ok: true })));
  }
  if (action === "next" || action === "previous") {
    return skipPlayback(action);
  }
  if (action === "seek") {
    const ms = Math.round(Number(payload?.positionMs) || 0);
    await rest("PUT", `/me/player/seek?position_ms=${Math.max(0, ms)}`);
    return { ok: true };
  }
  if (action === "volume") {
    const percent = Math.round(Math.max(0, Math.min(100, Number(payload?.volume) || 0)));
    await rest("PUT", `/me/player/volume?volume_percent=${percent}`);
    return { ok: true };
  }
  if (action === "shuffle") {
    await rest("PUT", `/me/player/shuffle?state=${payload?.on ? "true" : "false"}`);
    return { ok: true };
  }
  if (action === "repeat") {
    const state = payload?.mode === "one" ? "track" : payload?.mode === "all" ? "context" : "off";
    await rest("PUT", `/me/player/repeat?state=${state}`);
    return { ok: true };
  }
  return { ok: false };
}

async function snapshotToggle() {
  const snap = playerSnapshot();
  await rest("PUT", snap.playing ? "/me/player/pause" : "/me/player/play");
  return { ok: true };
}

function overlayRepeat() {
  const node = document.querySelector("#ytunes-root [data-action='repeat']");
  const value = String(node?.dataset?.repeat || "").toLowerCase();
  if (value === "one" || value === "all") return value;
  return "off";
}

function overlaySkipRoster() {
  const root = document.getElementById("ytunes-root");
  const transport = root?.querySelector?.(".ytunes-transport");
  const raw = transport?.dataset?.skipIds || root?.dataset?.skipIds || "";
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(isTrackId)
    .map((id) => YTunesPageCore.trackIdOf(id));
  const rawList = transport?.dataset?.skipPlaylist || root?.dataset?.skipPlaylist || "";
  const ownList = (transport?.dataset?.ownList || root?.dataset?.ownList) === "1";
  const indexRaw = transport?.dataset?.skipIndex || root?.dataset?.skipIndex || "";
  const skipIndex = Number(indexRaw);
  const pendingUntil = Number(
    transport?.dataset?.pendingSkipUntil || root?.dataset?.pendingSkipUntil || 0
  );
  return {
    ids,
    playlistId: ownList ? "" : YTunesPageCore.listId(rawList),
    ownList,
    skipIndex: Date.now() < pendingUntil && Number.isFinite(skipIndex) ? skipIndex : -1,
  };
}

function stampPendingSkip(trackId, index) {
  const transport = document.querySelector("#ytunes-root .ytunes-transport");
  const root = document.getElementById("ytunes-root");
  [transport, root].forEach((node) => {
    if (!node) return;
    if (trackId) node.dataset.pendingSkip = trackId;
    else delete node.dataset.pendingSkip;
    if (trackId) node.dataset.pendingSkipUntil = String(Date.now() + 2500);
    else delete node.dataset.pendingSkipUntil;
    if (index >= 0) node.dataset.skipIndex = String(index);
  });
}

function confirmPendingSkip(snap) {
  const id = snap?.trackId || "";
  if (!id) return;
  const transport = document.querySelector("#ytunes-root .ytunes-transport");
  const root = document.getElementById("ytunes-root");
  const pending = transport?.dataset?.pendingSkip || root?.dataset?.pendingSkip || "";
  if (!pending || pending !== id) return;
  [transport, root].forEach((node) => {
    if (!node) return;
    delete node.dataset.pendingSkip;
    delete node.dataset.pendingSkipUntil;
  });
}

let skipAt = 0;

function skipPlayback(kind, options = {}) {
  const auto = Boolean(options.auto);
  if (stockSiteUntouched()) return { ok: true };
  const now = Date.now();
  if (now - skipAt < (auto ? 400 : 90)) return { ok: true };
  skipAt = now;

  const snap = playerSnapshot();
  confirmPendingSkip(snap);
  const overlay = overlaySkipRoster();
  const ownList = Boolean(overlay.ownList);
  const repeat = overlayRepeat();
  const handleAuto = YTunesPageCore.shouldHandleAutoAdvance(ownList);

  if (auto && kind === "next" && repeat === "one") {
    if (!handleAuto) return { ok: true };
    playerControl({ action: "seek", positionMs: 0 });
    playerControl("play");
    return { ok: true };
  }

  if (!auto && kind === "previous" && Number(snap.current) > 3) {
    playerControl({ action: "seek", positionMs: 0 });
    return { ok: true };
  }

  if (auto && !handleAuto && !options.force) return { ok: true };

  if (!ownList && !auto) {
    if (nativeSkip(kind)) return { ok: true };
  }

  const currentId = snap.trackId || "";
  const next = YTunesPageCore.adjacentInRoster(
    overlay.ids,
    currentId,
    kind,
    repeat === "all",
    overlay.skipIndex
  );
  if (next.id) {
    stampPendingSkip(next.id, next.index);
    playTrack({
      uri: `spotify:track:${next.id}`,
      playlistId: overlay.playlistId || snap.playlistId,
    }).catch(() => nativeSkip(kind));
    return { ok: true };
  }

  if (auto) return { ok: true };
  return { ok: nativeSkip(kind) };
}

async function playerQueue() {
  if (queueCache.value && Date.now() - queueCache.at < QUEUE_CACHE_MS) return queueCache.value;
  if (restBlocked()) {
    return queueCache.value || { tracks: [], playlistId: playerSnapshot().playlistId || "" };
  }
  try {
    const data = await rest("GET", "/me/player/queue", undefined, { background: true });
    const current = mapApiTrack(data.currently_playing);
    const restTracks = (data.queue || []).map(mapApiTrack).filter(Boolean);
    const tracks = [current, ...restTracks].filter(Boolean);
    const snap = playerSnapshot();
    queueCache = { at: Date.now(), value: { tracks, playlistId: snap.playlistId || "" } };
    return queueCache.value;
  } catch {
    const fallback = { tracks: [], playlistId: playerSnapshot().playlistId || "" };
    queueCache = { at: Date.now(), value: queueCache.value || fallback };
    return queueCache.value;
  }
}

async function likeTrack(payload) {
  const id = YTunesPageCore.trackIdOf(payload?.id);
  if (!id) throw new Error("No track");
  const ids = `?ids=${encodeURIComponent(id)}`;
  if (payload?.rating === "dislike" || payload?.rating === "indifferent") {
    await rest("DELETE", `/me/tracks${ids}`);
    return { ok: true, liked: false };
  }
  await rest("PUT", `/me/tracks${ids}`);
  return { ok: true, liked: true };
}

function collectHarvest(root, tracks, playlists, seen) {
  if (!root || typeof root !== "object" || seen.has(root)) return;
  seen.add(root);
  const nested = root.data && typeof root.data === "object" ? root.data : null;
  const node = nested && (nested.uri || nested.name) ? nested : root;
  const uri = String(node.uri || root.uri || "");
  const name = node.name || root.name;
  if (/^spotify:track:/i.test(uri) && name) {
    if (!tracks.some((track) => track.uri === uri)) {
      const artistItems = Array.isArray(node.artists)
        ? node.artists
        : node.artists?.items || [];
      tracks.push({
        type: "track",
        uri,
        name,
        artists: artistItems.map((artist) => ({
          name: artist?.name || artist?.profile?.name || "",
        })),
        album: {
          name: node.album?.name || node.albumOfTrack?.name || "",
          images: node.album?.images || node.albumOfTrack?.coverArt?.sources || [],
          release_date: String(
            node.album?.release_date || node.albumOfTrack?.date?.year || ""
          ),
        },
        duration_ms: Number(node.duration_ms) || Number(node.duration?.totalMilliseconds) || 0,
      });
    }
  }
  if (/^spotify:playlist:/i.test(uri) && name) {
    if (!playlists.some((item) => item.uri === uri)) {
      playlists.push({ type: "playlist", uri, name, id: uri.replace(/^spotify:playlist:/i, "") });
    }
  }
  const kids = Array.isArray(root) ? root : Object.values(root);
  for (const child of kids) collectHarvest(child, tracks, playlists, seen);
}

function harvestedCatalog() {
  const t = tokens();
  const tracks = [];
  const playlists = [];
  const seen = new WeakSet();
  collectHarvest(t.library, tracks, playlists, seen);
  for (const payload of Object.values(t.payloads || {})) {
    collectHarvest(payload, tracks, playlists, seen);
  }
  return { hashes: t.hashes || {}, tracks, playlists };
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
    if (req.action === "rest") {
      const result = await rest(req.payload.method, req.payload.path, req.payload.body);
      reply(req.id, true, result);
      return;
    }
    if (req.action === "pathfinder") {
      const result = await pathfinder(req.payload.operationName, req.payload.variables);
      reply(req.id, true, result);
      return;
    }
    if (req.action === "play") {
      const result = await playTrack(req.payload || {});
      reply(req.id, true, result);
      return;
    }
    if (req.action === "player") {
      const result = await playerControl(req.payload);
      reply(req.id, true, result);
      return;
    }
    if (req.action === "signedIn") {
      reply(req.id, true, { signedIn: isSignedIn() });
      return;
    }
    if (req.action === "harvest") {
      const result = harvestedCatalog();
      reply(req.id, true, result);
      return;
    }
    if (req.action === "snapshot") {
      reply(req.id, true, playerSnapshot());
      return;
    }
    if (req.action === "playerQueue") {
      reply(req.id, true, await playerQueue());
      return;
    }
    if (req.action === "like") {
      reply(req.id, true, await likeTrack(req.payload || {}));
      return;
    }
    if (req.action === "hashes") {
      reply(req.id, true, { hashes: { ...tokens().hashes } });
      return;
    }
    throw new Error(`unknown action ${req.action}`);
  } catch (error) {
    reply(req.id, false, null, error?.message || String(error));
  }
});

function bindMediaKeys() {
  const skip = (kind) => skipPlayback(kind);
  const session = navigator.mediaSession;
  if (session && typeof session.setActionHandler === "function") {
    const nativeSet = session.setActionHandler.bind(session);
    const ours = {
      nexttrack: () => skip("next"),
      previoustrack: () => skip("previous"),
    };
    const theirs = {};
    let wrapped = false;
    const wrap = () => {
      if (wrapped) return;
      wrapped = true;
      session.setActionHandler = (action, handler) => {
        if (ours[action]) theirs[action] = handler;
        if (ours[action] && !stockSiteUntouched()) {
          return nativeSet(action, ours[action]);
        }
        return nativeSet(action, handler);
      };
      try {
        nativeSet("nexttrack", ours.nexttrack);
        nativeSet("previoustrack", ours.previoustrack);
      } catch {
        /* some browsers reject media session actions */
      }
    };
    const unwrap = () => {
      if (!wrapped) return;
      wrapped = false;
      session.setActionHandler = nativeSet;
      for (const action of Object.keys(ours)) {
        try {
          nativeSet(action, theirs[action] || null);
        } catch {
          /* ignore */
        }
      }
    };
    if (overlayHooksActive()) wrap();
    document.addEventListener("ytunes-overlay-pref", () => {
      if (stockSiteUntouched()) unwrap();
      else wrap();
    });
  }
}

function bindQueueAdvance() {
  let lastId = "";
  window.setInterval(() => {
    if (!overlayHooksActive()) return;
    const snap = playerSnapshot();
    if (snap.ad) return;
    if (snap.duration > 8 && snap.current + 1.5 >= snap.duration) {
      skipPlayback("next", { auto: true });
    }
    if (snap.trackId && snap.trackId !== lastId) lastId = snap.trackId;
  }, 1500);
}

bindMediaKeys();
bindQueueAdvance();
