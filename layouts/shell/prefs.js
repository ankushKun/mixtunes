const PREFS_KEY = "ytunesPrefs";
const PREFS_VERSION = 4;
const THEME_VALUES = ["auto", "light", "graphite"];

const SOURCE_GROUP_KEYS = ["library", "store", "genius", "playlists"];

// Chrome and view preferences are shared; anything keyed by a track or list id is
// per-host, because a second host's ids would otherwise collide with these.
let prefsHostId = YTunesHosts.primary().id;

/** Point per-host prefs at the host that owns this page. */
function configurePrefs(hostId) {
  prefsHostId = hostId || YTunesHosts.primary().id;
  return prefsHostId;
}

const PREFS_DEFAULTS = {
  version: PREFS_VERSION,
  view: "coverflow",
  source: { type: "songs" },
  sortKey: "",
  sortDir: "asc",
  lyricsOn: false,
  splitRatio: 0.34,
  theme: "auto",
  graphite: false,
  playCounts: {},
  sourceGroups: { library: true, store: true, genius: false, playlists: true },
  nowPlaying: null,
};

function sanitizeNowPlaying(value) {
  if (!value || typeof value !== "object") return null;
  const title = String(value.title || "").trim();
  const videoId = String(value.id || value.videoId || "").trim();
  if (!title && !videoId) return null;
  if (title === "Mixtunes") return null;
  return {
    videoId,
    title,
    artist: String(value.artist || "").trim(),
    album: String(value.album || "").trim(),
    year: String(value.year || "").trim(),
    subtitle: String(value.subtitle || "").trim(),
    artwork: String(value.artwork || "").trim(),
    cover: String(value.cover || value.artwork || "").trim(),
    playlistId: String(value.playlistId || "").trim(),
    author: String(value.author || "").trim(),
  };
}

function sanitizeTheme(value) {
  return THEME_VALUES.includes(value) ? value : "auto";
}

function systemPrefersDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function resolveGraphite(theme) {
  const mode = sanitizeTheme(theme);
  if (mode === "graphite") return true;
  if (mode === "light") return false;
  return systemPrefersDark();
}

function clonePrefs(value) {
  return {
    ...PREFS_DEFAULTS,
    ...value,
    source: { ...(value?.source || PREFS_DEFAULTS.source) },
    playCounts: { ...(value?.playCounts || {}) },
    sourceGroups: {
      ...PREFS_DEFAULTS.sourceGroups,
      ...(value?.sourceGroups && typeof value.sourceGroups === "object"
        ? value.sourceGroups
        : {}),
    },
    nowPlaying: sanitizeNowPlaying(value?.nowPlaying),
  };
}

function statRow(value) {
  return Boolean(value) && typeof value === "object" && "count" in value;
}

/** Pre-v4 prefs kept one flat play-count map, written by the only host there was. */
function isLegacyPlayCounts(counts) {
  const values = Object.values(counts || {});
  return values.length > 0 && values.some(statRow);
}

/**
 * Per-host slices, keyed by host id. Track and list ids only mean something to
 * the host that issued them, so `playCounts` and `nowPlaying` live in here.
 * Existing YouTube Music play-count keys move across untouched.
 */
function migrateHostSlices(raw) {
  const hosts = {};
  const stored = raw?.hosts && typeof raw.hosts === "object" ? raw.hosts : {};
  for (const [id, slice] of Object.entries(stored)) {
    hosts[id] = {
      playCounts: { ...(slice?.playCounts || {}) },
      nowPlaying: sanitizeNowPlaying(slice?.nowPlaying),
    };
  }
  const legacyId = YTunesHosts.primary().id;
  if (!raw?.hosts) {
    const counts = isLegacyPlayCounts(raw?.playCounts) ? { ...raw.playCounts } : {};
    const playing = sanitizeNowPlaying(raw?.nowPlaying);
    if (Object.keys(counts).length || playing) {
      hosts[legacyId] = { playCounts: counts, nowPlaying: playing };
    }
  }
  if (!hosts[prefsHostId]) hosts[prefsHostId] = { playCounts: {}, nowPlaying: null };
  return hosts;
}

