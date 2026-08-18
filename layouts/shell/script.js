const STOREFRONT_EMPTY = "Select a mix. Double-click a cover to open it.";

/** Canonical track identity; a host may also carry its own alias field. */
function trackId(track) {
  return YTunesPlayback.trackId(track);
}

/** Live status of the host's own player. */
function hostStatus() {
  return MusicHost.probe();
}

/** A cover's own track, for the one-song covers a storefront shelf produces. */
function coverTrackId(cover) {
  return cover?.trackId || cover?.videoId || "";
}

function setImg(img, url, alt) {
  if (!img) return;
  const frame = img.closest(".ytunes-lcd-art, .ytunes-artwell");
  if (!url) {
    img.removeAttribute("src");
    if (frame && frame.classList.contains("ytunes-lcd-art")) frame.hidden = true;
    return;
  }
  if (frame) frame.hidden = false;
  if (img.getAttribute("src") !== url) img.src = url;
  img.alt = alt || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setRangeFill(el, value, max) {
  if (!el) return;
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100)) : 0;
  el.style.setProperty("--yt-fill", `${pct}%`);
}

function sourceKey(source) {
  if (!source) return "";
  if (source.type === "search") return `search:${source.query || source.title || ""}`;
  if (source.type === "playlist") return `playlist:${source.playlistId || ""}`;
  if (source.type === "mood") return `mood:${source.title || source.browseId || ""}`;
  if (source.browseId) return `${source.type || "browse"}:${source.browseId}`;
  return source.type || "";
}

const COVER_BROWSER_SOURCES = new Set([
  "home",
  "explore",
  "charts",
  "mixes",
  "mood",
  "podcasts",
  "albums",
  "artists",
  "videos",
]);

const MIXED_STOREFRONT_SOURCES = new Set([
  "home",
  "explore",
  "charts",
  "mixes",
  "mood",
  "videos",
]);

function isCoverBrowser(state) {
  if (state.source === "now" || state.source === "playlist" || state.source === "liked" || state.source === "songs") {
    return false;
  }
  if (COVER_BROWSER_SOURCES.has(state.source)) return true;
  return (state.covers || []).some((cover) => cover.browseId || cover.playlistId);
}

function isMixedStorefront(state) {
  return MIXED_STOREFRONT_SOURCES.has(state.source);
}

function isQuickPicksTitle(title) {
  return /^quick picks$/i.test(String(title || "").trim());
}

function limitQuickPicks(parsed) {
  let kept = 0;
  const tracks = [];
  for (const track of parsed.tracks || []) {
    if (isQuickPicksTitle(track.shelf)) {
      if (kept >= 8) continue;
      kept += 1;
    }
    tracks.push(track);
  }
  let keptCovers = 0;
  const collections = [];
  for (const item of parsed.collections || []) {
    if (isQuickPicksTitle(item.shelf) && (item.kind === "song" || coverTrackId(item))) {
      if (keptCovers >= 8) continue;
      keptCovers += 1;
    }
    collections.push(item);
  }
  const shelves = (parsed.shelves || []).map((shelf) => {
    if (!isQuickPicksTitle(shelf.title)) return shelf;
    return {
      ...shelf,
      tracks: (shelf.tracks || []).slice(0, 8),
      collections: (shelf.collections || []).slice(0, 8),
    };
  });
  return { ...parsed, tracks, collections, shelves };
}

/** Can this cover's songs be listed at all? */
function canPreviewCover(cover) {
  if (!cover) return false;
  if (isSongCover(cover)) return true;
  return Boolean(cover.tracks?.length || MusicHost.collectionQuery(cover));
}

/** One song versus a collection of them. Only the host can tell from its own ids. */
function isSongCover(cover) {
  return MusicHost.isSongCover(cover);
}

function trackFromSongCover(cover) {
  if (cover.tracks?.[0]) return cover.tracks[0];
  return MusicHost.trackFromCover(cover);
}

function topLevelSongsFromCovers(covers) {
  const tracks = [];
  for (const cover of covers || []) {
    if (!isSongCover(cover)) continue;
    if (cover.tracks?.length) tracks.push(...cover.tracks);
    else tracks.push(trackFromSongCover(cover));
  }
  return uniqueTracks(tracks);
}

