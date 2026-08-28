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

let playerSnap = null;
let playerSnapInflight = null;
let playerSnapAt = 0;

function markHostReady() {
  document.documentElement.dataset.ytunesHost = "ready";
}

function markHostIdle() {
  delete document.documentElement.dataset.ytunesHost;
}

function waitForPlayerBar() {
  return new Promise((resolve) => {
    if (playerSurface()) {
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
      if (playerSurface()) finish(true);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    timer = setTimeout(() => finish(Boolean(playerSurface())), 15000);
  });
}

function playerSurface() {
  return (
    nowPlayingBar() ||
    controlButton("control-button-playpause") ||
    document.querySelector('[data-testid="player-controls"]') ||
    document.querySelector('[data-testid="now-playing-widget"]')
  );
}

function userWidget() {
  return (
    document.querySelector('[data-testid="user-widget-link"]') ||
    document.querySelector('[data-testid="user-widget"]') ||
    document.querySelector('[data-testid="user-widget-avatar"]')
  );
}

function loginControl() {
  return (
    document.querySelector('[data-testid="login-button"]') ||
    document.querySelector('[data-testid="signup-button"]') ||
    document.querySelector('a[href*="accounts.spotify.com/login"]')
  );
}

/**
 * Signed-in-only chrome that is not the account button. Kept separate from
 * userWidget() so widening the sign-in probe cannot move the launch button.
 */
function libraryWidget() {
  return (
    document.querySelector('a[href="/collection/tracks"]') ||
    document.querySelector('[data-testid="library-container"]') ||
    document.querySelector('[data-testid="rootlist"]') ||
    document.querySelector('[data-testid="your-library-container"]')
  );
}

function signedInHint() {
  // An explicit login control wins over every positive signal. Spotify renders
  // "Your Library" chrome to anonymous visitors too, so a library probe alone
  // reads a signed-out page as signed in and mounts an overlay with no session.
  if (loginControl()) return false;
  if (YTunesSpotifyIds.sessionHint(location.pathname) === "in") return true;
  if (userWidget() || libraryWidget()) return true;
  return null;
}

function waitForSignedIn(timeout = 8000) {
  return new Promise((resolve) => {
    const now = signedInHint();
    if (now === true || now === false) {
      resolve(now);
      return;
    }
    let observer;
    let settled = false;
    let timer = 0;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      clearTimeout(timer);
      resolve(Boolean(value));
    };
    observer = new MutationObserver(() => {
      const hint = signedInHint();
      if (hint === true || hint === false) finish(hint);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Fail open. Only an explicit login control means "signed out"; an
    // undecided probe (Spotify renamed a testid, slow render) must not hide the
    // overlay, which reads as the extension being broken. The worst case here
    // is an empty library carrying the existing "Sign in on Spotify" copy.
    timer = setTimeout(() => finish(signedInHint() !== false), timeout);
  });
}

function findLaunchSlot() {
  const user =
    userWidget() ||
    document.querySelector('button[aria-label*="Account" i]');
  if (user?.parentNode) {
    const bar =
      user.closest("header") ||
      document.querySelector('[data-testid="top-bar"]') ||
      user.parentNode;
    return { parent: user.parentNode, before: user, watch: [bar, user.parentNode].filter(Boolean) };
  }
  const before =
    loginControl() ||
    document.querySelector('[data-testid="download-button"]') ||
    document.querySelector('[data-testid="preview-menu-button"]');
  const bar = document.querySelector('[data-testid="entity-view-top-bar"]');
  if (before?.parentNode) {
    return {
      parent: before.parentNode,
      before,
      watch: [bar, before.parentNode].filter(Boolean),
    };
  }
  if (bar) return { parent: bar, before: bar.firstElementChild, watch: [bar] };
  return null;
}

function trackId(track) {
  return YTunesPlayback.trackId(track) || YTunesSpotifyIds.trackIdOf(track?.uri);
}

function trackUri(track) {
  return track?.uri || YTunesSpotifyIds.trackUri(trackId(track));
}

function likedFromSnap(snap) {
  if (!snap) return false;
  return Boolean(snap.liked);
}

/**
 * The shell reads status.progress as an object (ratio/current/duration plus
 * the two labels), the way ytm/player.js readProgress() returns it. Returning a
 * bare ratio here left the transport stuck on "0:00 / 0:00" with a dead slider.
 */
function progressFromSnap(snap) {
  const duration = Number(snap?.duration) || 0;
  const current = Number(snap?.current) || 0;
  const ratio = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
  return {
    current,
    duration,
    ratio,
    currentLabel: YTunesList.formatClock(current),
    durationLabel: YTunesList.formatClock(duration),
  };
}

function probe() {
  const bar = nowPlayingBar();
  const snap = playerSnap || {};
  const widget = document.querySelector('[data-testid="now-playing-widget"]') || bar;
  const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
  const artistEl = document.querySelector('[data-testid="context-item-info-artist"]');
  const link =
    widget?.querySelector('a[href*="/track/"]') ||
    titleEl?.querySelector("a") ||
    titleEl?.closest("a");
  const domId = YTunesSpotifyIds.trackIdOf(link?.getAttribute("href") || "");
  const id = snap.ad ? "" : snap.trackId || snap.videoId || domId || "";
  const warning = snap.deviceWarning || (!snap.deviceLocal && snap.deviceName ? `On ${snap.deviceName}` : "");
  const subtitle =
    warning ||
    [snap.artist || String(artistEl?.textContent || "").trim(), snap.album].filter(Boolean).join(" • ");
  return {
    hostAlive: Boolean(bar || snap.hasPlayer || widget),
    hasMoviePlayer: Boolean(snap.hasPlayer || bar || widget),
    hasApp: Boolean(document.querySelector("#main") || bar),
    playing: Boolean(snap.playing) || (controlButton("control-button-playpause")?.getAttribute("aria-label") || "")
      .toLowerCase()
      .includes("pause"),
    title: snap.title || String(titleEl?.textContent || "").trim(),
    subtitle,
    artist: snap.artist || String(artistEl?.textContent || "").trim(),
    album: snap.album || "",
    year: snap.year || "",
    author: snap.artist || String(artistEl?.textContent || "").trim(),
    trackId: id,
    videoId: id,
    playlistId: snap.playlistId || "",
    artwork: snap.artwork || widget?.querySelector("img")?.getAttribute("src") || "",
    cover: snap.artwork || widget?.querySelector("img")?.getAttribute("src") || "",
    progress: progressFromSnap(snap),
    volume: typeof snap.volume === "number" ? Math.round(snap.volume) : 100,
    shuffle: Boolean(snap.shuffle),
    repeat: snap.repeat || "off",
    liked: likedFromSnap(snap),
  };
}

async function refreshPlayerSnap() {
  try {
    playerSnap = await SpotifyRemote.snapshot();
    playerSnapAt = Date.now();
  } catch {
    playerSnap = playerSnap || {};
  }
  return playerSnap;
}

function refreshStatusThrottled() {
  const now = Date.now();
  if (playerSnap && now - playerSnapAt < 400 && !playerSnapInflight) {
    return Promise.resolve(playerSnap);
  }
  if (playerSnapInflight) return playerSnapInflight;
  playerSnapInflight = refreshPlayerSnap().finally(() => {
    playerSnapInflight = null;
  });
  return playerSnapInflight;
}

function rootNodes() {
  const root = document.getElementById("ytunes-root");
  return [root, root?.querySelector(".ytunes-transport")].filter(Boolean);
}

YTunesPlayback.configure(YTunesSpotifyIds);

globalThis.MusicHost = (() => {
  const host = YTunesHosts.byId("spotify");

  return {
    id: host.id,
    name: host.name,
    strings: host.strings,
    escapeParam: host.escapeParam,
    hideSheet: "scripts/hosts/spotify/hide.css",

    capabilities: {
      // First slice: only what SpotifyCatalog.browse actually resolves. A source
      // listed here but unhandled there renders a permanently empty library.
      sources: [
        "liked",
        "playlist",
        "album",
        "artist",
        "search",
        "now",
      ],
      lyrics: false,
      like: true,
      dislike: false,
      overlayRequiresSignIn: true,
      enqueue: false,
      playlistEdit: false,
      signedIn: true,
      radio: false,
      automix: false,
      shuffle: true,
      repeat: true,
      seek: true,
      volume: true,
    },

    waitUntilReady() {
      return waitForPlayerBar();
    },

    launchSlot() {
      return findLaunchSlot();
    },

    markReady: markHostReady,
    markIdle: markHostIdle,

    isIdleTitle(title) {
      return YTunesSpotifyIds.idleTitle(title);
    },

    browse: SpotifyCatalog.browse,
    search: SpotifyCatalog.search,
    suggest: SpotifyCatalog.suggest,
    playlists: SpotifyCatalog.playlists,
    moods: SpotifyCatalog.moods,
    collectionQuery: SpotifyCatalog.collectionQuery,
    listIdFor: SpotifyCatalog.listIdFor,
    isSongCover: SpotifyCatalog.isSongCover,
    trackFromCover: SpotifyCatalog.trackFromCover,
    albumOf: SpotifyCatalog.albumOf,
    artistOf: SpotifyCatalog.artistOf,
    signedIn: () => waitForSignedIn(),
    lyrics: SpotifyCatalog.lyrics,

    builtinLists() {
      return { liked: "collection" };
    },

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
      const listId = ctx.ownList ? "" : ctx.listId || context.playlistId || "";
      await SpotifyRemote.play({
        id: trackId(track),
        uri: trackUri(track),
        playlistId: listId,
        contextUri: listId,
      });
      return { ...ctx, ownList: false };
    },

    resume(track) {
      const uri = trackUri(track);
      if (!uri) return Promise.reject(new Error("Nothing to play"));
      return SpotifyRemote.play({ uri, playlistId: track?.playlistId || "" });
    },

    cue(track) {
      const uri = trackUri(track);
      if (!uri) return Promise.resolve(null);
      return SpotifyRemote.play({ uri, playlistId: track?.playlistId || "" });
    },

    radioListFor() {
      return "";
    },

    async startRadio() {
      return null;
    },

    queue(id, listId) {
      return SpotifyRemote.playerQueue().then((queued) => ({
        tracks: queued.tracks || [],
        playlistId: YTunesSpotifyIds.listId(listId) || queued.playlistId || "",
      }));
    },

    playerQueue() {
      return SpotifyRemote.playerQueue();
    },

    invalidateQueue() {},

    probe,

    refreshStatus() {
      return refreshStatusThrottled();
    },

    control(action) {
      return SpotifyRemote.player({ action }).then(() => true).catch(() => {
        if (action === "playPause") return clickControl("control-button-playpause");
        if (action === "next") return clickControl("control-button-skip-forward");
        if (action === "previous") return clickControl("control-button-skip-back");
        return false;
      });
    },

    async seek(ratio) {
      const snap = playerSnap || (await refreshPlayerSnap());
      const duration = Number(snap?.duration) || 0;
      if (duration <= 0) return false;
      const positionMs = Math.round(Math.max(0, Math.min(1, Number(ratio) || 0)) * duration * 1000);
      await SpotifyRemote.player({ action: "seek", positionMs });
      return true;
    },

    async volume(ratio) {
      const percent = Math.round(Math.max(0, Math.min(1, Number(ratio) || 0)) * 100);
      await SpotifyRemote.player({ action: "volume", volume: percent });
      return true;
    },

    setShuffle(on) {
      return SpotifyRemote.player({ action: "shuffle", on: Boolean(on) }).then(() => true);
    },

    async setRepeat(mode) {
      const want = mode === "one" || mode === "all" ? mode : "off";
      await SpotifyRemote.player({ action: "repeat", mode: want });
      await refreshPlayerSnap();
      return probe().repeat || want;
    },

    syncSkipRoster({ ids, listId, ownList, mode, playingId } = {}) {
      const roster = (ids || []).map(String).filter((id) => YTunesSpotifyIds.playable(id));
      const list = YTunesSpotifyIds.listId(listId);
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
        if (list) node.dataset.skipPlaylist = list;
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

    forcedSessionMode() {
      return document.getElementById("ytunes-root")?.dataset?.sessionMode || "";
    },

    async like(track, rating) {
      const id = trackId(track);
      if (!id) throw new Error("No track");
      return SpotifyRemote.like(id, rating);
    },

    enqueue() {
      return Promise.reject(new Error("Queue edit is not available on Spotify yet"));
    },

    createPlaylist() {
      return Promise.reject(new Error("Playlist editing is not available on Spotify yet"));
    },

    addToPlaylist() {
      return Promise.reject(new Error("Playlist editing is not available on Spotify yet"));
    },

    removeFromPlaylist() {
      return Promise.reject(new Error("Playlist editing is not available on Spotify yet"));
    },
  };
})();