function migratePrefs(raw) {
  const next = clonePrefs(raw && typeof raw === "object" ? raw : {});
  next.version = PREFS_VERSION;
  if (!["list", "grid", "coverflow"].includes(next.view)) next.view = "coverflow";
  if (!next.source || typeof next.source !== "object") next.source = { type: "songs" };
  if (next.source.type === "search") next.source = { type: "songs" };
  const ratio = Number(next.splitRatio);
  next.splitRatio = Number.isFinite(ratio) ? Math.min(0.7, Math.max(0.22, ratio)) : 0.34;
  if (raw?.version < 2 && (raw?.splitRatio == null || Number(raw.splitRatio) === 0.42)) {
    next.splitRatio = 0.34;
  }
  next.lyricsOn = Boolean(next.lyricsOn);
  const hadTheme = Boolean(raw && typeof raw === "object" && typeof raw.theme === "string");
  if (hadTheme) {
    next.theme = sanitizeTheme(raw.theme);
  } else if (raw && typeof raw === "object" && raw.graphite === true) {
    next.theme = "graphite";
  } else {
    next.theme = "auto";
  }
  next.graphite = resolveGraphite(next.theme);
  next.hosts = migrateHostSlices(raw && typeof raw === "object" ? raw : {});
  const groups = {};
  for (const key of SOURCE_GROUP_KEYS) {
    groups[key] =
      key === "genius"
        ? next.sourceGroups?.[key] === true
        : next.sourceGroups?.[key] !== false;
  }
  next.sourceGroups = groups;
  // Read-only view of the active host's slice, so callers can keep saying
  // prefs.nowPlaying. Writes go through savePrefs, which knows the host.
  const slice = next.hosts[prefsHostId];
  next.nowPlaying = slice.nowPlaying;
  next.playCounts = slice.playCounts;
  return next;
}

async function loadPrefs() {
  try {
    const stored = await chrome.storage.local.get({ [PREFS_KEY]: PREFS_DEFAULTS });
    return migratePrefs(stored[PREFS_KEY]);
  } catch {
    return clonePrefs(PREFS_DEFAULTS);
  }
}

/**
 * `nowPlaying` and `playCounts` in the partial are for the active host and land in
 * its slice; everything else is shared chrome state.
 */
async function savePrefs(partial) {
  const current = await loadPrefs();
  const merged = { ...current, ...partial, hosts: { ...current.hosts } };
  const slice = { ...merged.hosts[prefsHostId] };
  if (partial && "nowPlaying" in partial) {
    slice.nowPlaying = sanitizeNowPlaying(partial.nowPlaying);
  }
  if (partial?.playCounts && typeof partial.playCounts === "object") {
    slice.playCounts = { ...partial.playCounts };
  }
  merged.hosts[prefsHostId] = slice;
  const next = migratePrefs(merged);
  // The flat mirrors are rebuilt per host on load; storing them too would leave a
  // stale copy of whichever host happened to save last.
  const { nowPlaying, playCounts, ...stored } = next;
  try {
    await chrome.storage.local.set({ [PREFS_KEY]: stored });
  } catch {
    /* storage can be unavailable in tests */
  }
  return next;
}

function playStat(prefs, id) {
  if (!id) return { count: "", lastPlayed: "" };
  const row = prefs?.hosts?.[prefsHostId]?.playCounts?.[id];
  if (!row) return { count: "", lastPlayed: "" };
  const count = Number(row.count) || 0;
  const last = Number(row.lastPlayed) || 0;
  return {
    count: count ? String(count) : "",
    lastPlayed: last ? formatLastPlayed(last) : "",
    lastPlayedAt: last,
  };
}

function formatLastPlayed(stamp) {
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

async function recordPlay(id) {
  if (!id) return loadPrefs();
  const current = await loadPrefs();
  const counts = { ...current.playCounts };
  const prev = counts[id] || { count: 0, lastPlayed: 0 };
  counts[id] = { count: (Number(prev.count) || 0) + 1, lastPlayed: Date.now() };
  return savePrefs({ playCounts: counts });
}

/** A play counts once it has been heard for 15 seconds or half the track. */
function createPlayCounter(onRecorded) {
  let armed = "";
  let counted = "";
  let startedAt = 0;

  return {
    note(status) {
      const id = status?.trackId || "";
      if (!id || !status?.playing) return;
      if (id !== armed) {
        armed = id;
        startedAt = Date.now();
      }
      if (counted === id) return;
      const elapsed = (Date.now() - startedAt) / 1000;
      const ratio = Number(status?.progress?.ratio) || 0;
      if (elapsed < 15 && ratio < 0.5) return;
      counted = id;
      recordPlay(id).then((prefs) => onRecorded?.(prefs));
    },
  };
}