function uniqueTracks(tracks) {
  const seen = new Set();
  const out = [];
  for (const track of tracks || []) {
    const key =
      trackId(track) ||
      (track.title
        ? `n:${track.title}:${track.artist || ""}:${track.duration || ""}`
        : "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(track);
  }
  return out;
}

function uniqueCovers(covers) {
  const seen = new Set();
  const out = [];
  for (const cover of covers || []) {
    const key = cover.id || `${cover.title || ""}:${cover.artist || ""}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cover);
  }
  return out;
}

/**
 * Split a storefront page into real collections plus one-off songs promoted to
 * their own covers, so shelves like Quick Picks stay browsable in Cover Flow.
 */
function storefrontCovers(parsed) {
  const collections = parsed.collections || [];
  const seen = new Set(collections.map(coverTrackId).filter(Boolean));
  const loose = (parsed.tracks || []).filter((track) => {
    const id = trackId(track);
    if (!id) return false;
    return !seen.has(id);
  });
  const songCovers = coversFromTracks(loose).map((cover) => {
    const first = cover.tracks?.[0];
    return {
      ...cover,
      kind: "song",
      shelf: first?.shelf || "",
      subtitle: first?.artist || cover.subtitle,
      trackId: trackId(first),
      videoId: first?.videoId || "",
    };
  });
  return { collections, songCovers };
}

function formatLcdSub(status, track) {
  const same = Boolean(trackId(track) && status?.trackId && trackId(track) === status.trackId);
  const artist = (same && track.artist) || status?.artist || status?.author || track?.artist || "";
  const album = (same && track.album) || status?.album || track?.album || "";
  const year = (same && track.year) || status?.year || track?.year || "";
  if (artist && album && year) return `${artist} — ${album} (${year})`;
  if (artist && album) return `${artist} — ${album}`;
  if (artist && year) return `${artist} (${year})`;
  if (artist) return artist;
  return status?.subtitle || MusicHost.strings.lcdIdle;
}

function isSuggestedTrack(track) {
  return Boolean(
    track?.suggested ||
      /suggest|recommend|you might|more like|more from/i.test(track?.shelf || "")
  );
}

function splitPlaylistRows(tracks) {
  const owned = [];
  const suggested = [];
  const seen = new Set();
  for (const track of tracks || []) {
    if (isSuggestedTrack(track)) continue;
    owned.push(track);
    if (trackId(track)) seen.add(trackId(track));
  }
  for (const track of tracks || []) {
    if (!isSuggestedTrack(track)) continue;
    if (trackId(track) && seen.has(trackId(track))) continue;
    suggested.push(track);
  }
  return { owned, suggested };
}

function coverIdForTrack(track) {
  return YTunesList.coverIdForTrack(track);
}

function coversFromTracks(tracks) {
  return YTunesList.coversFromTracks(tracks);
}

function queueCovers(tracks) {
  return (tracks || []).map((track, index) => ({
    id: trackId(track) || track.id || `q:${index}`,
    title: track.title,
    subtitle: track.artist,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
    kind: "song",
    videoId: trackId(track),
    tracks: [track],
    endpoint: track.endpoint,
  }));
}

function queueFingerprint(tracks) {
  return (tracks || []).map((track) => trackId(track) || track.id || track.title).join("\n");
}

function selectedCaptionTrack(state) {
  if (state.selectedIndex < 0) return null;
  return state.visibleTracks?.[state.selectedIndex] || null;
}

function applyCoverCaption(root, state, cover, track) {
  const item = cover || state.coverFlow?.current() || null;
  state.coverFlow?.setCaptionTrack?.(track || null);
  renderArtwell(root, item, hostStatus(), track || null);
}

function applyNowPlaying(root, state, tracks, status, options = {}) {
  const playingId = status?.trackId || "";
  const keep =
    options.keepSelection && trackId(state.visibleTracks[state.selectedIndex]);
  const wasThin =
    (state.covers || []).length <= 1 || (state.tracks || []).length <= 1;
  state.tracks = tracks;
  if (options.lyricsId) state.lyricsId = options.lyricsId;
  if (options.playlistId) state.playlistId = options.playlistId;
  state.nowTracks = tracks;
  const preferred = keep || playingId;
  let index = preferred
    ? tracks.findIndex((item) => trackId(item) === preferred)
    : -1;
  if (index < 0 && playingId) {
    index = tracks.findIndex((item) => trackId(item) === playingId);
  }
  state.selectedIndex = index >= 0 ? index : tracks.length ? 0 : -1;
  renderTracks(root, state, tracks, "Nothing is playing.");
  if (options.resetCovers || wasThin) {
    const covers = queueCovers(tracks);
    const cover = covers[Math.max(0, state.selectedIndex)];
    showCovers(state, covers, cover?.id || "");
    renderGrid(root, state);
    if (!covers.length) setCoverEmptyMessage(root, "Nothing is playing.");
  }
  applyCoverCaption(
    root,
    state,
    state.coverFlow?.current(),
    selectedCaptionTrack(state) || tracks[Math.max(0, state.selectedIndex)] || null
  );
  if (options.scroll && state.selectedIndex >= 0) {
    scrollTrackIntoView(root, state, state.selectedIndex);
  }
}

function coverForTrack(state, track) {
  if (!track || !state.covers.length) return null;
  const wanted = trackId(track) || "";
  const id = coverIdForTrack(track);
  return (
    (wanted &&
      state.covers.find(
        (cover) => coverTrackId(cover) === wanted || cover.id === wanted
      )) ||
    state.covers.find((cover) =>
      cover.tracks?.some((item) => trackId(item) && trackId(item) === wanted)
    ) ||
    state.covers.find((cover) => cover.id === id) ||
    state.covers.find(
      (cover) =>
        track.album &&
        cover.title === track.album &&
        (cover.artist || "") === (track.artist || "")
    ) ||
    null
  );
}

function syncCoverFlowToTrack(root, state, track) {
  if (state.coverFlow?.isDragging?.()) return;
  const cover = coverForTrack(state, track);
  if (!cover || !state.coverFlow) return;
  const index = state.covers.findIndex((item) => item.id === cover.id);
  if (index < 0) return;
  state.selectedCoverId = cover.id;
  state.coverFlow.setCaptionTrack?.(track);
  state.coverFlow.setIndex(index, true);
  renderGrid(root, state);
  renderArtwell(root, cover, hostStatus(), track);
}

function indexOfVideo(tracks, videoId) {
  if (!videoId) return -1;
  return (tracks || []).findIndex((item) => trackId(item) === videoId);
}

/** Canonical list id. The host decides what canonical means. */
function playlistIdOf(value) {
  return YTunesPlayback.listId(value);
}

/** A real list we can page through, as opposed to an endless station. */
function isConcreteList(value) {
  return YTunesPlayback.isConcreteList(value);
}

function revealTrackRow(root, state, index) {
  if (index < 0 || index >= (state.visibleTracks || []).length) return;
  const track = state.visibleTracks[index];
  if (state.selectedIndex !== index) {
    selectTrackRow(root, state, index, false);
  } else {
    syncCoverFlowToTrack(root, state, track);
    applyCoverCaption(root, state, state.coverFlow?.current(), track);
  }
  scrollTrackIntoView(root, state, index);
  const active = document.activeElement;
  if (active && (active.matches("input, textarea") || active.closest(".ytunes-dialog, .ytunes-jump"))) {
    return;
  }
  root.querySelector("#ytunes-table-wrap")?.focus({ preventScroll: true });
}

function followPlayingTrack(root, state, status) {
  const videoId = status?.trackId || "";
  if (!videoId) return;
  if (state.coverFlow?.isBusy?.() || state.coverFlow?.isDragging?.()) return;
  const index = indexOfVideo(state.visibleTracks, videoId);
  if (index < 0) {
    state.playedVideoId = videoId;
    return;
  }
  state.playedVideoId = videoId;
  if (state.followVideoId === videoId) return;
  state.followVideoId = videoId;
  revealTrackRow(root, state, index);
}

function markPlayingRows(root, videoId) {
  const id = videoId || "";
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((row) => {
    row.classList.toggle("is-playing", Boolean(id && row.dataset.video === id));
  });
}

function playback() {
  return typeof YTunesPlayback !== "undefined" ? YTunesPlayback : null;
}

/** The shell's own row position, offered to the host as a hint it may ignore. */
function playlistIndexOf(state, track) {
  if (!track || isSuggestedTrack(track)) return undefined;
  const raw = Number(track.index);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  if (state?.source === "now") return undefined;
  const id = trackId(track);
  const list =
    state?.source === "playlist"
      ? splitPlaylistRows(state.tracks).owned
      : state?.tracks;
  if (!id || !list?.length) return undefined;
  const at = list.findIndex((item) => trackId(item) === id);
  return at >= 0 ? at : undefined;
}

function playableSessionTracks(tracks) {
  return (tracks || []).filter((track) => trackId(track) && !isSuggestedTrack(track));
}

function shuffledOrder(count) {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
}

function radioListId(id) {
  return YTunesPlayback.radioListId(id);
}

function sessionTracksForPlay(state, track) {
  const shown = state.visibleTracks?.length ? state.visibleTracks : state.tracks;
  if (state.source === "playlist") return splitPlaylistRows(shown).owned;
  if (
    state.source === "liked" ||
    state.source === "songs" ||
    state.source === "recents" ||
    state.source === "album"
  ) {
    return shown;
  }
  if (state.source === "now") return state.tracks;
  const cover = coverForTrack(state, track);
  if (cover?.tracks?.length > 1) return cover.tracks;
  if (!isMixedStorefront(state) && playableSessionTracks(shown).length > 1) {
    return shown;
  }
  return track ? [track] : [];
}

function beginSession(state, options = {}) {
  const prev = state.session || {};
  const tracks = playableSessionTracks(options.tracks);
  const shuffle = options.shuffle == null ? Boolean(prev.shuffle) : Boolean(options.shuffle);
  const sameRoster =
    shuffle &&
    prev.shuffle &&
    Array.isArray(prev.order) &&
    prev.tracks?.length === tracks.length &&
    tracks.every((track, index) => trackId(track) === trackId(prev.tracks[index]));
  state.session = {
    source: options.source || "list",
    listId: playlistIdOf(options.listId),
    tracks,
    shuffle,
    order: sameRoster ? prev.order : shuffle && tracks.length ? shuffledOrder(tracks.length) : null,
  };
  return state.session;
}

function orderedSessionTracks(session) {
  const tracks = session?.tracks || [];
  if (!session?.shuffle) return tracks;
  if (!session.order || session.order.length !== tracks.length) {
    session.order = shuffledOrder(tracks.length);
  }
  return session.order.map((index) => tracks[index]).filter(Boolean);
}

/**
 * Play a row from the current view. The shell hands the host what it sees; the
 * host decides whether that becomes a station, its own queue, or a roster the
 * overlay advances, and reports back the session it started.
 */
async function playStateTrack(state, track, extras = {}) {
  if (!track) return;
  const cover = extras.cover || coverForTrack(state, track);
  const sessionTracks =
    extras.tracks ||
    (cover?.tracks?.length > 1 ? cover.tracks : sessionTracksForPlay(state, track));
  const ctx = await MusicHost.play({
    track,
    context: {
      source: state.source,
      playlistId: state.playlistId,
      session: state.session,
      cover,
      sessionTracks,
      mixedStorefront: isMixedStorefront(state),
      fallbackIndex: playlistIndexOf(state, track),
    },
  });
  if (!ctx) return;
  beginSession(state, {
    source: ctx.mode === "radio" ? "radio" : ctx.ownList ? "list" : "queue",
    listId: ctx.listId,
    tracks: ctx.tracks,
  });
}

function skipRoster(state, status) {
  const session = state.session || {};
  const playingList = playlistIdOf(status?.playlistId);
  const playingRadio = radioListId(playingList) || radioListId(session.listId);
  const forcedMode = MusicHost.forcedSessionMode();
  if (forcedMode === "radio" && session.source === "list") {
    session.source = "radio";
    session.listId = radioListId(playingList) || radioListId(session.listId) || session.listId;
  }

  if (playingRadio && session.source === "list") {
    const playingId = status?.trackId || "";
    const inList = Boolean(
      playingId && session.tracks?.some((track) => trackId(track) === playingId)
    );
    const last = session.tracks?.[session.tracks.length - 1];
    const atEnd = Boolean(playingId && trackId(last) === playingId);
    if (!inList || atEnd) {
      session.source = "radio";
      session.listId = radioListId(playingList) || playingRadio;
    }
  }

  if (session.source === "radio" || (playingRadio && session.source !== "list")) {
    return {
      tracks: [],
      playlistId: playingRadio || session.listId,
      ownList: false,
    };
  }

  if (session.source === "queue" && isConcreteList(session.listId)) {
    return {
      tracks: session.tracks || [],
      playlistId: session.listId,
      ownList: false,
    };
  }

  if (session?.tracks?.length) {
    return {
      tracks: orderedSessionTracks(session),
      playlistId: isConcreteList(session.listId) ? session.listId : "",
      ownList: true,
    };
  }

  const stateList = playlistIdOf(state.playlistId);
  const concretePlaying = isConcreteList(playingList) ? playingList : "";
  const concreteState = isConcreteList(stateList) ? stateList : "";

  if (state.source === "playlist" || state.source === "liked" || state.source === "album") {
    const owned =
      state.source === "playlist"
        ? splitPlaylistRows(state.tracks || []).owned
        : state.tracks || [];
    const tracks = owned.filter(trackId);
    if (tracks.length) {
      return {
        tracks,
        playlistId: concreteState || concretePlaying,
        ownList: false,
      };
    }
  }

  const queued = (
    state.source === "now" ? state.tracks : state.nowTracks || []
  ).filter(trackId);
  if (queued.length) {
    const radio = Boolean(radioListId(playingList || stateList));
    return {
      tracks: queued,
      playlistId: radio ? playingList || stateList : concretePlaying,
      ownList: !radio && !concretePlaying,
    };
  }

  return { tracks: [], playlistId: concretePlaying, ownList: !concretePlaying };
}

/**
 * Hand the host the roster the overlay wants advanced. How it reaches the real
 * player — datasets, an SDK queue, nothing at all — is the host's business.
 */
function syncSkipRoster(root, state, status) {
  const { tracks, playlistId, ownList } = skipRoster(state, status);
  const accepted = MusicHost.syncSkipRoster({
    ids: tracks.map(trackId),
    listId: playlistId,
    ownList,
    mode: state.session?.source,
    playingId: status?.trackId || "",
  });
  const playingId = status?.trackId || "";
  if (accepted.ids.length > 1 && playingId && accepted.ids.includes(playingId)) {
    state.nowTracks = tracks;
  }
}

function totalTimeLabel(tracks) {
  let seconds = 0;
  for (const track of tracks) seconds += parseClock(track.duration || "");
  if (seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours} hour${hours === 1 ? "" : "s"}, ${minutes} min`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function setSidebarSelection(root, source) {
  const key = sourceKey(source);
  root.querySelectorAll(".ytunes-source-list button").forEach((node) => {
    let on = false;
    if (node.dataset.playlist) on = key === `playlist:${node.dataset.playlist}`;
    else if (node.dataset.source === "mood") {
      on = key === `mood:${node.dataset.title || ""}`;
    } else if (node.dataset.source) {
      on =
        key === node.dataset.source ||
        key.startsWith(`${node.dataset.source}:`);
    }
    node.classList.toggle("is-selected", on);
    if (on) node.setAttribute("aria-current", "true");
    else node.removeAttribute("aria-current");
  });
}

function setPressed(root, action, on) {
  root.querySelectorAll(`[data-action="${action}"]`).forEach((node) => {
    node.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function setRepeatUi(root, mode) {
  const value = mode === "one" || mode === "all" ? mode : "off";
  root.querySelectorAll("[data-action='repeat']").forEach((node) => {
    node.dataset.repeat = value;
    node.setAttribute("aria-pressed", value === "off" ? "false" : "true");
    node.title =
      value === "one" ? "Repeat One" : value === "all" ? "Repeat All" : "Repeat Off";
  });
}

function applyView(root, view) {
  const next = ["list", "grid", "coverflow"].includes(view) ? view : "coverflow";
  const main = root.querySelector(".ytunes-main");
  if (main) main.dataset.view = next;
  root.querySelectorAll(".ytunes-views [data-view]").forEach((node) => {
    node.setAttribute("aria-pressed", String(node.dataset.view === next));
  });
}

function applySplit(root, ratio) {
  const clamped = Math.min(0.7, Math.max(0.22, Number(ratio) || 0.34));
  const main = root.querySelector(".ytunes-main");
  const percent = Math.round(clamped * 100);
  main?.style.setProperty("--yt-split", `${percent}%`);
  const split = root.querySelector("#ytunes-splitter");
  if (split) split.setAttribute("aria-valuenow", String(percent));
  return clamped;
}

function applyGraphite(root, on) {
  const enabled = Boolean(on);
  root.querySelector(".ytunes-app")?.classList.toggle("is-graphite", enabled);
  const toggle = root.querySelector("#ytunes-theme");
  if (toggle) {
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.title = enabled ? "Switch to metal" : "Switch to Graphite";
  }
}

function applyTheme(root, prefs) {
  const theme = sanitizeTheme(prefs?.theme);
  const graphite = resolveGraphite(theme);
  if (prefs) {
    prefs.theme = theme;
    prefs.graphite = graphite;
  }
  applyGraphite(root, graphite);
  root.querySelectorAll('input[name="ytunes-pref-theme"]').forEach((node) => {
    node.checked = node.value === theme;
  });
  return graphite;
}

function applySourceGroups(root, groups) {
  const open = { library: true, store: true, playlists: true, ...groups, genius: false };
  root.querySelectorAll(".ytunes-source-group[data-group]").forEach((node) => {
    const key = node.dataset.group;
    if (!(key in open)) return;
    const next = Boolean(open[key]);
    if (node.open !== next) node.open = next;
  });
}

function readSourceGroups(root) {
  const groups = { library: true, store: true, genius: false, playlists: true };
  root.querySelectorAll(".ytunes-source-group[data-group]").forEach((node) => {
    groups[node.dataset.group] = node.open;
  });
  return groups;
}

function sourceIconHref(name) {
  return `${location.pathname}${location.search}#ytunes-icon-${name}`;
}

function sourceIconHtml(name) {
  return `<svg class="ytunes-source-icon" aria-hidden="true"><use href="${sourceIconHref(
    name
  )}"></use></svg>`;
}

/**
 * Fill the chrome with this host's name and hide what it cannot do. A missing
 * capability removes the control; it never shows an empty or faked one.
 */
function applyHostChrome(root) {
  const caps = MusicHost.capabilities;
  const sources = new Set(caps.sources || []);
  root.querySelectorAll(".ytunes-source-list button[data-source]").forEach((node) => {
    node.hidden = !sources.has(node.dataset.source);
  });
  root.querySelectorAll(".ytunes-source-group[data-group]").forEach((group) => {
    const rows = group.querySelectorAll(".ytunes-source-list button[data-source]");
    if (rows.length && [...rows].every((row) => row.hidden)) group.hidden = true;
  });
  const gate = (selector, allowed) => {
    const node = root.querySelector(selector);
    if (node) node.hidden = !allowed;
  };
  gate("[data-action='lyrics']", caps.lyrics);
  gate("[data-action='like']", caps.like);
  gate("[data-action='shuffle']", caps.shuffle);
  gate("[data-action='repeat']", caps.repeat);
  gate("#ytunes-seek", caps.seek);
  gate("#ytunes-volume", caps.volume);
  gate("#ytunes-new-playlist", caps.playlistEdit);

  const strings = MusicHost.strings;
  const setText = (selector, value) => {
    const node = root.querySelector(selector);
    if (node && value) node.textContent = value;
  };
  setText("#ytunes-lcd-sub", strings.lcdIdle);
  setText("#ytunes-prefs-overlay-hint", strings.overlayHint);
  const original = root.querySelector("#ytunes-prefs-original");
  if (original) {
    original.textContent = strings.originalLabel;
    original.title = strings.originalTitle;
  }
}

function retargetSourceIcons(root) {
  const base = `${location.pathname}${location.search}`;
  root.querySelectorAll(".ytunes-source-icon use").forEach((node) => {
    const href = node.getAttribute("href") || "";
    const id = href.includes("#") ? href.split("#").pop() : "";
    if (!id) return;
    node.setAttribute("href", `${base}#${id}`);
  });
}

function usableArtwork(url) {
  const src = String(url || "");
  return src.startsWith("http") ? src : "";
}

function playingArtwork(state, status) {
  const id = status?.trackId || "";
  if (id) {
    const own = usableArtwork(findTrackByVideo(state, id)?.artwork);
    if (own) return own;
    const cover = (state.covers || []).find(
      (item) =>
        coverTrackId(item) === id || item.tracks?.some((row) => trackId(row) === id)
    );
    const fromCover = usableArtwork(cover?.artwork);
    if (fromCover) return fromCover;
  }
  return status?.cover || status?.artwork || "";
}

function renderSidebarWell(root, status, state) {
  const well = root.querySelector("#ytunes-sidebar-well");
  if (!well) return;
  const idle = isIdleStatus(status);
  well.hidden = idle;
  if (idle) return;
  const title = status?.title || "";
  setImg(
    root.querySelector("#ytunes-sidebar-well-img"),
    playingArtwork(state, status) || status?.artwork || status?.cover || "",
    title
  );
  const titleEl = root.querySelector("#ytunes-sidebar-well-title");
  const subEl = root.querySelector("#ytunes-sidebar-well-sub");
  if (titleEl) setMarqueeText(titleEl, title);
  if (subEl) {
    setMarqueeText(subEl, formatLcdSub(status, findTrackByVideo(state, status?.trackId)));
  }
  const main = root.querySelector("#ytunes-sidebar-well-main");
  if (main) {
    main.setAttribute("aria-label", title ? `Now Playing: ${title}` : "Now Playing");
  }
  syncWellLike(root, state, status);
}

function isIdleStatus(status) {
  if (status?.playing) return false;
  const title = String(status?.title || "").trim();
  const realTitle = Boolean(title && title !== "yTunes" && !MusicHost.isIdleTitle(title));
  if (status?.trackId && realTitle) return false;
  if (status?.trackId && (status.artwork || status.cover)) return false;
  if (realTitle && (status?.artist || status?.subtitle || status?.artwork || status?.cover)) {
    return false;
  }
  return true;
}

function nowPlayingSnapshot(status) {
  if (isIdleStatus(status)) return null;
  return sanitizeNowPlaying({
    videoId: status.trackId,
    title: status.title,
    artist: status.artist,
    album: status.album,
    year: status.year,
    subtitle: status.subtitle,
    artwork: status.artwork,
    cover: status.cover,
    playlistId: status.playlistId,
    author: status.author,
  });
}

function trackFromNowPlaying(info) {
  if (!info || typeof info !== "object") return null;
  const title = String(info.title || "").trim();
  const videoId = String(info.videoId || "").trim();
  if (!title && !videoId) return null;
  if (!videoId && (title === "yTunes" || MusicHost.isIdleTitle(title))) return null;
  return {
    id: videoId || "now",
    title: title || "Now Playing",
    artist: String(info.artist || "").trim(),
    album: String(info.album || "").trim(),
    year: String(info.year || "").trim(),
    duration: info.progress?.durationLabel || info.duration || "",
    artwork: String(info.cover || info.artwork || "").trim(),
    videoId,
    playlistId: playlistIdOf(info.playlistId),
  };
}

function nowPlayingSeed(status, prefs) {
  if (status && !isIdleStatus(status)) {
    const live = trackFromNowPlaying(status);
    if (live) return live;
  }
  return trackFromNowPlaying(sanitizeNowPlaying(prefs?.nowPlaying));
}

function fillSpinner(el) {
  if (!el || el.querySelector("i")) return el;
  for (let i = 0; i < 12; i++) {
    const spoke = document.createElement("i");
    spoke.style.setProperty("--i", String(i));
    el.appendChild(spoke);
  }
  return el;
}

function fillSpinners(root) {
  if (!root) return;
  if (root.classList?.contains("ytunes-spinner")) fillSpinner(root);
  root.querySelectorAll?.(".ytunes-spinner").forEach(fillSpinner);
}

function setCoverEmptyMessage(root, message) {
  const empty = root.querySelector("#ytunes-cover-empty");
  if (!empty) return;
  empty.hidden = false;
  const text = empty.querySelector("#ytunes-cover-empty-text");
  if (text) text.textContent = message;
  else empty.textContent = message;
}

function busySlots(state) {
  return state.busySlots || (state.busySlots = {});
}

function busyLabel(state) {
  const slots = busySlots(state);
  for (const key of ["search", "preview", "lyrics", "source"]) {
    if (slots[key]?.shown) return slots[key].label;
  }
  return "";
}

function anyBusyShown(state) {
  return Object.values(busySlots(state)).some((slot) => slot?.shown);
}

function paintBusy(root, state) {
  const shown = anyBusyShown(state);
  const slots = busySlots(state);
  const main = root.querySelector(".ytunes-main");
  if (main) main.setAttribute("aria-busy", shown ? "true" : "false");

  root.querySelectorAll(".ytunes-source-list button").forEach((node) => {
    const on = Boolean(slots.source?.shown) && node.classList.contains("is-selected");
    node.classList.toggle("is-busy", on);
    let spin = node.querySelector(":scope > .ytunes-spinner");
    if (on && !spin) {
      spin = document.createElement("span");
      spin.className = "ytunes-spinner";
      spin.setAttribute("aria-hidden", "true");
      node.appendChild(fillSpinner(spin));
    } else if (!on && spin) {
      spin.remove();
    }
  });
  root.querySelector(".ytunes-search-field")?.classList.toggle("is-busy", Boolean(slots.search?.shown));
  root.querySelector("#ytunes-lyrics")?.classList.toggle("is-busy", Boolean(slots.lyrics?.shown));

  const statusSpin = root.querySelector("#ytunes-status-spin");
  if (statusSpin) {
    statusSpin.hidden = !shown;
    if (shown) fillSpinner(statusSpin);
  }
  fillSpinners(root);
  const status = root.querySelector("#ytunes-status-center");
  if (shown && status) {
    setMarqueeText(status, busyLabel(state));
  } else if (status) {
    renderStatusMeta(root, state, state.visibleTracks);
  }
}

function beginBusy(root, state, { seq, label, slot }) {
  const slots = busySlots(state);
  const prev = slots[slot];
  if (prev) window.clearTimeout(prev.timer);
  const token = { seq, label, slot, shown: Boolean(prev?.shown), timer: 0 };
  slots[slot] = token;
  if (token.shown) {
    paintBusy(root, state);
    return;
  }
  token.timer = window.setTimeout(() => {
    if (slots[slot] !== token) return;
    token.shown = true;
    paintBusy(root, state);
  }, 120);
}

function endBusy(root, state, { seq, slot }) {
  const slots = busySlots(state);
  const cur = slots[slot];
  if (!cur) return;
  if (seq != null && cur.seq !== seq) return;
  window.clearTimeout(cur.timer);
  delete slots[slot];
  paintBusy(root, state);
}

async function waitForNowPlayingStatus(seq, state, maxMs = 1200) {
  const deadline = Date.now() + maxMs;
  await MusicHost.refreshStatus();
  let status = hostStatus();
  while (
    Date.now() < deadline &&
    seq === state.loadSeq &&
    !status?.trackId &&
    !playlistIdOf(status?.playlistId)
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    await MusicHost.refreshStatus();
    status = hostStatus();
  }
  return status || {};
}

function overlayStatus(live, state) {
  if (!isIdleStatus(live)) return live;
  const stored = sanitizeNowPlaying(state?.prefs?.nowPlaying);
  if (!stored) return live;
  return {
    ...live,
    ...stored,
    playing: false,
    volume: live?.volume,
  };
}

function rememberNowPlaying(status, state) {
  const snap = nowPlayingSnapshot(status);
  if (!snap || !state?.prefs) return;
  const prev = state.prefs.nowPlaying;
  if (
    prev &&
    prev.videoId === snap.videoId &&
    prev.title === snap.title &&
    prev.artist === snap.artist &&
    prev.album === snap.album &&
    prev.artwork === snap.artwork
  ) {
    return;
  }
  state.prefs.nowPlaying = snap;
  savePrefs({ nowPlaying: snap }).then((next) => {
    state.prefs = next;
  });
}

function isLikedLibrary(state) {
  if (state.source === "liked") return true;
  const liked = MusicHost.listIdFor({ type: "liked" });
  return Boolean(liked) && playlistIdOf(state.playlistId) === playlistIdOf(liked);
}

function sourceSortable(state) {
  return ["songs", "liked", "playlist", "recents", "search"].includes(state.source);
}

function findTrackByVideo(state, videoId) {
  if (!videoId) return null;
  return (
    state.visibleTracks.find((item) => trackId(item) === videoId) ||
    state.tracks.find((item) => trackId(item) === videoId) ||
    (state.nowTracks || []).find((item) => trackId(item) === videoId) ||
    null
  );
}

function playingMenuTrack(state, status) {
  if (isIdleStatus(status) || !status?.trackId) return null;
  const live = trackFromNowPlaying(status);
  const found = findTrackByVideo(state, status.trackId);
  if (!live && !found) return null;
  return {
    ...(found || {}),
    ...(live || {}),
    videoId: status.trackId,
    title: live?.title || found?.title || status.title || "",
    artist: live?.artist || found?.artist || status.artist || "",
    album: live?.album || found?.album || status.album || "",
  };
}

function createdPlaylistId(result) {
  if (!result || typeof result !== "object") return "";
  return playlistIdOf(result.playlistId || result.id);
}

function isTrackLiked(state, videoId, probeLiked) {
  if (!videoId) return false;
  if (state.likeOverride?.trackId === videoId) return state.likeOverride.value === "like";
  const track = findTrackByVideo(state, videoId);
  if (track && typeof track.liked === "boolean") return track.liked;
  if (track && isLikedLibrary(state)) return true;
  return probeLiked === "like";
}

function rowLiked(state, track) {
  if (!trackId(track)) return false;
  const live = hostStatus();
  return isTrackLiked(
    state,
    trackId(track),
    live?.trackId === trackId(track) ? live.liked : undefined
  );
}

function syncWellLike(root, state, status) {
  const like = root.querySelector("#ytunes-sidebar-well-like");
  const more = root.querySelector("#ytunes-sidebar-well-more");
  const acts = root.querySelector(".ytunes-sidebar-well-acts");
  const videoId = status?.trackId || "";
  const on = Boolean(videoId) && isTrackLiked(state, videoId, status?.liked);
  if (acts) acts.hidden = !videoId;
  if (like) {
    like.classList.toggle("is-liked", on);
    like.setAttribute("aria-pressed", String(on));
    like.title = on ? "Unlike" : "Like";
    like.setAttribute("aria-label", on ? "Unlike" : "Like");
  }
  if (more) more.hidden = !videoId;
}

function syncRowLikes(root, state) {
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((row) => {
    const track = state.visibleTracks[Number(row.dataset.index)];
    const btn = row.querySelector("[data-row-act='like']");
    if (!btn || !track) return;
    const on = rowLiked(state, track);
    btn.classList.toggle("is-liked", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.title = on ? "Unlike" : "Like";
    btn.setAttribute("aria-label", on ? "Unlike" : "Like");
  });
  syncWellLike(root, state, hostStatus());
}

const ROW_ICON_PLUS =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 2.2h2v4.8h4.8v2H9v4.8H7V9H2.2V7H7z"/></svg>';
const ROW_ICON_MINUS =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 7h11.6v2H2.2z"/></svg>';
const ROW_ICON_HEART =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><use href="#ytunes-icon-heart"></use></svg>';

function marqueeHtml(text, extraClass) {
  const value = escapeHtml(text || "");
  const klass = ["ytunes-marquee", extraClass].filter(Boolean).join(" ");
  return `<span class="${klass}" data-marquee="hover" title="${value}"><span class="ytunes-marquee-track"><span class="ytunes-marquee-item">${value}</span></span></span>`;
}

function renderPlayer(root, status, state) {
  const lcd = root.querySelector("#ytunes-lcd");
  const play = root.querySelector(".ytunes-play");
  const title = root.querySelector("#ytunes-lcd-title");
  const sub = root.querySelector("#ytunes-lcd-sub");
  const seek = root.querySelector("#ytunes-seek");
  const current = root.querySelector("#ytunes-time-current");
  const duration = root.querySelector("#ytunes-time-duration");
  const volume = root.querySelector("#ytunes-volume");
  const progress = root.querySelector(".ytunes-lcd-progress");
  const tools = root.querySelector(".ytunes-lcd-tools");

  const playing = Boolean(status?.playing);
  const idle = isIdleStatus(status);
  play.classList.toggle("is-playing", playing);
  play.setAttribute("aria-label", playing ? "Pause" : "Play");
  lcd?.classList.toggle("is-idle", idle);
  if (progress) progress.hidden = idle;
  if (tools) tools.hidden = idle;
  if (lcd) {
    lcd.removeAttribute("aria-pressed");
    lcd.title = "Now Playing";
    if (status?.trackId) lcd.dataset.video = status.trackId;
    else delete lcd.dataset.video;
    const listId = playlistIdOf(status?.playlistId);
    if (listId) lcd.dataset.playlist = listId;
    else delete lcd.dataset.playlist;
  }

  if (idle) {
    setMarqueeText(title, "yTunes");
    setMarqueeText(sub, MusicHost.strings.lcdIdle);
    if (!state.draggingSeek && seek) {
      seek.value = "0";
      setRangeFill(seek, 0, 1000);
    }
    current.textContent = "0:00";
    duration.textContent = "0:00";
    setImg(root.querySelector("#ytunes-lcd-img"), "", "");
    markPlayingRows(root, "");
  } else {
    const name = status?.title || "yTunes";
    setMarqueeText(title, name);
    setMarqueeText(sub, formatLcdSub(status, findTrackByVideo(state, status?.trackId)));

    const ratio = Math.max(0, Math.min(1, status?.progress?.ratio || 0));
    if (!state.draggingSeek && seek) {
      seek.value = String(Math.round(ratio * 1000));
      setRangeFill(seek, ratio * 1000, 1000);
    }
    current.textContent = status?.progress?.currentLabel || "0:00";
    duration.textContent = status?.progress?.durationLabel || "0:00";
    setImg(root.querySelector("#ytunes-lcd-img"), playingArtwork(state, status), name);
    markPlayingRows(root, status?.trackId || "");
  }

  const locked =
    state.volumeLock?.value != null && Date.now() < (state.volumeLock.until || 0)
      ? state.volumeLock.value
      : null;
  if (
    locked != null &&
    typeof status?.volume === "number" &&
    Math.abs(status.volume - locked) <= 2
  ) {
    state.volumeLock = { value: null, until: 0 };
  }
  const shownVolume = state.draggingVolume
    ? Number(volume.value)
    : state.volumeLock?.value != null && Date.now() < (state.volumeLock.until || 0)
      ? state.volumeLock.value
      : status?.volume;
  if (!state.draggingVolume && typeof shownVolume === "number") {
    volume.value = String(shownVolume);
    setRangeFill(volume, shownVolume, 100);
  }

  if (state.likeOverride && status?.trackId && state.likeOverride.trackId !== status.trackId) {
    state.likeOverride = null;
  }
  const likeVideoId =
    status?.trackId || trackId(state.visibleTracks[state.selectedIndex]) || "";
  setPressed(root, "shuffle", Boolean(state.session?.shuffle));
  setRepeatUi(root, status?.repeat || "off");
  setPressed(root, "like", isTrackLiked(state, likeVideoId, status?.liked));
  setPressed(root, "lyrics", Boolean(state.lyricsOn));
  renderSidebarWell(root, idle ? null : status, state);
  syncSkipRoster(root, state, status);
  syncRowLikes(root, state);
}

function renderStatusMeta(root, state, tracks) {
  const el = root.querySelector("#ytunes-status-center");
  if (!el) return;
  if (anyBusyShown(state)) return;
  const playlist = state.source === "playlist";
  const { owned, suggested } = playlist
    ? splitPlaylistRows(tracks)
    : { owned: tracks || [], suggested: [] };
  const count = owned.length;
  const items = `${count} item${count === 1 ? "" : "s"}`;
  const time = totalTimeLabel(owned);
  const extra = suggested.length
    ? `${suggested.length} suggestion${suggested.length === 1 ? "" : "s"}`
    : "";
  setMarqueeText(el, [items, extra, state.statusNote, time].filter(Boolean).join(" · "));
}

function trackRowHtml(state, track, index, selected, extras = {}) {
  const stats = playStat(state.prefs, trackId(track));
  const suggested = extras.suggested ?? isSuggestedTrack(track);
  const playlist = state.source === "playlist";
  const listId = playlistIdOf(suggested ? "" : track.playlistId || state.playlistId);
  const playing = Boolean(extras.playing);
  const browse = Boolean(extras.browse);
  const parity = extras.parity || (index % 2 === 0 ? "odd" : "even");
  const classes = [
    index === selected ? "is-selected" : "",
    suggested ? "is-suggested" : "",
    playing ? "is-playing" : "",
    browse ? "is-browse" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const acts = [];
  if (playlist && suggested && trackId(track)) {
    acts.push(
      `<button type="button" class="ytunes-row-act" data-row-act="add" title="Add to playlist" aria-label="Add to playlist">${ROW_ICON_PLUS}</button>`
    );
  } else if (playlist && !suggested && (track.setVideoId || trackId(track))) {
    acts.push(
      `<button type="button" class="ytunes-row-act is-remove" data-row-act="remove" title="Remove from playlist" aria-label="Remove from playlist">${ROW_ICON_MINUS}</button>`
    );
  }
  if (trackId(track)) {
    const liked = rowLiked(state, track);
    acts.push(
      `<button type="button" class="ytunes-row-like${
        liked ? " is-liked" : ""
      }" data-row-act="like" title="${liked ? "Unlike" : "Like"}" aria-label="${
        liked ? "Unlike" : "Like"
      }" aria-pressed="${liked}">${ROW_ICON_HEART}</button>`
    );
  }
  const act = acts.length
    ? `<span class="ytunes-row-acts">${acts.join("")}</span>`
    : "";
  return `
      <tr data-index="${index}" data-parity="${parity}" data-id="${escapeHtml(track.id || "")}" data-video="${escapeHtml(
        trackId(track) || ""
      )}" data-playlist="${escapeHtml(listId)}" class="${classes}">
        <td><span class="ytunes-speaker" aria-hidden="true"></span></td>
        <td><span class="ytunes-track-name">${marqueeHtml(
          track.title,
          "ytunes-track-title"
        )}${act}</span></td>
        <td>${escapeHtml(track.duration || "")}</td>
        <td>${marqueeHtml(track.artist || "")}</td>
        <td>${marqueeHtml(track.album || "")}</td>
        <td>${escapeHtml(track.year || "")}</td>
        <td>${suggested ? "" : escapeHtml(stats.count)}</td>
        <td>${suggested ? "" : marqueeHtml(stats.lastPlayed)}</td>
      </tr>`;
}

function listRowHeight(root) {
  const table = root?.querySelector?.(".ytunes-table");
  if (table) {
    const raw = getComputedStyle(table).getPropertyValue("--yt-row-h");
    const n = parseFloat(raw);
    if (n > 8) return n;
  }
  return YTunesList.LIST_ROW_HEIGHT;
}

function listHeaderHeight(root) {
  return root.querySelector(".ytunes-table thead")?.offsetHeight || 0;
}

function measureRowMarquees(row) {
  if (!row || typeof measureMarquee !== "function") return;
  row.querySelectorAll(".ytunes-marquee").forEach(measureMarquee);
}

function virtualRowHtml(state, row, parity, selected, playingId) {
  if (row.kind === "empty") {
    return `<tr class="is-empty"><td colspan="8"><span class="ytunes-spinner" aria-hidden="true"></span>${escapeHtml(
      row.title || "No tracks yet."
    )}</td></tr>`;
  }
  if (row.kind === "section") {
    return `<tr class="ytunes-section" data-parity="${parity}"><td colspan="8">${escapeHtml(
      row.title || ""
    )}</td></tr>`;
  }
  const track = row.track;
  return trackRowHtml(state, track, row.index, selected, {
    suggested: row.suggested,
    playing: Boolean(trackId(track) && playingId && trackId(track) === playingId),
    browse: Boolean(state.browseCover && YTunesList.trackMatchesCover(track, state.browseCover)),
    parity,
  });
}

function paintVirtualTracks(root, state, opts = {}) {
  const body = root.querySelector("#ytunes-tracks");
  const wrap = root.querySelector("#ytunes-table-wrap");
  if (!body || !wrap) return;
  const rows = state.listRows || [];
  if (!rows.length) return;
  const rowHeight = listRowHeight(root);
  const win = YTunesList.virtualWindow({
    count: rows.length,
    rowHeight,
    scrollTop: wrap.scrollTop,
    viewportHeight: wrap.clientHeight || 480,
    overscan: 8,
    headerHeight: listHeaderHeight(root),
  });
  const structKey = `${state.listGen || 0}:${win.start}:${win.end}:${rows.length}`;
  if (state.virtStructKey === structKey && !opts.force) {
    patchVirtualRowState(body, state);
    return;
  }
  state.virtStructKey = structKey;
  const selected = state.selectedIndex;
  const playingId = hostStatus()?.trackId || "";
  const parts = [];
  const top = YTunesList.spacerRowHtml(win.padTop);
  if (top) parts.push(top);
  for (let i = win.start; i < win.end; i += 1) {
    const parity = i % 2 === 0 ? "odd" : "even";
    parts.push(virtualRowHtml(state, rows[i], parity, selected, playingId));
  }
  const bottom = YTunesList.spacerRowHtml(win.padBottom);
  if (bottom) parts.push(bottom);
  body.innerHTML = parts.join("");
  fillSpinners(body);
  const table = root.querySelector(".ytunes-table");
  if (table) table.setAttribute("aria-rowcount", String(rows.length + 1));
  const selectedRow = body.querySelector("tr.is-selected");
  if (selectedRow) measureRowMarquees(selectedRow);
}

function patchVirtualRowState(body, state) {
  const playingId = hostStatus()?.trackId || "";
  const selected = state.selectedIndex;
  const browse = state.browseCover;
  body.querySelectorAll("tr[data-index]").forEach((row) => {
    const index = Number(row.dataset.index);
    const track = state.visibleTracks[index];
    row.classList.toggle("is-selected", index === selected);
    row.classList.toggle("is-playing", Boolean(playingId && row.dataset.video === playingId));
    row.classList.toggle(
      "is-browse",
      Boolean(track && browse && YTunesList.trackMatchesCover(track, browse))
    );
  });
}

function scrollTrackIntoView(root, state, index) {
  const wrap = root.querySelector("#ytunes-table-wrap");
  if (!wrap) return;
  const rows = state.listRows || [];
  const rowIndex = YTunesList.flattenIndexForTrack(rows, index);
  if (rowIndex < 0) return;
  wrap.scrollTop = YTunesList.scrollToRowIndex({
    scrollTop: wrap.scrollTop,
    viewportHeight: wrap.clientHeight,
    headerHeight: listHeaderHeight(root),
    rowIndex,
    rowHeight: listRowHeight(root),
  });
  paintVirtualTracks(root, state);
  wrap
    .querySelector(`#ytunes-tracks tr[data-index="${index}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function renderTracks(root, state, tracks, emptyMessage) {
  const body = root.querySelector("#ytunes-tracks");
  const playlist = state.source === "playlist";
  const unique = uniqueTracks(tracks);
  const { owned, suggested } = playlist
    ? splitPlaylistRows(unique)
    : { owned: unique, suggested: [] };
  const visible = playlist ? owned.concat(suggested) : tracks || [];
  state.visibleTracks = visible;
  state.listGen = (state.listGen || 0) + 1;
  state.virtStructKey = "";
  if (!visible.length) {
    state.listRows = [];
    body.innerHTML = `<tr class="is-empty"><td colspan="8"><span class="ytunes-spinner" aria-hidden="true"></span>${escapeHtml(
      emptyMessage || "No tracks yet."
    )}</td></tr>`;
    fillSpinners(body);
    renderStatusMeta(root, state, []);
    return;
  }
  const listOwned = playlist ? owned : visible;
  const listSuggested = playlist ? suggested : [];
  const sectioned = isMixedStorefront(state) && listOwned.some((track) => track.shelf);
  state.listRows = YTunesList.flattenListRows({
    owned: listOwned,
    suggested: listSuggested,
    sectioned,
    emptyOwnedMessage:
      playlist && !owned.length ? emptyMessage || "This playlist is empty." : "",
  });
  paintVirtualTracks(root, state, { force: true });
  renderStatusMeta(root, state, visible);
}

function markGridSelection(root, state) {
  const grid = root.querySelector("#ytunes-grid");
  if (!grid) return;
  grid.querySelectorAll("[data-cover-id]").forEach((node) => {
    node.classList.toggle("is-selected", node.dataset.coverId === state.selectedCoverId);
  });
}

function renderGrid(root, state) {
  const grid = root.querySelector("#ytunes-grid");
  if (!grid) return;
  const view = root.querySelector(".ytunes-main")?.dataset.view;
  if (view !== "grid") {
    if (grid.childElementCount > 48) {
      grid.innerHTML = "";
      delete grid.dataset.painted;
    }
    return;
  }
  if (!state.covers.length) {
    grid.innerHTML = `<p class="ytunes-source-empty">No albums</p>`;
    return;
  }
  grid.innerHTML = state.covers
    .map((cover) => {
      const sub =
        (typeof coverCaptionSub === "function" ? coverCaptionSub(cover) : "") ||
        cover.artist ||
        cover.subtitle ||
        "";
      return `
      <button type="button" class="ytunes-tile${
        cover.id === state.selectedCoverId ? " is-selected" : ""
      }" data-cover-id="${escapeHtml(cover.id)}" data-video="${escapeHtml(
        coverTrackId(cover) || trackId(cover.tracks?.[0])
      )}" data-playlist="${escapeHtml(
        playlistIdOf(cover.playlistId || cover.tracks?.[0]?.playlistId)
      )}">
        <span class="ytunes-tile-art">${
          cover.artwork
            ? `<img src="${escapeHtml(cover.artwork)}" alt="" loading="lazy" decoding="async">`
            : `<span class="ytunes-cf-ph">${escapeHtml(
                (cover.title || "?").charAt(0).toUpperCase()
              )}</span>`
        }</span>
        ${marqueeHtml(cover.title, "ytunes-tile-title")}
        ${marqueeHtml(sub, "ytunes-tile-sub")}
      </button>`;
    })
    .join("");
  grid.dataset.painted = "1";
}

function renderArtwell(root, cover, status, track) {
  const parts =
    typeof coverCaptionParts === "function"
      ? coverCaptionParts(cover, track)
      : { title: cover?.title || "", sub: cover?.artist || cover?.subtitle || "" };
  const title = parts.title || status?.title || "";
  const sub = parts.sub || status?.subtitle || "";
  const art = cover?.artwork || status?.cover || status?.artwork || "";
  setImg(root.querySelector("#ytunes-artwell-img"), art, title);
  const titleEl = root.querySelector("#ytunes-artwell-title");
  const subEl = root.querySelector("#ytunes-artwell-sub");
  if (titleEl) setMarqueeText(titleEl, title);
  if (subEl) setMarqueeText(subEl, sub);
}

function showCovers(state, covers, selectedId) {
  state.covers = covers;
  state.selectedCoverId = selectedId || covers[0]?.id || "";
  state.coverFlow.setList(covers, state.selectedCoverId);
}

function highlightCoverRows(root, state, cover, opts = {}) {
  state.browseCover = cover || null;
  let first = -1;
  const tracks = state.visibleTracks || [];
  for (let i = 0; i < tracks.length; i += 1) {
    if (YTunesList.trackMatchesCover(tracks[i], cover)) {
      first = i;
      break;
    }
  }
  if (first < 0) {
    paintVirtualTracks(root, state);
    applyCoverCaption(
      root,
      state,
      cover,
      isSongCover(cover) ? trackFromSongCover(cover) : null
    );
    return;
  }
  state.selectedIndex = first;
  if (!opts.quiet) scrollTrackIntoView(root, state, first);
  else paintVirtualTracks(root, state);
  const songCaption =
    !isCoverBrowser(state) || isSongCover(cover) ? selectedCaptionTrack(state) : null;
  applyCoverCaption(root, state, cover, songCaption);
}

function selectTrackRow(root, state, index, play) {
  if (index < 0 || index >= state.visibleTracks.length) return;
  state.selectedIndex = index;
  paintVirtualTracks(root, state);
  const track = state.visibleTracks[index];
  syncCoverFlowToTrack(root, state, track);
  applyCoverCaption(root, state, state.coverFlow?.current(), track);
  if (play) playStateTrack(state, track);
}

function sortTracks(state) {
  const key = sourceSortable(state) ? state.sortKey : "";
  const playlist = state.source === "playlist";
  const source = state.tracks || [];
  if (!key) {
    if (!playlist) return source;
    const split = splitPlaylistRows(source);
    return split.owned.concat(split.suggested);
  }
  const dir = state.sortDir === "desc" ? -1 : 1;
  const compare = (a, b) => {
    let av;
    let bv;
    if (key === "duration") {
      av = parseClock(a.duration || "");
      bv = parseClock(b.duration || "");
      return (av - bv) * dir;
    }
    if (key === "year") {
      av = Number(a.year) || 0;
      bv = Number(b.year) || 0;
      return (av - bv) * dir;
    }
    if (key === "plays") {
      av = Number(playStat(state.prefs, trackId(a)).count) || 0;
      bv = Number(playStat(state.prefs, trackId(b)).count) || 0;
      return (av - bv) * dir;
    }
    if (key === "lastPlayed") {
      av = playStat(state.prefs, trackId(a)).lastPlayedAt || 0;
      bv = playStat(state.prefs, trackId(b)).lastPlayedAt || 0;
      return (av - bv) * dir;
    }
    av = String(a[key] || "").toLowerCase();
    bv = String(b[key] || "").toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  };
  if (playlist) {
    const { owned, suggested } = splitPlaylistRows(source);
    return owned.slice().sort(compare).concat(suggested.slice().sort(compare));
  }
  return source.slice().sort(compare);
}

function applyParsed(root, state, parsed, emptyMessage, options = {}) {
  const keepSelection = Boolean(options.keepSelection);
  const prevVideo = keepSelection
    ? trackId(state.visibleTracks[state.selectedIndex]) || ""
    : "";
  const prevCoverId = keepSelection ? state.selectedCoverId || "" : "";
  const wrap = root.querySelector("#ytunes-table-wrap");
  const prevScroll = keepSelection && wrap ? wrap.scrollTop : null;
  if (!keepSelection) state.followVideoId = "";
  if (isLikedLibrary(state)) {
    for (const track of parsed.tracks) {
      track.liked = true;
    }
  }
  parsed = { ...parsed, tracks: uniqueTracks(parsed.tracks) };
  state.tracks = parsed.tracks;
  if (sourceSortable(state) && state.sortKey) {
    parsed = { ...parsed, tracks: sortTracks(state) };
    state.tracks = parsed.tracks;
  }
  state.collections = parsed.collections;
  state.lyricsId = parsed.lyricsId || state.lyricsId || "";
  const searchCovers = (parsed.collections || []).filter((item) => item.kind !== "song");
  const playlistOwned =
    state.source === "playlist" ? splitPlaylistRows(parsed.tracks).owned : parsed.tracks;
  const visible =
    state.source === "playlist"
      ? playlistOwned.concat(splitPlaylistRows(parsed.tracks).suggested)
      : parsed.tracks;
  const collectionCovers = (parsed.collections || []).filter((item) => !isSongCover(item));
  const covers = uniqueCovers(
    state.source === "search"
      ? searchCovers
      : isMixedStorefront(state)
        ? uniqueCovers(
            collectionCovers.length
              ? collectionCovers
              : coversFromTracks(playlistOwned)
          )
        : parsed.collections.length &&
            (COVER_BROWSER_SOURCES.has(state.source) || state.source === "search")
          ? parsed.collections
          : coversFromTracks(playlistOwned)
  );
  const pendingId = state.pendingSelectVideoId || "";
  if (!keepSelection) state.pendingSelectVideoId = "";
  const pendingIndex = indexOfVideo(visible, pendingId || prevVideo);
  if (pendingIndex >= 0) {
    state.selectedIndex = pendingIndex;
  } else if (!keepSelection || state.selectedIndex >= visible.length) {
    state.selectedIndex = playlistOwned.length
      ? 0
      : parsed.tracks.length
        ? splitPlaylistRows(parsed.tracks).owned.length
        : -1;
  }
  state.covers = covers;
  const pendingCover =
    pendingIndex >= 0 ? coverForTrack(state, visible[pendingIndex]) : null;
  showCovers(
    state,
    covers,
    pendingCover?.id || prevCoverId || covers[0]?.id || ""
  );
  if (!covers.length) {
    setCoverEmptyMessage(
      root,
      state.source === "playlist" && !playlistOwned.length
        ? "This playlist is empty."
        : parsed.tracks.length
          ? "Albums and artists appear here."
          : emptyMessage ||
            MusicHost.strings.signInItems
    );
  }
  renderTracks(
    root,
    state,
    parsed.tracks,
    state.source === "playlist" && !playlistOwned.length
      ? "This playlist is empty."
      : parsed.tracks.length
        ? emptyMessage
        : covers.length
          ? emptyMessage || "Select an album. Double-click a cover to open it."
          : emptyMessage || MusicHost.strings.signInItems
  );
  renderGrid(root, state);
  applyCoverCaption(root, state, state.coverFlow.current(), selectedCaptionTrack(state));
  syncSkipRoster(root, state, hostStatus());
  if (keepSelection && prevScroll != null && wrap) {
    wrap.scrollTop = prevScroll;
    paintVirtualTracks(root, state);
  } else if (pendingIndex >= 0) {
    scrollTrackIntoView(root, state, pendingIndex);
    const active = document.activeElement;
    if (
      !active ||
      !(active.matches("input, textarea") || active.closest(".ytunes-dialog, .ytunes-jump"))
    ) {
      wrap?.focus({ preventScroll: true });
    }
  }
  if (
    isCoverBrowser(state) &&
    state.source !== "search" &&
    !(isMixedStorefront(state) && parsed.tracks.length)
  ) {
    previewCoverTracks(root, state, state.coverFlow?.current());
  }
}

function bindShell(root) {
  applyHostChrome(root);
  retargetSourceIcons(root);
  bindMarquees(root);
  fillSpinners(root);
  const volume = root.querySelector("#ytunes-volume");
  const seek = root.querySelector("#ytunes-seek");
  const search = root.querySelector("#ytunes-search");
  const searchClear = root.querySelector("#ytunes-search-clear");
  const suggest = root.querySelector("#ytunes-suggest");
  const menu = root.querySelector("#ytunes-menu");
  const toast = bindToast(root);
  const state = {
    draggingVolume: false,
    volumeLock: { value: null, until: 0 },
    draggingSeek: false,
    source: "home",
    playlistId: "",
    collections: [],
    tracks: [],
    visibleTracks: [],
    listRows: [],
    listGen: 0,
    virtStructKey: "",
    browseCover: null,
    covers: [],
    selectedCoverId: "",
    selectedIndex: -1,
    coverFlow: null,
    lastSource: { type: "home" },
    loadSeq: 0,
    suggestSeq: 0,
    busySlots: {},
    history: [{ type: "home" }],
    historyIndex: 0,
    sortKey: "",
    sortDir: "asc",
    playlists: [],
    lyricsOn: false,
    lyricsLines: [],
    likeOverride: null,
    homeCache: null,
    homeCacheAt: 0,
    previewSeq: 0,
    prefs: migratePrefs(PREFS_DEFAULTS),
    statusNote: "",
    nowVideoId: "",
    followVideoId: "",
    playedVideoId: "",
    pendingSelectVideoId: "",
    nowTracks: [],
    session: { source: "list", listId: "", tracks: [], shuffle: false, order: null },
    menuTrack: null,
    lyricsVideoId: "",
    sleepUntil: 0,
    sleepMode: "",
    sleepWasPlaying: false,
    sleepPauseAt: 0,
  };
  const playCounter = createPlayCounter((prefs) => {
    state.prefs = prefs;
  });

  function syncNav() {
    syncNavButtons(root, state);
  }

  let previewTimer = 0;

  async function selectCover(cover, play) {
    if (!cover) return;
    state.selectedCoverId = cover.id;
    markGridSelection(root, state);
    if (!play) {
      if (isCoverBrowser(state)) {
        const song = isSongCover(cover) ? trackFromSongCover(cover) : null;
        applyCoverCaption(root, state, cover, song);
        window.clearTimeout(previewTimer);
        state.previewSeq += 1;
        const seq = state.previewSeq;
        const delay = cover.tracks?.length ? 40 : 220;
        previewTimer = window.setTimeout(() => {
          if (seq !== state.previewSeq) return;
          previewCoverTracks(root, state, cover, seq);
        }, delay);
        return;
      }
      highlightCoverRows(root, state, cover, { quiet: true });
      applyCoverCaption(root, state, cover, selectedCaptionTrack(state));
      return;
    }
    applyCoverCaption(
      root,
      state,
      cover,
      cover.tracks?.[0] || (isSongCover(cover) ? trackFromSongCover(cover) : null)
    );
    if (isSongCover(cover)) {
      playStateTrack(state, trackFromSongCover(cover), { cover });
      return;
    }
    if ((cover.tracks?.length || 0) <= 1 && MusicHost.collectionQuery(cover)) {
      try {
        await fetchCollectionTracks(cover);
      } catch {
        /* fall through to open */
      }
    }
    if (cover.tracks?.[0]) {
      playStateTrack(state, cover.tracks[0], { cover, tracks: cover.tracks });
      return;
    }
    if (cover.browseId) {
      await openCollection(root, state, cover, { history: true });
      return;
    }
    const asTrack = trackFromSongCover(cover);
    if (trackId(asTrack) || asTrack?.playlistId) playStateTrack(state, asTrack, { cover });
  }

  state.coverFlow = CoverFlow(root, {
    onBrowse: (cover) => selectCover(cover, false),
    onPlay: (cover) => selectCover(cover, true),
  });

  function persistChrome() {
    savePrefs({
      view: root.querySelector(".ytunes-main")?.dataset.view || "coverflow",
      source: state.lastSource,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      lyricsOn: state.lyricsOn,
      splitRatio: state.prefs.splitRatio,
      theme: state.prefs.theme,
      graphite: resolveGraphite(state.prefs.theme),
      sourceGroups: state.prefs.sourceGroups,
    }).then((next) => {
      state.prefs = next;
    });
  }

  function jumpItems(query) {
    const q = String(query || "").trim().toLowerCase();
    const items = [];
    root.querySelectorAll(".ytunes-source-list button[data-source], .ytunes-source-list button[data-playlist]").forEach((node) => {
      const label = marqueeLabel(
        node.querySelector(".ytunes-source-label")
      ).trim() || node.textContent.trim();
      if (q && !label.toLowerCase().includes(q)) return;
      items.push({
        kind: node.dataset.playlist ? "playlist" : "source",
        id: node.dataset.playlist || node.dataset.source,
        label,
      });
    });
    state.visibleTracks.forEach((track, index) => {
      const label = `${track.title} — ${track.artist || ""}`;
      if (q && !label.toLowerCase().includes(q)) return;
      items.push({ kind: "track", id: String(index), label });
    });
    (state.covers || []).forEach((cover) => {
      const label = cover.title || "";
      if (q && !label.toLowerCase().includes(q)) return;
      items.push({ kind: "cover", id: cover.id, label });
    });
    return items;
  }

  function takeJump(kind, id) {
    if (kind === "playlist") {
      loadSource(
        root,
        state,
        { type: "playlist", playlistId: id },
        { history: true }
      );
      persistChrome();
      return;
    }
    if (kind === "source") {
      loadSource(root, state, { type: id }, { history: true });
      persistChrome();
      return;
    }
    if (kind === "track") {
      selectTrackRow(root, state, Number(id), true);
      return;
    }
    if (kind === "cover") {
      const cover = state.covers.find((item) => item.id === id);
      selectCover(cover, true);
    }
  }

  const dialogs = bindDialogs(root, {
    onPrefsOpen() {
      syncPrefsForm();
    },
    onJumpQuery(query) {
      dialogs.renderJump(jumpItems(query));
    },
    onJumpPick(kind, id) {
      takeJump(kind, id);
    },
  });

  async function syncPrefsForm() {
    const overlay = root.querySelector("#ytunes-pref-overlay");
    if (overlay) {
      try {
        const stored = await chrome.storage.local.get({ overlayEnabled: true });
        overlay.checked = stored.overlayEnabled !== false;
      } catch {
        overlay.checked = true;
      }
    }
    applyTheme(root, state.prefs);
  }

  async function refreshNowPlayingList(status, force) {
    if (state.source !== "now") return;
    const videoId = status?.trackId || "";
    const thin = (state.tracks || []).length <= 1;
    if (!force && videoId && videoId === state.nowVideoId && !thin) return;
    window.clearTimeout(state.nowTimer);
    state.nowTimer = window.setTimeout(async () => {
      try {
        if (state.source !== "now") return;
        const videoChanged = Boolean(videoId && videoId !== state.nowVideoId);
        const stillThin = (state.tracks || []).length <= 1;
        let queued = { tracks: [], playlistId: "", lyricsId: "" };
        if ((force || videoChanged) && (videoId || status?.playlistId)) {
          queued = await MusicHost.queue(videoId, status?.playlistId || "");
          if (videoId) state.nowVideoId = videoId;
        } else if (stillThin) {
          queued = await MusicHost.playerQueue();
        } else {
          return;
        }
        if (state.source !== "now") return;
        let tracks = queued.tracks || [];
        if (!tracks.length) {
          if ((state.tracks || []).length) return;
          const seed = nowPlayingSeed(status, state.prefs);
          if (seed) tracks = [seed];
        }
        if (!tracks.length) return;
        if (
          !force &&
          !videoChanged &&
          queueFingerprint(tracks) === queueFingerprint(state.tracks)
        ) {
          return;
        }
        applyNowPlaying(root, state, tracks, status, {
          keepSelection: true,
          lyricsId: queued.lyricsId,
          playlistId: queued.playlistId,
          resetCovers: stillThin && tracks.length > 1,
          scroll: false,
        });
        if (state.session?.source === "radio" || state.session?.source === "queue") {
          state.session.listId = queued.playlistId || state.session.listId;
          state.session.tracks = playableSessionTracks(tracks);
          if (state.session.shuffle) {
            state.session.order = shuffledOrder(state.session.tracks.length);
          }
        } else if (!state.session?.tracks?.length) {
          beginSession(state, {
            source: radioListId(queued.playlistId) ? "radio" : "queue",
            listId: queued.playlistId,
            tracks,
          });
        }
      } catch {
        /* keep current table */
      }
    }, force ? 80 : 400);
  }

  async function refreshUi() {
    try {
      await MusicHost.refreshStatus();
      const live = hostStatus();
      rememberNowPlaying(live, state);
      const status = overlayStatus(live, state);
      renderPlayer(root, status, state);
      followPlayingTrack(root, state, live);
      playCounter.note(live);
      tickSleep(live);
      refreshNowPlayingList(live);
      if (!state.covers.length) renderArtwell(root, null, status);
      if (state.lyricsOn) {
        const vid = status?.trackId || "";
        if (vid && vid !== state.lyricsVideoId) {
          state.lyricsVideoId = vid;
          toggleLyrics(true);
        }
      }
      syncLyricsHighlight(status);
    } catch {
      /* keep the player poll alive */
    }
  }

  async function resumeOrToggle(action) {
    if (action === "playPause" || action === "play") {
      const live = hostStatus();
      if (isIdleStatus(live)) {
        const last = sanitizeNowPlaying(state.prefs?.nowPlaying);
        if (trackId(last)) {
          try {
            await MusicHost.resume(last);
            await refreshUi();
            return;
          } catch {
            /* fall through to host toggle */
          }
        }
      }
    }
    await MusicHost.control(action);
    await refreshUi();
  }

  root.querySelector(".ytunes-transport").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    resumeOrToggle(button.dataset.action);
  });

  root.querySelector(".ytunes-history").addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (!nav) return;
    if (nav.dataset.nav === "back") goHistory(-1);
    if (nav.dataset.nav === "forward") goHistory(1);
  });

  root.addEventListener("click", (event) => {
    const tool = event.target.closest(
      ".ytunes-lcd-tool, .ytunes-status-tools [data-action], .ytunes-lyrics-close"
    );
    if (tool) {
      const action = tool.dataset.action;
      if (action === "like") {
        likeCurrent();
        return;
      }
      if (action === "lyrics" || action === "lyrics-close") {
        toggleLyrics(action === "lyrics-close" ? false : undefined);
        return;
      }
      if (action === "shuffle") {
        const session = state.session || beginSession(state, { tracks: sessionTracksForPlay(state) });
        session.shuffle = !session.shuffle;
        session.order = session.shuffle ? shuffledOrder((session.tracks || []).length) : null;
        state.session = session;
        setPressed(root, "shuffle", session.shuffle);
        if (session.source === "queue" || session.source === "radio") {
          MusicHost.setShuffle(session.shuffle);
        }
        syncSkipRoster(root, state, hostStatus());
        return;
      }
      if (action === "repeat") {
        cycleRepeat();
        return;
      }
      MusicHost.control(action);
      refreshUi();
      window.setTimeout(() => refreshUi(), 120);
      return;
    }
  });

  let volumeHold = 0;
  let seekHold = 0;
  let volumeFlush = 0;
  let lastVolumeSent = null;

  function holdRange(key, timerName) {
    state[key] = true;
    window.clearTimeout(timerName === "volume" ? volumeHold : seekHold);
  }

  function releaseRange(key, apply) {
    if (apply) apply();
    const delay = key === "draggingVolume" ? 700 : 320;
    if (key === "draggingVolume") {
      window.clearTimeout(volumeHold);
      volumeHold = window.setTimeout(() => {
        state.draggingVolume = false;
      }, delay);
    } else {
      window.clearTimeout(seekHold);
      seekHold = window.setTimeout(() => {
        state.draggingSeek = false;
      }, delay);
    }
  }

  function lockVolume(value) {
    const next = Math.max(0, Math.min(100, Math.round(Number(value))));
    state.volumeLock = { value: next, until: Date.now() + 1500 };
    return next;
  }

  function flushVolume() {
    window.clearTimeout(volumeFlush);
    volumeFlush = 0;
    const next = lockVolume(volume.value);
    if (lastVolumeSent === next) return;
    lastVolumeSent = next;
    setVolumeRatio(next / 100);
  }

  volume.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    holdRange("draggingVolume", "volume");
  });
  volume.addEventListener("input", () => {
    holdRange("draggingVolume", "volume");
    lockVolume(volume.value);
    setRangeFill(volume, volume.value, 100);
    window.clearTimeout(volumeFlush);
    volumeFlush = window.setTimeout(flushVolume, 60);
  });
  volume.addEventListener("change", () => {
    flushVolume();
    releaseRange("draggingVolume");
  });
  volume.addEventListener("pointerup", () => {
    if (state.draggingVolume) {
      flushVolume();
      releaseRange("draggingVolume");
    }
  });
  volume.addEventListener("pointercancel", () => {
    releaseRange("draggingVolume");
  });

  let seekFlush = 0;
  function flushSeek() {
    window.clearTimeout(seekFlush);
    seekFlush = 0;
    seekToRatio(Number(seek.value) / 1000);
  }

  seek.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    holdRange("draggingSeek", "seek");
  });
  seek.addEventListener("input", () => {
    holdRange("draggingSeek", "seek");
    const ratio = Number(seek.value) / 1000;
    setRangeFill(seek, seek.value, 1000);
    const total = Number(hostStatus()?.progress?.duration) || 0;
    const currentLabel = root.querySelector("#ytunes-time-current");
    if (total && currentLabel) currentLabel.textContent = formatClock(ratio * total);
    window.clearTimeout(seekFlush);
    seekFlush = window.setTimeout(flushSeek, 140);
  });
  seek.addEventListener("change", () => {
    flushSeek();
    releaseRange("draggingSeek");
  });
  seek.addEventListener("pointerup", () => {
    if (state.draggingSeek) {
      flushSeek();
      releaseRange("draggingSeek");
    }
  });
  seek.addEventListener("pointercancel", () => {
    window.clearTimeout(seekFlush);
    releaseRange("draggingSeek");
  });
  window.addEventListener("pointerup", () => {
    if (state.draggingVolume) {
      flushVolume();
      releaseRange("draggingVolume");
    }
    if (state.draggingSeek) {
      flushSeek();
      releaseRange("draggingSeek");
    }
  });

  root.querySelector(".ytunes-views").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    root.querySelectorAll(".ytunes-views [data-view]").forEach((node) => {
      node.setAttribute("aria-pressed", String(node === button));
    });
    root.querySelector(".ytunes-main").dataset.view = button.dataset.view;
    persistChrome();
    if (button.dataset.view === "coverflow") state.coverFlow.focus();
    if (button.dataset.view === "grid") renderGrid(root, state);
  });

  root.querySelector("#ytunes-prefs-open")?.addEventListener("click", () => {
    dialogs.openPrefs();
  });
  root.querySelector("#ytunes-pref-overlay")?.addEventListener("change", async (event) => {
    await savePrefs({
      view: root.querySelector(".ytunes-main")?.dataset.view || "coverflow",
      source: state.lastSource,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      lyricsOn: state.lyricsOn,
      splitRatio: state.prefs.splitRatio,
      theme: state.prefs.theme,
      graphite: resolveGraphite(state.prefs.theme),
    });
    try {
      await chrome.storage.local.set({ overlayEnabled: event.target.checked });
    } catch {
      location.reload();
    }
  });
  root.querySelector("#ytunes-prefs")?.addEventListener("change", (event) => {
    const radio = event.target.closest('input[name="ytunes-pref-theme"]');
    if (!radio) return;
    state.prefs.theme = sanitizeTheme(radio.value);
    applyTheme(root, state.prefs);
    persistChrome();
  });
  root.querySelector("#ytunes-theme")?.addEventListener("click", () => {
    state.prefs.theme = resolveGraphite(state.prefs.theme) ? "light" : "graphite";
    applyTheme(root, state.prefs);
    persistChrome();
  });
  root.querySelector(".ytunes-status-credit")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.open("https://ankush.one", "_blank", "noopener,noreferrer");
  });
  root.querySelector("#ytunes-prefs-original")?.addEventListener("click", async () => {
    try {
      await chrome.storage.local.set({ overlayEnabled: false });
    } catch {
      location.reload();
    }
  });
  function openNowPlaying() {
    if (state.source === "now") {
      state.nowVideoId = "";
      refreshNowPlayingList(hostStatus(), true);
      return;
    }
    loadSource(root, state, { type: "now" }, { history: true });
    persistChrome();
  }

  root.querySelector("#ytunes-sidebar-well-main")?.addEventListener("click", () => {
    openNowPlaying();
  });
  root.querySelector("#ytunes-sidebar-well-like")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    likeCurrent();
  });
  root.querySelector("#ytunes-sidebar-well-more")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const more = event.currentTarget;
    const track = playingMenuTrack(state, hostStatus());
    if (!trackId(track)) return;
    if (!menu.hidden && trackId(state.menuTrack) === trackId(track)) {
      hideMenu();
      return;
    }
    openTrackMenu(track, { anchor: more }, { includePlay: false, includeLike: false });
  });
  root.querySelector("#ytunes-lcd")?.addEventListener("click", (event) => {
    if (event.target.closest(".ytunes-lcd-tool, .ytunes-range, .ytunes-lcd-progress, input")) return;
    openNowPlaying();
  });

  let searchTimer = 0;
  let suggestTimer = 0;
  let suggestBlurTimer = 0;

  function syncSearchClear() {
    if (searchClear) searchClear.hidden = !search.value;
  }

  function hideSuggest() {
    window.clearTimeout(suggestBlurTimer);
    suggest.hidden = true;
    suggest.innerHTML = "";
    search?.setAttribute("aria-expanded", "false");
  }

  function showSuggest(items) {
    const query = search.value.trim();
    if (!items.length || !query || document.activeElement !== search) {
      hideSuggest();
      return;
    }
    const prev = suggest.querySelector("button.is-active")?.dataset.query || "";
    suggest.innerHTML = items
      .slice(0, 8)
      .map(
        (item, index) =>
          `<li><button type="button" role="option" id="ytunes-suggest-${index}" data-query="${escapeHtml(
            item
          )}" class="${item === prev ? "is-active" : ""}">${escapeHtml(item)}</button></li>`
      )
      .join("");
    suggest.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }

  function focusSearch() {
    search.focus();
    search.select();
  }

  async function runSearch(query) {
    const seq = (state.loadSeq += 1);
    state.source = "search";
    setSidebarSelection(root, { type: "search" });
    beginBusy(root, state, { seq, slot: "search", label: "Searching…" });
    if (!state.visibleTracks.length && !state.covers.length) {
      setCoverEmptyMessage(root, "Searching…");
    }
    try {
      const parsed = await MusicHost.search(query);
      if (seq !== state.loadSeq) return;
      state.playlistId = "";
      state.statusNote = `Results for “${query}”`;
      applyParsed(root, state, parsed, `No results for “${query}”.`);
      pushHistoryFor(root, state, { type: "search", query, title: query });
    } catch (error) {
      if (seq !== state.loadSeq) return;
      renderTracks(root, state, [], error.message || "Could not search.");
    } finally {
      endBusy(root, state, { seq, slot: "search" });
    }
  }

  function restoreLibrary() {
    hideSuggest();
    syncSearchClear();
    loadSource(root, state, state.lastSource || { type: "home" }, { history: false });
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    clearTimeout(suggestTimer);
    syncSearchClear();
    const query = search.value.trim();
    if (!query) {
      restoreLibrary();
      return;
    }
    suggestTimer = window.setTimeout(async () => {
      const seq = (state.suggestSeq += 1);
      const items = await MusicHost.suggest(query);
      if (seq !== state.suggestSeq) return;
      if (search.value.trim() !== query) return;
      showSuggest(items);
    }, 160);
    if (query.length < 2) return;
    searchTimer = window.setTimeout(() => runSearch(query), 500);
  });

  search.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const buttons = [...suggest.querySelectorAll("button")];
    const active = suggest.querySelector("button.is-active");
    const activeIndex = buttons.indexOf(active);
    if (event.key === "ArrowDown" && buttons.length) {
      event.preventDefault();
      const next = buttons[Math.min(buttons.length - 1, activeIndex + 1)] || buttons[0];
      buttons.forEach((node) => node.classList.toggle("is-active", node === next));
      return;
    }
    if (event.key === "ArrowUp" && buttons.length) {
      event.preventDefault();
      const next = buttons[Math.max(0, activeIndex - 1)] || buttons[0];
      buttons.forEach((node) => node.classList.toggle("is-active", node === next));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      clearTimeout(searchTimer);
      const chosen = suggest.querySelector("button.is-active")?.dataset.query;
      const query = chosen || search.value.trim();
      if (chosen) search.value = chosen;
      syncSearchClear();
      hideSuggest();
      if (query) runSearch(query);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (!suggest.hidden) {
        hideSuggest();
        return;
      }
      search.value = "";
      restoreLibrary();
      search.blur();
    }
  });

  suggest.addEventListener("mousedown", (event) => {
    const button = event.target.closest("button[data-query]");
    if (!button) return;
    event.preventDefault();
    search.value = button.dataset.query;
    syncSearchClear();
    hideSuggest();
    runSearch(button.dataset.query);
  });

  search.addEventListener("blur", () => {
    window.clearTimeout(suggestBlurTimer);
    suggestBlurTimer = window.setTimeout(() => {
      if (root.querySelector(".ytunes-search")?.contains(document.activeElement)) return;
      hideSuggest();
    }, 120);
  });

  searchClear?.addEventListener("mousedown", (event) => {
    event.preventDefault();
    search.value = "";
    restoreLibrary();
    search.focus();
  });

  root.addEventListener("pointerdown", (event) => {
    if (suggest.hidden) return;
    if (event.target.closest(".ytunes-search")) return;
    hideSuggest();
  });

  root.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (img?.tagName !== "IMG") return;
      const src = img.getAttribute("src") || "";
      const next = src
        .replace("/hq720.", "/hqdefault.")
        .replace("/maxresdefault.", "/hqdefault.");
      if (next !== src) img.src = next;
    },
    true
  );

  const table = root.querySelector("#ytunes-tracks");
  const tableWrap = root.querySelector("#ytunes-table-wrap");
  let virtFrame = 0;
  const scheduleVirtualPaint = () => {
    if (virtFrame) return;
    virtFrame = requestAnimationFrame(() => {
      virtFrame = 0;
      paintVirtualTracks(root, state);
    });
  };
  tableWrap?.addEventListener("scroll", scheduleVirtualPaint, { passive: true });
  if (typeof ResizeObserver === "function" && tableWrap) {
    new ResizeObserver(scheduleVirtualPaint).observe(tableWrap);
  }
  table.addEventListener("mouseover", (event) => {
    const row = event.target.closest("tr[data-index]");
    if (!row || row.dataset.mq === "1") return;
    row.dataset.mq = "1";
    measureRowMarquees(row);
  });

  async function reloadPlaylist() {
    if (state.source !== "playlist" || !state.lastSource) return;
    await loadSource(root, state, state.lastSource, { history: false });
  }

  async function addTrackToPlaylist(track, playlistId) {
    const listId = playlistIdOf(playlistId);
    if (!trackId(track) || !listId) return;
    await MusicHost.addToPlaylist(listId, track);
    toast.show("Added to playlist");
    if (state.source === "playlist" && listId === playlistIdOf(state.playlistId)) {
      await reloadPlaylist();
    }
  }

  async function removeTrackFromPlaylist(track) {
    const listId = playlistIdOf(state.playlistId);
    if (!track || !listId || isSuggestedTrack(track)) return;
    await MusicHost.removeFromPlaylist(listId, track);
    toast.show("Removed from playlist");
    await reloadPlaylist();
  }

  table.addEventListener("click", (event) => {
    const act = event.target.closest("[data-row-act]");
    if (act) {
      event.preventDefault();
      event.stopPropagation();
      const row = act.closest("tr[data-index]");
      if (!row) return;
      const index = Number(row.dataset.index);
      selectTrackRow(root, state, index, false);
      const track = state.visibleTracks[index];
      if (!track) return;
      if (act.dataset.rowAct === "add") {
        addTrackToPlaylist(track, state.playlistId).catch(() => {
          toast.show("Could not add to playlist", "error");
        });
        return;
      }
      if (act.dataset.rowAct === "remove") {
        removeTrackFromPlaylist(track).catch(() => {
          toast.show("Could not remove from playlist", "error");
        });
        return;
      }
      if (act.dataset.rowAct === "like") {
        likeTrack(track);
      }
      return;
    }
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    selectTrackRow(root, state, Number(row.dataset.index), false);
  });
  table.addEventListener("dblclick", (event) => {
    if (event.target.closest("[data-row-act]")) return;
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    selectTrackRow(root, state, Number(row.dataset.index), true);
  });

  root.querySelector(".ytunes-table thead").addEventListener("click", (event) => {
    const th = event.target.closest("[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    else {
      state.sortKey = key;
      state.sortDir = "asc";
    }
    root.querySelectorAll(".ytunes-table th[data-sort]").forEach((node) => {
      node.classList.toggle("is-asc", node.dataset.sort === state.sortKey && state.sortDir === "asc");
      node.classList.toggle("is-desc", node.dataset.sort === state.sortKey && state.sortDir === "desc");
    });
    renderTracks(root, state, sortTracks(state), "No tracks yet.");
    persistChrome();
  });

  root.querySelector("#ytunes-grid").addEventListener("mouseover", (event) => {
    const tile = event.target.closest("[data-cover-id]");
    if (!tile || tile.dataset.mq === "1") return;
    tile.dataset.mq = "1";
    measureRowMarquees(tile);
  });
  root.querySelector("#ytunes-grid").addEventListener("click", (event) => {
    const tile = event.target.closest("[data-cover-id]");
    if (!tile) return;
    const cover = state.covers.find((item) => item.id === tile.dataset.coverId);
    selectCover(cover, false);
  });
  root.querySelector("#ytunes-grid").addEventListener("dblclick", (event) => {
    const tile = event.target.closest("[data-cover-id]");
    if (!tile) return;
    const cover = state.covers.find((item) => item.id === tile.dataset.coverId);
    selectCover(cover, true);
  });

  root.querySelector(".ytunes-source-list").addEventListener(
    "toggle",
    (event) => {
      if (!event.target.classList?.contains("ytunes-source-group")) return;
      const groups = readSourceGroups(root);
      const prev = state.prefs.sourceGroups || {};
      if (SOURCE_GROUP_KEYS.every((key) => Boolean(prev[key]) === groups[key])) return;
      state.prefs.sourceGroups = groups;
      persistChrome();
    },
    true
  );

  root.querySelector(".ytunes-source-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-source], [data-playlist]");
    if (!button) return;
    search.value = "";
    hideSuggest();
    syncSearchClear();
    clearTimeout(searchTimer);
    if (button.dataset.playlist) {
      loadSource(
        root,
        state,
        { type: "playlist", playlistId: button.dataset.playlist },
        { history: true }
      );
      persistChrome();
      return;
    }
    loadSource(
      root,
      state,
      {
        type: button.dataset.source,
        browseId: button.dataset.browse || "",
        params: button.dataset.params || "",
        title: button.dataset.title || "",
      },
      { history: true }
    );
    persistChrome();
  });

  function hideMenu() {
    menu.hidden = true;
    menu.innerHTML = "";
    state.menuTrack = null;
    root.querySelector("#ytunes-sidebar-well-more")?.setAttribute("aria-expanded", "false");
  }

  function menuItem(action, label, disabled) {
    return `<button type="button" data-menu="${action}"${disabled ? " disabled" : ""}>${escapeHtml(
      label
    )}</button>`;
  }

  function positionMenu(at) {
    if (at?.anchor) {
      const box = at.anchor.getBoundingClientRect();
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      let left = box.right - width;
      let top = box.top - height - 4;
      if (top < 8) top = box.bottom + 4;
      if (left < 8) left = 8;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - height - 8);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      return;
    }
    const x = Math.min(at.clientX, window.innerWidth - 200);
    const y = Math.min(at.clientY, window.innerHeight - 8);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  function openTrackMenu(track, at, extra = {}) {
    if (!track) return;
    state.menuTrack = track;
    const items = [];
    if (extra.includePlay !== false) items.push(menuItem("play", "Play"));
    items.push(
      menuItem("next", "Play Next"),
      menuItem("queue", "Add to Queue"),
      menuItem("radio", "Start Radio")
    );
    if (extra.includeLike !== false) {
      items.push(menuItem("like", extra.liked ? "Unlike" : "Like"));
    }
    items.push(menuItem("dislike", "Dislike"));
    items.push(
      menuItem("album", "Go to Album", !MusicHost.albumOf(track)),
      menuItem("artist", "Go to Artist", !MusicHost.artistOf(track))
    );
    if (extra.canAddHere) items.push(menuItem("add-here", "Add to this Playlist"));
    items.push(menuItem("add", "Add to Playlist…"));
    if (extra.canRemove) items.push(menuItem("remove", "Remove from Playlist"));
    menu.innerHTML = items.join("");
    menu.hidden = false;
    positionMenu(at);
    at?.anchor?.setAttribute("aria-expanded", "true");
  }

  async function pickAndAddToPlaylist(track) {
    if (!trackId(track)) return;
    if (!state.playlists.length) {
      try {
        await loadPlaylists(root, state);
      } catch {
        /* picker still opens */
      }
    }
    const picked = await dialogs.openPick("Add to Playlist", state.playlists);
    if (!picked) return;
    if (picked.create) {
      const title = await dialogs.openPrompt("New Playlist", "Create");
      if (!title) return;
      try {
        const created = await MusicHost.createPlaylist(title);
        await loadPlaylists(root, state);
        const playlistId =
          createdPlaylistId(created) ||
          state.playlists.find((item) => item.title === title)?.playlistId ||
          "";
        if (!playlistId) {
          toast.show("Playlist created");
          return;
        }
        await addTrackToPlaylist(track, playlistId);
      } catch {
        toast.show("Could not create playlist", "error");
      }
      return;
    }
    try {
      await addTrackToPlaylist(track, picked.playlistId);
    } catch {
      toast.show("Could not add to playlist", "error");
    }
  }

  table.addEventListener("contextmenu", (event) => {
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    event.preventDefault();
    selectTrackRow(root, state, Number(row.dataset.index), false);
    const track = state.visibleTracks[Number(row.dataset.index)];
    if (!track) return;
    const suggested = isSuggestedTrack(track);
    openTrackMenu(track, event, {
      includePlay: true,
      includeLike: true,
      liked: rowLiked(state, track),
      canAddHere:
        state.source === "playlist" && suggested && trackId(track) && state.playlistId,
      canRemove:
        state.source === "playlist" &&
        !suggested &&
        state.playlistId &&
        (track.setVideoId || trackId(track)),
    });
  });

  menu.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-menu]");
    if (!button) return;
    const action = button.dataset.menu;
    const track = state.menuTrack;
    hideMenu();
    if (!track) return;
    if (action === "play") {
      playStateTrack(state, track);
      return;
    }
    if ((action === "next" || action === "queue") && trackId(track)) {
      let hostOk = false;
      try {
        await MusicHost.enqueue(track, action === "next" ? "next" : "end");
        hostOk = true;
        MusicHost.invalidateQueue();
      } catch {
        hostOk = false;
      }
      const session = state.session;
      if (session?.source === "list" && session.tracks?.length) {
        const currentId = hostStatus().trackId;
        const at = session.tracks.findIndex((item) => trackId(item) === currentId);
        if (action === "next" && at >= 0) session.tracks.splice(at + 1, 0, track);
        else session.tracks.push(track);
        if (session.shuffle) session.order = shuffledOrder(session.tracks.length);
        syncSkipRoster(root, state, hostStatus());
        hostOk = true;
      }
      if (hostOk) {
        toast.show(action === "next" ? "Playing next" : "Added to queue");
        if (state.source === "now") {
          state.nowVideoId = "";
          refreshNowPlayingList(hostStatus(), true);
        }
      } else {
        toast.show("Could not add to queue", "error");
      }
      return;
    }
    if (action === "radio" && trackId(track)) {
      startRadio(track);
      return;
    }
    if (action === "like" && trackId(track)) {
      likeTrack(track);
      return;
    }
    if (action === "dislike" && trackId(track)) {
      try {
        await MusicHost.like(track, "dislike");
        state.likeOverride = { trackId: trackId(track), value: "dislike" };
        const stamp = (item) => {
          if (trackId(item) === trackId(track)) item.liked = false;
        };
        state.visibleTracks.forEach(stamp);
        state.tracks.forEach(stamp);
        (state.nowTracks || []).forEach(stamp);
        syncRowLikes(root, state);
        toast.show("Disliked");
      } catch {
        toast.show("Could not update like", "error");
      }
      refreshUi();
      return;
    }
    if (action === "album") {
      const target = MusicHost.albumOf(track);
      if (target) {
        openCollection(
          root,
          state,
          { ...target, title: track.album || track.title },
          { history: true }
        );
      }
      return;
    }
    if (action === "artist") {
      const target = MusicHost.artistOf(track);
      if (target) {
        openCollection(
          root,
          state,
          { ...target, title: track.artist || "Artist" },
          { history: true }
        );
      }
      return;
    }
    if (action === "add-here" && trackId(track)) {
      try {
        await addTrackToPlaylist(track, state.playlistId);
      } catch {
        toast.show("Could not add to playlist", "error");
      }
      return;
    }
    if (action === "add" && trackId(track)) {
      await pickAndAddToPlaylist(track);
      return;
    }
    if (action === "remove") {
      try {
        await removeTrackFromPlaylist(track);
      } catch {
        toast.show("Could not remove from playlist", "error");
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (menu.hidden) return;
    if (menu.contains(event.target)) return;
    if (event.target.closest("#ytunes-sidebar-well-more")) return;
    hideMenu();
  });

  root.querySelector("#ytunes-new-playlist").addEventListener("click", async () => {
    const title = await dialogs.openPrompt("New Playlist", "Create");
    if (!title) return;
    try {
      await MusicHost.createPlaylist(title);
      await loadPlaylists(root, state);
      toast.show("Playlist created");
    } catch {
      toast.show("Could not create playlist", "error");
    }
  });

  function mediaHotkey(event) {
    const name = `${event.key || ""} ${event.code || ""}`.toLowerCase();
    if (name.includes("mediatracknext")) return "next";
    if (name.includes("mediatrackprevious")) return "previous";
    if (name.includes("mediaplaypause")) return "playPause";
    if (name.includes("mediapause")) return "pause";
    if (name.includes("mediaplay")) return "play";
    return "";
  }

  function onHotkey(event) {
    if (!document.getElementById("ytunes-root")) return;
    const media = mediaHotkey(event);
    if (media) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Hotkey priority: prefs/search chords > dialog > menu/suggest > lyrics > nav
    const key = String(event.key || "");
    const chord = event.metaKey || event.ctrlKey;
    if (chord && key === ",") {
      event.preventDefault();
      event.stopPropagation();
      dialogs.closeJump();
      dialogs.openPrefs();
      return;
    }
    if (dialogs.onGlobalKey(event)) return;
    if (!menu.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        hideMenu();
      }
      return;
    }
    const typing = event.target?.closest?.("input, textarea, [contenteditable]");
    if (chord && key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopPropagation();
      focusSearch();
      return;
    }
    if (chord && key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopPropagation();
      dialogs.openJump();
      return;
    }
    if (key === "/" && !chord && !event.altKey && !typing) {
      event.preventDefault();
      event.stopPropagation();
      focusSearch();
      return;
    }
    if (typing) return;
    const view = root.querySelector(".ytunes-main")?.dataset.view;
    const tableFocus = root.querySelector("#ytunes-table-wrap") === document.activeElement;
    if (event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      resumeOrToggle("playPause");
      return;
    }
    if (String(event.key || "").toLowerCase() === "l") {
      event.preventDefault();
      toggleLyrics();
      return;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      goHistory(event.key === "[" ? -1 : 1);
      return;
    }
    if (event.key === "Enter") {
      if (document.activeElement?.closest?.("#ytunes-coverflow")) return;
      event.preventDefault();
      event.stopPropagation();
      if (state.selectedIndex >= 0) {
        selectTrackRow(root, state, state.selectedIndex, true);
      } else {
        selectCover(state.coverFlow.current(), true);
      }
      return;
    }
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.metaKey &&
      !event.altKey &&
      state.source === "playlist" &&
      state.selectedIndex >= 0
    ) {
      event.preventDefault();
      const selected = state.visibleTracks[state.selectedIndex];
      if (selected && !isSuggestedTrack(selected)) {
        removeTrackFromPlaylist(selected).catch(() => {
          toast.show("Could not remove from playlist", "error");
        });
      }
      return;
    }
    if (event.key === "Escape") {
      hideMenu();
      hideSuggest();
      hideSleepMenu();
      if (state.lyricsOn) toggleLyrics(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.max(
        0,
        Math.min(state.visibleTracks.length - 1, (state.selectedIndex < 0 ? 0 : state.selectedIndex) + delta)
      );
      selectTrackRow(root, state, next, false);
      scrollTrackIntoView(root, state, next);
      return;
    }
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      if (view === "coverflow" && !tableFocus) {
        event.preventDefault();
        event.stopPropagation();
        state.coverFlow.move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }
  }

  document.addEventListener("keydown", onHotkey, true);

  async function likeTrack(track) {
    const id = trackId(track);
    if (!id) return;
    const status = hostStatus();
    const next = isTrackLiked(state, id, status?.trackId === id ? status.liked : undefined)
      ? "indifferent"
      : "like";
    const liked = next === "like";
    state.likeOverride = { trackId: id, value: next };
    const stamp = (item) => {
      if (trackId(item) === id) item.liked = liked;
    };
    state.visibleTracks.forEach(stamp);
    state.tracks.forEach(stamp);
    (state.nowTracks || []).forEach(stamp);
    if (status?.trackId === id) setPressed(root, "like", liked);
    syncRowLikes(root, state);
    try {
      await MusicHost.like(track, next);
      libraryMemo.clear();
      toast.show(liked ? "Liked" : "Removed like");
    } catch {
      toast.show("Could not update like", "error");
    }
    refreshUi();
    window.setTimeout(() => refreshUi(), 400);
  }

  async function likeCurrent() {
    const status = hostStatus();
    const selected = state.visibleTracks[state.selectedIndex];
    const current = status.trackId
      ? findTrackByVideo(state, status.trackId) || { id: status.trackId }
      : selected;
    likeTrack(current);
  }

  async function cycleRepeat() {
    const order = ["off", "all", "one"];
    const current = hostStatus().repeat || "off";
    const want = order[(Math.max(0, order.indexOf(current)) + 1) % order.length];
    setRepeatUi(root, await MusicHost.setRepeat(want));
  }

  function hideSleepMenu() {
    const sleepMenu = root.querySelector("#ytunes-sleep-menu");
    if (sleepMenu) sleepMenu.hidden = true;
  }

  function formatSleepRemain(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function tickSleep(status) {
    const label = root.querySelector("#ytunes-sleep-label");
    const armed = Boolean(state.sleepUntil) || state.sleepMode === "album";
    if (!armed) {
      state.sleepWasPlaying = false;
      if (label) {
        label.hidden = true;
        label.textContent = "";
      }
      return;
    }
    if (state.sleepMode === "album") {
      const ratio = Number(status?.progress?.ratio) || 0;
      const current = findTrackByVideo(state, status?.trackId);
      const albumName = current?.album || "";
      const albumTracks = albumName
        ? state.visibleTracks.filter((track) => track.album === albumName)
        : state.visibleTracks;
      const last = albumTracks[albumTracks.length - 1];
      const isLast = !trackId(last) || trackId(last) === status?.trackId;
      if (isLast && status?.playing && ratio >= 0.995) {
        MusicHost.control("pause");
        state.sleepMode = "";
        state.sleepUntil = 0;
        state.sleepWasPlaying = false;
        toast.show("Sleep timer ended");
        if (label) {
          label.hidden = true;
          label.textContent = "";
        }
        return;
      }
      if (label) {
        label.hidden = false;
        label.textContent = "Sleep: album";
      }
    } else {
      const remain = state.sleepUntil - Date.now();
      if (remain <= 0) {
        MusicHost.control("pause");
        state.sleepUntil = 0;
        state.sleepMode = "";
        state.sleepWasPlaying = false;
        if (label) {
          label.hidden = true;
          label.textContent = "";
        }
        toast.show("Sleep timer ended");
        return;
      }
      if (label) {
        label.hidden = false;
        label.textContent = `Sleep ${formatSleepRemain(remain)}`;
      }
    }
    if (state.sleepWasPlaying && status && !status.playing) {
      if (!state.sleepPauseAt) state.sleepPauseAt = Date.now();
      if (Date.now() - state.sleepPauseAt > 2000) {
        state.sleepUntil = 0;
        state.sleepMode = "";
        state.sleepWasPlaying = false;
        state.sleepPauseAt = 0;
        toast.show("Sleep timer cancelled");
        if (label) {
          label.hidden = true;
          label.textContent = "";
        }
      }
      return;
    }
    state.sleepPauseAt = 0;
    state.sleepWasPlaying = Boolean(status?.playing);
  }

  function syncLyricsHighlight(status) {
    if (!state.lyricsOn || !state.lyricsLines?.length) return;
    const pre = root.querySelector("#ytunes-lyrics-text");
    if (!pre) return;
    const current = Number(status?.progress?.current) || 0;
    let active = 0;
    state.lyricsLines.forEach((line, index) => {
      if (current >= line.t) active = index;
    });
    const html = state.lyricsLines
      .map(
        (line, index) =>
          `<span class="${index === active ? "is-current" : ""}">${escapeHtml(line.text)}</span>`
      )
      .join("\n");
    if (pre.dataset.active !== String(active)) {
      pre.dataset.active = String(active);
      pre.innerHTML = html;
      pre.querySelector(".is-current")?.scrollIntoView({ block: "nearest" });
    }
  }

  async function toggleLyrics(force) {
    const panel = root.querySelector("#ytunes-lyrics");
    const text = root.querySelector("#ytunes-lyrics-text");
    const on = force == null ? !state.lyricsOn : force;
    state.lyricsOn = on;
    persistChrome();
    setPressed(root, "lyrics", on);
    const lyricsBtn = root.querySelector('[data-action="lyrics"]');
    if (lyricsBtn) lyricsBtn.title = on ? "Hide lyrics" : "Lyrics";
    if (!on) {
      endBusy(root, state, { slot: "lyrics" });
      panel.classList.add("is-leave");
      window.setTimeout(() => {
        panel.hidden = true;
        panel.classList.remove("is-leave");
      }, 160);
      state.lyricsLines = [];
      return;
    }
    panel.hidden = false;
    panel.classList.remove("is-leave");
    text.textContent = "Loading lyrics…";
    const lyricsSeq = (state.lyricsSeq = (state.lyricsSeq || 0) + 1);
    beginBusy(root, state, { seq: lyricsSeq, slot: "lyrics", label: "Loading lyrics…" });
    try {
      const status = hostStatus();
      state.lyricsVideoId = status.trackId || "";
      let lyricsId = "";
      if (status.trackId) {
        const queued = await MusicHost.queue(status.trackId, status.playlistId || "");
        lyricsId = queued.lyricsId || "";
        state.lyricsId = lyricsId;
      }
      if (!lyricsId) {
        text.textContent = "No lyrics for this track.";
        state.lyricsLines = [];
        return;
      }
      const parsed = await MusicHost.lyrics(lyricsId);
      state.lyricsLines = parsed.lines || [];
      if (state.lyricsLines.length) {
        text.dataset.active = "";
        syncLyricsHighlight(hostStatus());
      } else {
        text.textContent = parsed.text || "No lyrics for this track.";
      }
    } catch {
      text.textContent = "Could not load lyrics.";
      state.lyricsLines = [];
    } finally {
      endBusy(root, state, { seq: lyricsSeq, slot: "lyrics" });
    }
  }

  async function startRadio(track) {
    const seed = track || findTrackByVideo(state, hostStatus().trackId);
    if (!trackId(seed)) return;
    const started = await MusicHost.startRadio(seed);
    if (!started) {
      toast.show("Could not start radio", "error");
      return;
    }
    beginSession(state, {
      source: "radio",
      listId: started.listId,
      tracks: [seed],
      shuffle: false,
    });
    loadSource(root, state, { type: "now", playlistId: started.listId }, { history: true });
  }

  async function goHistory(delta) {
    const next = state.historyIndex + delta;
    if (next < 0 || next >= state.history.length) return;
    state.historyIndex = next;
    syncNav();
    await loadSource(root, state, state.history[next], { history: false });
    persistChrome();
  }

  function bindSplitter() {
    const split = root.querySelector("#ytunes-splitter");
    const main = root.querySelector(".ytunes-main");
    if (!split || !main) return;
    let dragSplit = null;
    const stopDrag = (persist) => {
      if (!dragSplit) return;
      dragSplit = null;
      main.classList.remove("is-resizing");
      state.coverFlow?.endResize?.();
      if (persist) persistChrome();
    };
    split.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      split.setPointerCapture(event.pointerId);
      main.classList.add("is-resizing");
      state.coverFlow?.beginResize?.();
      dragSplit = { y: event.clientY, start: state.prefs.splitRatio || 0.34 };
    });
    split.addEventListener("pointermove", (event) => {
      if (!dragSplit) return;
      const rect = main.getBoundingClientRect();
      if (!rect.height) return;
      const next = dragSplit.start + (event.clientY - dragSplit.y) / rect.height;
      state.prefs.splitRatio = applySplit(root, next);
    });
    split.addEventListener("pointerup", () => stopDrag(true));
    split.addEventListener("pointercancel", () => stopDrag(true));
    split.addEventListener("lostpointercapture", () => stopDrag(true));
  }

  function bindSystemTheme() {
    let media;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      if (sanitizeTheme(state.prefs.theme) !== "auto") return;
      applyTheme(root, state.prefs);
    };
    media.addEventListener("change", onChange);
  }

  function bindSleep() {
    const button = root.querySelector("#ytunes-sleep");
    const sleepMenu = root.querySelector("#ytunes-sleep-menu");
    function placeSleepMenu() {
      if (!button || !sleepMenu) return;
      const rootRect = root.getBoundingClientRect();
      const btnRect = button.getBoundingClientRect();
      const menuW = sleepMenu.offsetWidth || 140;
      const left = Math.max(8, btnRect.right - rootRect.left - menuW);
      sleepMenu.style.left = `${left}px`;
      sleepMenu.style.bottom = `${rootRect.bottom - btnRect.top + 4}px`;
    }
    button?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!sleepMenu) return;
      sleepMenu.hidden = !sleepMenu.hidden;
      if (!sleepMenu.hidden) placeSleepMenu();
    });
    sleepMenu?.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-sleep]");
      if (!choice) return;
      const value = choice.dataset.sleep;
      hideSleepMenu();
      if (value === "off") {
        state.sleepUntil = 0;
        state.sleepMode = "";
        toast.show("Sleep timer off");
        return;
      }
      if (value === "album") {
        state.sleepMode = "album";
        state.sleepUntil = 0;
        toast.show("Sleep at end of album");
        return;
      }
      const minutes = Number(value);
      state.sleepMode = "timer";
      state.sleepUntil = Date.now() + minutes * 60 * 1000;
      toast.show(`Sleep in ${minutes} minutes`);
    });
    document.addEventListener("click", (event) => {
      if (!sleepMenu?.hidden && !sleepMenu.contains(event.target) && event.target !== button) {
        hideSleepMenu();
      }
    });
  }

  async function restoreAndBoot() {
    state.prefs = await loadPrefs();
    applyView(root, state.prefs.view);
    applySplit(root, state.prefs.splitRatio);
    applyTheme(root, state.prefs);
    state.sortKey = state.prefs.sortKey || "";
    state.sortDir = state.prefs.sortDir || "asc";
    state.lyricsOn = Boolean(state.prefs.lyricsOn);
    if (state.prefs.source?.type && state.prefs.source.type !== "search") {
      const saved = state.prefs.source;
      state.lastSource = saved.type === "songs" ? { type: "home" } : saved;
      state.history = [state.lastSource];
      state.historyIndex = 0;
    }
    applySourceGroups(root, state.prefs.sourceGroups);
    renderPlayer(root, overlayStatus(hostStatus(), state), state);
    bootLibrary(root, state);
    if (state.lyricsOn) toggleLyrics(true);
    refreshUi();
  }

  bindSplitter();
  bindSleep();
  bindSystemTheme();
  refreshUi();
  setInterval(refreshUi, 200);
  restoreAndBoot();
  syncNav();
}

