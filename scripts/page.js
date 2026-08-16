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

function play(payload) {
  const endpoint = payload?.endpoint;
  const app = document.querySelector("ytmusic-app");
  if (endpoint && app) {
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
  }

  const watch = endpoint?.watchEndpoint || payload || {};
  const player = document.querySelector("#movie_player");
  if (!player) return false;
  if (watch.videoId && typeof player.loadVideoById === "function") {
    player.loadVideoById(watch.videoId);
    return true;
  }
  if (watch.playlistId && typeof player.loadPlaylist === "function") {
    player.loadPlaylist({ list: watch.playlistId, index: 0 });
    return true;
  }
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
      reply(req.id, true, { ok: play(req.payload) });
      return;
    }
    throw new Error(`unknown action ${req.action}`);
  } catch (error) {
    reply(req.id, false, null, error?.message || String(error));
  }
});
