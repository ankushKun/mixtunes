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

function moviePlayer() {
  return document.querySelector("#movie_player");
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

function playerSnapshot() {
  const data = callPlayer("getVideoData") || {};
  const state = callPlayer("getPlayerState");
  const current = Number(callPlayer("getCurrentTime"));
  const duration = Number(callPlayer("getDuration"));
  const volume = Number(callPlayer("getVolume"));
  const videoId = data.video_id || data.videoId || "";
  return {
    hasPlayer: Boolean(moviePlayer()),
    videoId,
    title: data.title || "",
    author: data.author || "",
    playing: state === 1,
    current: Number.isFinite(current) ? current : 0,
    duration: Number.isFinite(duration) ? duration : 0,
    volume: Number.isFinite(volume) ? volume : null,
    muted: Boolean(callPlayer("isMuted")),
  };
}

function playerControl(payload) {
  const method = payload?.method || "get";
  if (method === "get") return playerSnapshot();

  const ran = (name, ...args) => callPlayer(name, ...args) !== undefined;

  if (method === "play") return { ok: ran("playVideo") };
  if (method === "pause") return { ok: ran("pauseVideo") };
  if (method === "playPause") {
    const snap = playerSnapshot();
    return { ok: ran(snap.playing ? "pauseVideo" : "playVideo") };
  }
  if (method === "seek") {
    const seconds = Number(payload.seconds);
    if (!Number.isFinite(seconds)) return { ok: false };
    return { ok: ran("seekTo", seconds, true) };
  }
  if (method === "volume") {
    const volume = Math.max(0, Math.min(100, Math.round(Number(payload.volume))));
    if (!Number.isFinite(volume)) return { ok: false };
    if (volume > 0) callPlayer("unMute");
    return { ok: ran("setVolume", volume) };
  }
  if (method === "next") return { ok: ran("nextVideo") };
  if (method === "previous") return { ok: ran("previousVideo") };
  return { ok: false };
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

function play(payload) {
  const endpoint = payload?.endpoint;
  const watch = endpoint?.watchEndpoint || payload || {};
  const snap = playerSnapshot();
  const playlistId = watch.playlistId || "";
  // navigate() starts the first YTM watch session (and radio mixes), but once
  // a watch page is active it is often a no-op — so later double-clicks never
  // reach loadVideoById if we return after navigate.
  const wantNavigate = !snap.videoId || playlistId.startsWith("RD");
  const navigated = wantNavigate ? tryNavigate(endpoint) : false;

  if (loadWatch(watch)) return true;
  if (playlistId && typeof moviePlayer()?.loadPlaylist === "function") {
    try {
      moviePlayer().loadPlaylist({ list: playlistId, index: 0 });
      return true;
    } catch {
      /* fall through */
    }
  }
  if (navigated) return true;
  if (!wantNavigate && tryNavigate(endpoint)) return true;
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
    throw new Error(`unknown action ${req.action}`);
  } catch (error) {
    reply(req.id, false, null, error?.message || String(error));
  }
});