async function fetchCollectionTracks(cover, stillCurrent, onTracks) {
  const query = MusicHost.collectionQuery(cover);
  if (!query) return cover.tracks || [];
  const emit = (tracks) => {
    cover.tracks = tracks;
    if (onTracks && tracks.length) onTracks(tracks);
  };
  const parsed = await MusicHost.browse(query, {
    pages: "all",
    tracksOnly: true,
    shouldStop: stillCurrent ? () => !stillCurrent() : null,
    onProgress: (page) => {
      const tracks = uniqueTracks(page.tracks);
      if (tracks.length) emit(tracks);
    },
  });
  if (stillCurrent && !stillCurrent()) return [];
  const tracks = uniqueTracks(parsed?.tracks);
  cover.tracks = tracks;
  if (parsed?.playlistId) cover.playlistId = parsed.playlistId;
  else if (tracks[0]?.playlistId) cover.playlistId = tracks[0].playlistId;
  return tracks;
}

async function previewCoverTracks(root, state, cover, seq) {
  if (!cover || !isCoverBrowser(state)) return;
  const token = seq ?? (state.previewSeq += 1);
  const stillCurrent = () => {
    if (token !== state.previewSeq) return false;
    const current = state.coverFlow?.current();
    return (
      state.selectedCoverId === cover.id ||
      current === cover ||
      (cover.id && current?.id === cover.id)
    );
  };

  if (isSongCover(cover)) {
    if (!stillCurrent()) return;
    const tracks = topLevelSongsFromCovers(state.covers);
    state.tracks = tracks;
    state.playlistId = cover.playlistId || tracks[0]?.playlistId || state.playlistId;
    renderTracks(
      root,
      state,
      tracks,
      tracks.length ? "No tracks yet." : "No songs in this view."
    );
    highlightCoverRows(root, state, cover);
    return;
  }

  if (cover.tracks?.length) {
    if (!stillCurrent()) return;
    state.tracks = cover.tracks;
    state.playlistId = cover.playlistId || cover.tracks[0]?.playlistId || state.playlistId;
    renderTracks(root, state, cover.tracks, "No tracks yet.");
    highlightCoverRows(root, state, cover);
    return;
  }

  if (!canPreviewCover(cover) || !MusicHost.collectionQuery(cover)) {
    if (!stillCurrent()) return;
    if (!cover.tracks?.length) {
      state.tracks = [];
      renderTracks(root, state, [], "Select a collection to see its songs.");
    }
    highlightCoverRows(root, state, cover);
    return;
  }

  beginBusy(root, state, { seq: token, slot: "preview", label: "Loading songs…" });
  try {
    let paintedCount = 0;
    const tracks = await fetchCollectionTracks(cover, stillCurrent, (partial) => {
      if (!stillCurrent()) return;
      const plan = YTunesList.libraryUpdatePlan({
        paintedCount,
        nextCount: partial.length,
        isFinal: false,
      });
      if (plan === "paint") {
        state.tracks = partial;
        state.playlistId = cover.playlistId || partial[0]?.playlistId || "";
        renderTracks(root, state, partial, "No tracks yet.");
        paintedCount = partial.length;
        return;
      }
      if (plan === "status") noteLibraryFetch(root, state, partial.length);
    });
    if (!stillCurrent()) return;
    state.statusNote = "";
    state.tracks = tracks;
    state.playlistId = cover.playlistId || tracks[0]?.playlistId || "";
    if (
      YTunesList.libraryUpdatePlan({
        paintedCount,
        nextCount: tracks.length,
        isFinal: true,
      }) === "paint"
    ) {
      renderTracks(
        root,
        state,
        tracks,
        tracks.length ? "No tracks yet." : "No songs in this collection."
      );
    } else {
      renderStatusMeta(root, state, state.visibleTracks);
    }
    if (tracks.length) highlightCoverRows(root, state, cover);
  } catch (error) {
    if (!stillCurrent()) return;
    renderTracks(root, state, [], error.message || "Could not load songs.");
  } finally {
    endBusy(root, state, { seq: token, slot: "preview" });
  }
}

