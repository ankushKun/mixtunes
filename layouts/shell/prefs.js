const PREFS_KEY = "ytunesPrefs";
const PREFS_VERSION = 3;
const THEME_VALUES = ["auto", "light", "graphite"];

const SOURCE_GROUP_KEYS = ["library", "store", "genius", "playlists"];

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
  const videoId = String(value.videoId || "").trim();
  if (!title && !videoId) return null;
  if (title === "yTunes" || /^youtube music$/i.test(title)) return null;
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
  if (!next.playCounts || typeof next.playCounts !== "object") next.playCounts = {};
  const groups = {};
  for (const key of SOURCE_GROUP_KEYS) {
    groups[key] =
      key === "genius"
        ? next.sourceGroups?.[key] === true
        : next.sourceGroups?.[key] !== false;
  }
  next.sourceGroups = groups;
  next.nowPlaying = sanitizeNowPlaying(next.nowPlaying);
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

async function savePrefs(partial) {
  const current = await loadPrefs();
  const next = migratePrefs({ ...current, ...partial });
  try {
    await chrome.storage.local.set({ [PREFS_KEY]: next });
  } catch {
    /* storage can be unavailable in tests */
  }
  return next;
}

function playStat(prefs, videoId) {
  if (!videoId) return { count: "", lastPlayed: "" };
  const row = prefs?.playCounts?.[videoId];
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

async function recordPlay(videoId) {
  if (!videoId) return loadPrefs();
  const current = await loadPrefs();
  const prev = current.playCounts[videoId] || { count: 0, lastPlayed: 0 };
  current.playCounts[videoId] = {
    count: (Number(prev.count) || 0) + 1,
    lastPlayed: Date.now(),
  };
  return savePrefs({ playCounts: current.playCounts });
}

function createPlayCounter(onRecorded) {
  let armedVideo = "";
  let countedVideo = "";
  let startedAt = 0;

  return {
    note(status) {
      const videoId = status?.videoId || "";
      if (!videoId || !status?.playing) return;
      if (videoId !== armedVideo) {
        armedVideo = videoId;
        startedAt = Date.now();
      }
      if (countedVideo === videoId) return;
      const elapsed = (Date.now() - startedAt) / 1000;
      const ratio = Number(status?.progress?.ratio) || 0;
      if (elapsed < 15 && ratio < 0.5) return;
      countedVideo = videoId;
      recordPlay(videoId).then((prefs) => onRecorded?.(prefs));
    },
  };
}