async function openCollection(root, state, collection, options = {}) {
  const seq = (state.loadSeq += 1);
  beginBusy(root, state, { seq, slot: "source", label: "Loading library…" });
  try {
    const query = MusicHost.collectionQuery(collection);
    if (!query) {
      renderTracks(root, state, [], "Could not load album.");
      return;
    }
    if (collection.kind === "artist") state.source = "artist";
    else if (collection.kind === "playlist") state.source = "playlist";
    else if (collection.kind === "podcast") state.source = "podcasts";
    else state.source = "album";
    state.selectedCoverId = collection.id;
    if (options.history) {
      pushHistoryFor(root, state, {
        type: collection.kind || "album",
        browseId: collection.browseId,
        playlistId: collection.playlistId,
        title: collection.title,
      });
    }
    const paint = (parsed) => {
      if (seq !== state.loadSeq) return;
      const tracks = parsed.tracks || [];
      state.playlistId = collection.playlistId || tracks[0]?.playlistId || "";
      collection.tracks = tracks;
      const nested = (parsed.collections || []).filter(
        (item) => item.kind !== "artist" && item.id !== collection.id
      );
      if (collection.kind === "artist" && nested.length) {
        showCovers(state, nested, nested[0]?.id || "");
        state.tracks = tracks;
        renderTracks(
          root,
          state,
          tracks,
          tracks.length ? "No tracks yet." : "Select an album."
        );
        renderGrid(root, state);
        applyCoverCaption(root, state, collection, selectedCaptionTrack(state));
        return;
      }
      if (!tracks.length && nested.length) {
        showCovers(state, nested, nested[0]?.id || "");
        renderTracks(root, state, [], "Select an album.");
        renderGrid(root, state);
        return;
      }
      state.tracks = tracks;
      renderTracks(
        root,
        state,
        tracks,
        tracks.length ? "No tracks yet." : "No tracks in this album."
      );
      showCovers(state, state.covers, state.selectedCoverId);
      renderGrid(root, state);
      applyCoverCaption(root, state, collection, selectedCaptionTrack(state));
    };
    let paintedCount = 0;
    const parsed = await MusicHost.browse(query, {
      pages: "all",
      shouldStop: () => seq !== state.loadSeq,
      onProgress: (next) => {
        if (seq !== state.loadSeq) return;
        const nextCount = libraryItemCount(next);
        const plan = YTunesList.libraryUpdatePlan({
          paintedCount,
          nextCount,
          isFinal: false,
        });
        if (plan === "paint") {
          paint(next);
          paintedCount = nextCount;
          endBusy(root, state, { seq, slot: "source" });
          return;
        }
        if (plan === "status") noteLibraryFetch(root, state, nextCount);
      },
    });
    if (seq !== state.loadSeq) return;
    if (!parsed) {
      renderTracks(root, state, [], "Could not load album.");
      return;
    }
    const finalCount = libraryItemCount(parsed);
    state.statusNote = "";
    if (
      YTunesList.libraryUpdatePlan({
        paintedCount,
        nextCount: finalCount,
        isFinal: true,
      }) === "paint"
    ) {
      paint(parsed);
    } else {
      renderStatusMeta(root, state, state.visibleTracks);
    }
  } catch (error) {
    if (seq !== state.loadSeq) return;
    renderTracks(root, state, [], error.message || "Could not load album.");
  } finally {
    endBusy(root, state, { seq, slot: "source" });
  }
}

function syncNavButtons(root, state) {
  const back = root.querySelector("[data-nav='back']");
  const forward = root.querySelector("[data-nav='forward']");
  if (back) back.disabled = state.historyIndex <= 0;
  if (forward) forward.disabled = state.historyIndex >= state.history.length - 1;
}

function pushHistoryFor(root, state, source) {
  const entry = {
    type: source.type,
    browseId: source.browseId,
    playlistId: source.playlistId,
    title: source.title,
    params: source.params,
    query: source.query || "",
  };
  const last = state.history[state.historyIndex];
  if (last && sourceKey(last) === sourceKey(entry)) {
    syncNavButtons(root, state);
    return;
  }
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(entry);
  state.historyIndex = state.history.length - 1;
  syncNavButtons(root, state);
}

async function loadPlaylists(root, state) {
  const host = root.querySelector("#ytunes-playlists");
  try {
    state.playlists = await MusicHost.playlists();
    host.innerHTML = state.playlists
      .map(
        (item) =>
          `<button type="button" data-playlist="${escapeHtml(item.playlistId)}">${sourceIconHtml(
            "playlist"
          )}<span class="ytunes-source-label">${escapeHtml(item.title)}</span></button>`
      )
      .join("");
    if (!state.playlists.length) {
      host.innerHTML = `<p class="ytunes-source-empty">No playlists</p>`;
    }
  } catch {
    host.innerHTML = `<p class="ytunes-source-empty">Could not load playlists</p>`;
  }
  setSidebarSelection(root, state.lastSource);
  refreshMarquees(root);
}

function applyStorefront(root, state, page, emptyMessage) {
  const parsed = limitQuickPicks(page || {});
  const { collections, songCovers } = storefrontCovers(parsed);
  const tracks = uniqueTracks(
    (parsed.tracks || []).concat(topLevelSongsFromCovers(songCovers))
  );
  const albumish = collections.filter((item) => !isSongCover(item));
  const songTiles = songCovers.filter((cover) =>
    /quick picks|listen again|forgotten|mixed for you|songs/i.test(cover.shelf || "")
  );
  applyParsed(
    root,
    state,
    {
      tracks,
      collections: albumish.concat(songTiles),
      lyricsId: parsed.lyricsId,
      chips: parsed.chips || [],
      shelves: parsed.shelves || [],
    },
    tracks.length
      ? emptyMessage
      : collections.length
        ? emptyMessage || STOREFRONT_EMPTY
        : MusicHost.strings.signInItems
  );
}

function moodButtonsHtml(chips) {
  return chips
    .map(
      (chip) =>
        `<button type="button" data-source="mood" data-browse="${escapeHtml(
          chip.browseId || ""
        )}" data-params="${escapeHtml(chip.params || "")}" data-title="${escapeHtml(
          chip.title
        )}">${sourceIconHtml("mood")}<span class="ytunes-source-label">${escapeHtml(
          chip.title
        )}</span></button>`
    )
    .join("");
}

async function loadMoods(root, state) {
  const host = root.querySelector("#ytunes-moods");
  if (!host) return;
  host.innerHTML = "";
  let chips = [];
  try {
    chips = await MusicHost.moods();
  } catch {
    chips = [];
  }
  host.innerHTML = chips.length
    ? moodButtonsHtml(chips)
    : `<p class="ytunes-source-empty">No stations</p>`;
  setSidebarSelection(root, state.lastSource);
  refreshMarquees(root);
}

const LIBRARY_MEMO_MS = 120000;
const libraryMemo = new Map();

function readLibraryMemo(key) {
  const hit = libraryMemo.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > LIBRARY_MEMO_MS) {
    libraryMemo.delete(key);
    return null;
  }
  return hit;
}

function writeLibraryMemo(key, parsed) {
  libraryMemo.set(key, { at: Date.now(), parsed });
}

/** An empty library usually means "not signed in", which needs a different nudge. */
async function isEmptyBecauseSignedOut(parsed) {
  if (parsed?.tracks?.length || parsed?.collections?.length) return false;
  if (!MusicHost.capabilities.signedIn) return false;
  return !(await MusicHost.signedIn());
}

function libraryItemCount(parsed) {
  return Math.max(
    (parsed?.tracks || []).length,
    (parsed?.collections || []).length
  );
}

function noteLibraryFetch(root, state, count) {
  state.statusNote = count > 0 ? `Fetching more (${count})…` : "Fetching more…";
  renderStatusMeta(root, state, state.visibleTracks);
}

function applyLibraryParsed(root, state, type, source, parsed, emptyMessage, options = {}) {
  const collectionFirst =
    !parsed.tracks.length ||
    ["albums", "artists", "artist", "album"].includes(type);
  applyParsed(
    root,
    state,
    {
      tracks: parsed.tracks,
      collections: collectionFirst ? parsed.collections : [],
      lyricsId: parsed.lyricsId,
    },
    emptyMessage,
    options
  );
  if ((type === "playlist" || type === "album") && parsed.tracks.length) {
    const pid = playlistIdOf(source.playlistId || parsed.tracks[0]?.playlistId);
    state.playlistId = pid;
    if (pid && !radioListId(pid)) {
      const rows =
        type === "playlist" ? splitPlaylistRows(state.tracks).owned : state.tracks;
      for (const track of rows) {
        if (!track.playlistId || radioListId(track.playlistId)) track.playlistId = pid;
      }
    }
  }
}

async function loadSource(root, state, source, options = {}) {
  const seq = (state.loadSeq += 1);
  const type = source.type || "songs";
  if (!state.visibleTracks.length && !state.covers.length && type !== "now") {
    setCoverEmptyMessage(root, "Loading library…");
  }

  state.source = type;
  state.followVideoId = "";
  state.statusNote =
    type === "home" ? MusicHost.strings.homeStatus : type === "mixes" ? "From Home" : "";
  state.playlistId = MusicHost.listIdFor(source);
  if (type !== "search") {
    state.lastSource = {
      type,
      browseId: source.browseId,
      playlistId: source.playlistId,
      params: source.params,
      title: source.title,
    };
  }
  if (options.history) pushHistoryFor(root, state, state.lastSource);
  setSidebarSelection(root, type === "search" ? { type: "search" } : state.lastSource);
  syncNavButtons(root, state);
  beginBusy(root, state, {
    seq,
    slot: "source",
    label:
      type === "search"
        ? "Searching…"
        : type === "now"
          ? "Loading queue…"
          : type === "home"
            ? "Loading Home…"
            : "Loading library…",
  });

  try {
    if (type === "search") {
      const query = source.query || source.title || "";
      const searchInput = root.querySelector("#ytunes-search");
      if (searchInput && query) searchInput.value = query;
      const clear = root.querySelector("#ytunes-search-clear");
      if (clear) clear.hidden = !searchInput?.value;
      if (!query) {
        renderTracks(root, state, [], "No results.");
        return;
      }
      const parsed = await MusicHost.search(query);
      if (seq !== state.loadSeq) return;
      state.statusNote = `Results for “${query}”`;
      applyParsed(root, state, parsed, `No results for “${query}”.`);
      return;
    }

    if (type === "radio") {
      const live = hostStatus();
      const seed =
        findTrackByVideo(state, live.trackId) ||
        (live.trackId ? { id: live.trackId } : state.visibleTracks[state.selectedIndex]);
      const started = trackId(seed)
        ? options.play === false
          ? { listId: MusicHost.radioListFor(seed) }
          : await MusicHost.startRadio(seed)
        : null;
      if (!started?.listId) {
        if (seq !== state.loadSeq) return;
        renderTracks(root, state, [], "Play a song, then start Radio.");
        return;
      }
      beginSession(state, { source: "radio", listId: started.listId, tracks: [seed] });
      source = { type: "now", playlistId: started.listId };
    }

    if ((source.type || type) === "now") {
      state.nowVideoId = "";
      const painted = overlayStatus(hostStatus(), state);
      const seed = nowPlayingSeed(painted, state.prefs);
      if (seed) {
        applyNowPlaying(root, state, [seed], painted, {
          resetCovers: true,
          scroll: true,
        });
      } else {
        renderTracks(root, state, [], "Loading queue…");
        setCoverEmptyMessage(root, "Loading queue…");
      }
      const status = await waitForNowPlayingStatus(seq, state);
      if (seq !== state.loadSeq) return;
      const stored = sanitizeNowPlaying(state.prefs?.nowPlaying);
      const videoId = status.trackId || stored?.videoId || "";
      const playlistId =
        source.playlistId || status.playlistId || stored?.playlistId || "";
      let tracks = [];
      let lyricsId = "";
      let queuedPlaylist = "";
      try {
        const queued = await MusicHost.queue(videoId, playlistId);
        if (seq !== state.loadSeq) return;
        tracks = queued.tracks || [];
        lyricsId = queued.lyricsId || "";
        queuedPlaylist = queued.playlistId || "";
      } catch {
        tracks = [];
      }
      if (!tracks.length) {
        const fallback = nowPlayingSeed(overlayStatus(status, state), state.prefs);
        if (fallback) tracks = [fallback];
      }
      if (seq !== state.loadSeq) return;
      if (!tracks.length) {
        renderTracks(root, state, [], "Nothing is playing.");
        showCovers(state, [], "");
        setCoverEmptyMessage(root, "Nothing is playing.");
        return;
      }
      state.playlistId = source.playlistId || queuedPlaylist || state.playlistId;
      applyNowPlaying(root, state, tracks, overlayStatus(status, state), {
        resetCovers: true,
        lyricsId,
        playlistId: state.playlistId,
        scroll: true,
      });
      if (state.session?.source === "radio" || state.session?.source === "queue") {
        state.session.listId = queuedPlaylist || state.session.listId;
        state.session.tracks = playableSessionTracks(tracks);
      } else if (!state.session?.tracks?.length) {
        beginSession(state, {
          source: radioListId(state.playlistId) ? "radio" : "queue",
          listId: state.playlistId,
          tracks,
        });
      }
      state.nowVideoId = tracks.length > 1 ? videoId : "";
      return;
    }

    if (type === "videos") {
      const parsed = await MusicHost.browse(source, {
        shouldStop: () => seq !== state.loadSeq,
      });
      if (seq !== state.loadSeq) return;
      const hasTracks = Boolean(parsed?.tracks?.length);
      applyStorefront(
        root,
        state,
        parsed,
        hasTracks || !parsed?.collections?.length
          ? "No music videos in your library."
          : "Select a video. Double-click a cover to open it."
      );
      return;
    }

    if (type === "podcasts") {
      const parsed = await MusicHost.browse(source, {
        shouldStop: () => seq !== state.loadSeq,
      });
      if (seq !== state.loadSeq) return;
      applyStorefront(
        root,
        state,
        parsed,
        "Select a podcast. Double-click a cover to open it."
      );
      return;
    }

    if (type === "mixes" || type === "mood") {
      const parsed = await MusicHost.browse(source, {
        shouldStop: () => seq !== state.loadSeq,
      });
      if (seq !== state.loadSeq) return;
      applyStorefront(root, state, parsed, type === "mood" ? STOREFRONT_EMPTY : undefined);
      return;
    }

    if (type === "home" || type === "explore" || type === "charts") {
      const parsed = await MusicHost.browse(source, {
        shouldStop: () => seq !== state.loadSeq,
      });
      if (seq !== state.loadSeq) return;
      if (!parsed) {
        renderTracks(root, state, [], "Could not load library.");
        return;
      }
      applyStorefront(root, state, parsed);
      return;
    }

    const pages = YTunesList.libraryBrowsePages(type);
    const memoKey = sourceKey(source);
    const cached = pages === "all" ? readLibraryMemo(memoKey) : null;
    const collectionFirst = ["albums", "artists", "artist", "album"].includes(type);
    let emptyMessage = collectionFirst
      ? "Select an album. Double-click a cover to open it."
      : "No items.";
    if (cached?.parsed) {
      applyLibraryParsed(root, state, type, source, cached.parsed, emptyMessage);
      endBusy(root, state, { seq, slot: "source" });
      if (Date.now() - cached.at < 15000) return;
      const parsed = await MusicHost.browse(source, {
        pages,
        shouldStop: () => seq !== state.loadSeq,
      });
      if (seq !== state.loadSeq || !parsed) return;
      writeLibraryMemo(memoKey, parsed);
      if (await isEmptyBecauseSignedOut(parsed)) emptyMessage = MusicHost.strings.signInLibrary;
      applyLibraryParsed(root, state, type, source, parsed, emptyMessage, {
        keepSelection: true,
      });
      return;
    }
    let paintedCount = 0;
    const parsed = await MusicHost.browse(source, {
      pages,
      shouldStop: () => seq !== state.loadSeq,
      onProgress: (next) => {
        if (seq !== state.loadSeq) return;
        const nextCount = libraryItemCount(next);
        const plan = YTunesList.libraryUpdatePlan({
          paintedCount,
          nextCount,
          isFinal: false,
        });
        if (plan === "paint") {
          applyLibraryParsed(root, state, type, source, next, emptyMessage);
          paintedCount = nextCount;
          endBusy(root, state, { seq, slot: "source" });
          return;
        }
        if (plan === "status" && pages === "all") {
          noteLibraryFetch(root, state, nextCount);
        }
      },
    });
    if (seq !== state.loadSeq) return;
    if (!parsed) {
      renderTracks(root, state, [], "Could not load library.");
      return;
    }
    if (await isEmptyBecauseSignedOut(parsed)) emptyMessage = MusicHost.strings.signInLibrary;
    const finalCount = libraryItemCount(parsed);
    const finalPlan = YTunesList.libraryUpdatePlan({
      paintedCount,
      nextCount: finalCount,
      isFinal: true,
    });
    state.statusNote = "";
    if (finalPlan === "paint") {
      applyLibraryParsed(root, state, type, source, parsed, emptyMessage, {
        keepSelection: paintedCount > 0,
      });
    } else {
      renderStatusMeta(root, state, state.visibleTracks);
    }
    if (pages === "all") writeLibraryMemo(memoKey, parsed);
  } catch (error) {
    if (seq !== state.loadSeq) return;
    setCoverEmptyMessage(root, "Could not load library.");
    renderTracks(root, state, [], error.message || "Could not load library.");
  } finally {
    endBusy(root, state, { seq, slot: "source" });
  }
}

function bootLibrary(root, state) {
  loadPlaylists(root, state);
  loadMoods(root, state);
  loadSource(root, state, state.lastSource || { type: "home" }, {
    history: false,
    play: false,
  });
}
