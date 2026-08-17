const BROWSE_IDS = {
  songs: "FEmusic_liked_videos",
  liked: "VLLM",
  albums: "FEmusic_liked_albums",
  artists: "FEmusic_library_corpus_track_artists",
  recents: "FEmusic_history",
  home: "FEmusic_home",
  explore: "FEmusic_explore",
  charts: "FEmusic_charts",
  podcasts: "FEmusic_podcasts",
  moods: "FEmusic_moods_and_genres",
};

const DEFAULT_MOODS = [
  "Relax",
  "Sleep",
  "Feel good",
  "Sad",
  "Romance",
  "Energise",
  "Party",
  "Commute",
  "Work out",
  "Focus",
];

const STOREFRONT_EMPTY = "Select a mix. Double-click a cover to open it.";

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

function isLibraryShelf(item) {
  return /from your library/i.test(item?.shelf || "");
}

function isPodcastish(item) {
  const hay = `${item?.shelf || ""} ${item?.kind || ""} ${item?.subtitle || ""} ${item?.title || ""}`;
  return /podcast/i.test(hay) || String(item?.browseId || "").startsWith("MPSP");
}

function isVideoish(item) {
  const hay = `${item?.shelf || ""} ${item?.title || ""} ${item?.kind || ""}`;
  if (/podcast/i.test(hay)) return false;
  const type = String(item?.musicVideoType || "").toUpperCase();
  if (type.includes("OMV") || type.includes("UGC") || type.includes("LIVE")) return true;
  return /video/i.test(hay);
}

function isMixCollection(item) {
  if (isLibraryShelf(item) || isPodcastish(item)) return false;
  const list = String(item?.playlistId || item?.browseId || "").replace(/^VL/, "");
  if (list.startsWith("RD") && !list.startsWith("RDAMVM")) return true;
  const hay = `${item?.title || ""} ${item?.subtitle || ""} ${item?.shelf || ""}`.toLowerCase();
  return /\b(mix|supermix|radio|station)\b/.test(hay);
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

function collectionPlaylistId(cover) {
  return (
    cover?.playlistId ||
    cover?.endpoint?.watchEndpoint?.playlistId ||
    cover?.endpoint?.watchPlaylistEndpoint?.playlistId ||
    ""
  );
}

function collectionBrowseBody(cover) {
  if (!cover) return null;
  let browseId = String(cover.browseId || "");
  const playlistId = String(collectionPlaylistId(cover));
  if (browseId && !browseId.startsWith("VL") && /^(PL|RD|OLAK|LM)/.test(browseId)) {
    browseId = `VL${browseId}`;
  }
  if (browseId) return { browseId };
  if (playlistId) {
    return { browseId: playlistId.startsWith("VL") ? playlistId : `VL${playlistId}` };
  }
  return null;
}

function canPreviewCover(cover) {
  if (!cover) return false;
  if (isSongCover(cover)) return true;
  return Boolean(cover.tracks?.length || collectionBrowseBody(cover));
}

function isSongCover(cover) {
  if (!cover) return false;
  if (cover.kind === "song" || cover.kind === "video") return true;
  if (
    cover.kind === "artist" ||
    cover.kind === "podcast" ||
    cover.kind === "album" ||
    cover.kind === "playlist"
  ) {
    return false;
  }
  const browseId = String(cover.browseId || "");
  if (browseId.startsWith("MPRE") || browseId.startsWith("UC") || browseId.startsWith("MPLA")) {
    return false;
  }
  const hay = `${cover.subtitle || ""} ${cover.kind || ""}`;
  if (/\bplaylist\b/i.test(hay) || /\balbum\b/i.test(hay)) return false;
  if (/\bsong\b/i.test(hay) || /\bvideo\b/i.test(hay)) return true;
  const videoId =
    cover.videoId ||
    cover.endpoint?.watchEndpoint?.videoId ||
    (cover.tracks?.length === 1 ? cover.tracks[0].videoId : "");
  if (cover.kind === "playlist" || browseId.startsWith("VL")) return false;
  if (!cover.kind && cover.tracks?.length && !browseId && !cover.playlistId) return true;
  if (videoId && (cover.tracks?.length || 1) <= 1) return true;
  return false;
}

function trackFromSongCover(cover) {
  if (cover.tracks?.[0]) return cover.tracks[0];
  const videoId = cover.videoId || cover.endpoint?.watchEndpoint?.videoId || "";
  return {
    id: videoId || cover.id,
    title: cover.title,
    artist: cover.artist || "",
    album: cover.album || "",
    artwork: cover.artwork,
    videoId,
    playlistId: cover.playlistId,
    browseId: cover.browseId,
    endpoint: cover.endpoint,
    shelf: cover.shelf,
  };
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
    const key = track.videoId || track.id || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(track);
  }
  return out;
}

function isSongShelfCollection(item) {
  const title = String(item?.title || "").toLowerCase();
  return /^(songs|tracks|top songs|popular|singles)$/i.test(title) || /\bsongs\b/.test(title);
}

async function collectSongsFromParsed(parsed, cover, stillCurrent) {
  let tracks = uniqueTracks(parsed.tracks);
  if (tracks.length) return tracks;
  const collections = (parsed.collections || []).filter((item) => {
    if (!collectionBrowseBody(item)) return false;
    if (cover?.browseId && item.browseId === cover.browseId) return false;
    if (cover?.id && item.id === cover.id) return false;
    return true;
  });
  const preferred = collections.filter(isSongShelfCollection);
  const rest = collections.filter(
    (item) => !isSongShelfCollection(item) && item.kind !== "artist"
  );
  const queue = [...preferred, ...rest].slice(0, 3);
  for (const item of queue) {
    if (stillCurrent && !stillCurrent()) return tracks;
    const body = collectionBrowseBody(item);
    try {
      const next = await YTM.browseParsed(body, 2);
      tracks = uniqueTracks(tracks.concat(next.tracks || []));
      if (tracks.length >= 250) break;
    } catch {
      /* skip a nested album that fails */
    }
  }
  return tracks;
}

function isMoodChip(chip) {
  const title = String(chip?.title || "").toLowerCase();
  if (!title) return false;
  if (/^podcasts?$/.test(title)) return false;
  if (/^new releases?$/.test(title)) return false;
  if (/^charts?$/.test(title)) return false;
  if (/moods? (and|&) genres/.test(title)) return false;
  if (/^play all$/.test(title) || /^more$/.test(title)) return false;
  return true;
}

function uniqueChips(chips) {
  const seen = new Set();
  const out = [];
  for (const chip of chips || []) {
    const title = String(chip.title || "").trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...chip, title });
  }
  return out;
}

function pickMoodChips(chips) {
  const moodish = uniqueChips(chips).filter(isMoodChip);
  const named = moodish.filter((chip) =>
    DEFAULT_MOODS.some(
      (name) =>
        name.toLowerCase() === chip.title.toLowerCase() ||
        (name === "Energise" && /^energize$/i.test(chip.title))
    )
  );
  if (named.length) return named.filter((chip) => chip.browseId || chip.params);
  return moodish.filter((chip) => chip.browseId || chip.params);
}

function storefrontCovers(parsed) {
  const collections = (parsed.collections || []).filter((item) => !isLibraryShelf(item));
  const seen = new Set(collections.map((item) => item.videoId).filter(Boolean));
  const loose = (parsed.tracks || []).filter((track) => {
    if (isLibraryShelf(track)) return false;
    if (!(track.videoId || track.endpoint?.watchEndpoint)) return false;
    if (track.videoId && seen.has(track.videoId)) return false;
    return true;
  });
  const songCovers = coversFromTracks(loose).map((cover) => ({
    ...cover,
    kind: "song",
    shelf: cover.tracks?.[0]?.shelf || "",
    subtitle: cover.tracks?.[0]?.artist || cover.subtitle,
    videoId: cover.tracks?.[0]?.videoId || "",
  }));
  return { collections, songCovers };
}

function albumBrowseOf(track) {
  if (!track) return "";
  if (track.albumBrowseId) return track.albumBrowseId;
  const id = String(track.browseId || "");
  if (id.startsWith("MPRE")) return id;
  if (id && !id.startsWith("UC")) return id;
  return "";
}

function artistBrowseOf(track) {
  if (!track) return "";
  if (track.artistBrowseId) return track.artistBrowseId;
  const id = String(track.browseId || "");
  if (id.startsWith("UC")) return id;
  return "";
}

function formatLcdSub(status, track) {
  const same = Boolean(track?.videoId && status?.videoId && track.videoId === status.videoId);
  const artist = (same && track.artist) || status?.artist || status?.author || track?.artist || "";
  const album = (same && track.album) || status?.album || track?.album || "";
  const year = (same && track.year) || status?.year || track?.year || "";
  if (artist && album && year) return `${artist} — ${album} (${year})`;
  if (artist && album) return `${artist} — ${album}`;
  if (artist && year) return `${artist} (${year})`;
  if (artist) return artist;
  return status?.subtitle || "YouTube Music";
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
    if (track.videoId) seen.add(track.videoId);
  }
  for (const track of tracks || []) {
    if (!isSuggestedTrack(track)) continue;
    if (track.videoId && seen.has(track.videoId)) continue;
    suggested.push(track);
  }
  return { owned, suggested };
}

function coverIdForTrack(track) {
  if (!track) return "";
  if (track.albumBrowseId) return track.albumBrowseId;
  if (track.album) return `album:${track.album}:${track.artist || ""}`;
  return track.videoId || track.id || `t:${track.title}`;
}

function coversFromTracks(tracks) {
  const covers = [];
  const seen = new Set();
  for (const track of tracks) {
    const key = coverIdForTrack(track);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const group = tracks.filter((item) => coverIdForTrack(item) === key);
    covers.push({
      id: key,
      title: track.album || track.title,
      subtitle: track.artist,
      artist: track.artist,
      album: track.album || "",
      kind: track.album && group.length > 1 ? "album" : "song",
      videoId: group.length === 1 ? track.videoId || "" : "",
      artwork: track.artwork,
      tracks: group,
    });
  }
  return covers;
}

function queueCovers(tracks) {
  return (tracks || []).map((track, index) => ({
    id: track.videoId || track.id || `q:${index}`,
    title: track.title,
    subtitle: track.artist,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
    kind: "song",
    videoId: track.videoId,
    tracks: [track],
    endpoint: track.endpoint,
  }));
}

function queueFingerprint(tracks) {
  return (tracks || []).map((track) => track.videoId || track.id || track.title).join("\n");
}

function selectedCaptionTrack(state) {
  if (state.selectedIndex < 0) return null;
  return state.visibleTracks?.[state.selectedIndex] || null;
}

function applyCoverCaption(root, state, cover, track) {
  const item = cover || state.coverFlow?.current() || null;
  state.coverFlow?.setCaptionTrack?.(track || null);
  renderArtwell(root, item, probe(), track || null);
}

function applyNowPlaying(root, state, tracks, status, options = {}) {
  const playingId = status?.videoId || "";
  const keep =
    options.keepSelection && state.visibleTracks[state.selectedIndex]?.videoId;
  const wasThin =
    (state.covers || []).length <= 1 || (state.tracks || []).length <= 1;
  state.tracks = tracks;
  if (options.lyricsId) state.lyricsId = options.lyricsId;
  if (options.playlistId) state.playlistId = options.playlistId;
  state.nowTracks = tracks;
  const preferred = keep || playingId;
  let index = preferred
    ? tracks.findIndex((item) => item.videoId === preferred)
    : -1;
  if (index < 0 && playingId) {
    index = tracks.findIndex((item) => item.videoId === playingId);
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
  if (options.scroll) {
    root
      .querySelector("#ytunes-tracks tr.is-selected")
      ?.scrollIntoView({ block: "nearest" });
  }
}

function coverForTrack(state, track) {
  if (!track || !state.covers.length) return null;
  const videoId = track.videoId || "";
  const id = coverIdForTrack(track);
  return (
    (videoId &&
      state.covers.find(
        (cover) => cover.videoId === videoId || cover.id === videoId
      )) ||
    state.covers.find((cover) =>
      cover.tracks?.some((item) => item.videoId && item.videoId === videoId)
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
  renderArtwell(root, cover, probe(), track);
}

function indexOfVideo(tracks, videoId) {
  if (!videoId) return -1;
  return (tracks || []).findIndex((item) => item.videoId === videoId);
}

function playlistIdOf(value) {
  return String(value || "").replace(/^VL/, "");
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
  root
    .querySelector(`#ytunes-tracks tr[data-index="${index}"]`)
    ?.scrollIntoView({ block: "nearest" });
  const active = document.activeElement;
  if (active && (active.matches("input, textarea") || active.closest(".ytunes-dialog, .ytunes-jump"))) {
    return;
  }
  root.querySelector("#ytunes-table-wrap")?.focus({ preventScroll: true });
}

function followPlayingTrack(root, state, status) {
  const videoId = status?.videoId || "";
  if (!videoId) return;
  if (state.coverFlow?.isDragging?.()) return;
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

function playTrack(track, playlistId, index, options = {}) {
  if (!track) return Promise.resolve();
  const endpoint = track.endpoint ? { ...track.endpoint } : {};
  const watch = {
    ...(endpoint.watchEndpoint || {}),
    videoId: track.videoId || endpoint.watchEndpoint?.videoId,
  };
  const ownList = Boolean(options.ownList);
  const listId = String(playlistId || track.playlistId || "").replace(/^VL/, "");
  if (listId && !ownList) watch.playlistId = listId;
  if (Number.isFinite(index) && index >= 0) watch.index = index;
  if (watch.videoId) endpoint.watchEndpoint = watch;
  if (!endpoint.watchEndpoint && !endpoint.browseEndpoint) {
    return Promise.reject(new Error("Nothing to play"));
  }
  return YTM.play({ endpoint, ownList });
}

function playlistIdForPlay(state, track) {
  if (isSuggestedTrack(track)) return "";
  const fromTrack = String(track?.playlistId || "").replace(/^VL/, "");
  const fromState = String(state?.playlistId || "").replace(/^VL/, "");
  if (state?.source === "now") return fromTrack;
  if (fromState && !fromState.startsWith("RD")) return fromState;
  if (fromTrack && !fromTrack.startsWith("RD")) return fromTrack;
  return fromState || fromTrack;
}

function playlistIndexOf(state, track) {
  if (!track || isSuggestedTrack(track)) return undefined;
  const raw = Number(track.index);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  if (state?.source === "now") return undefined;
  const id = track.videoId;
  const list =
    state?.source === "playlist"
      ? splitPlaylistRows(state.tracks).owned
      : state?.tracks;
  if (!id || !list?.length) return undefined;
  const at = list.findIndex((item) => item.videoId === id);
  return at >= 0 ? at : undefined;
}

function playableSessionTracks(tracks) {
  return (tracks || []).filter((track) => track?.videoId && !isSuggestedTrack(track));
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
  const list = String(id || "").replace(/^VL/, "");
  return list.startsWith("RD") ? list : "";
}

function sessionTracksForPlay(state, track) {
  const shown = state.visibleTracks?.length ? state.visibleTracks : state.tracks;
  if (state.source === "playlist") return splitPlaylistRows(shown).owned;
  if (state.source === "liked" || state.source === "songs" || state.source === "recents") {
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
  state.session = {
    source: options.source || "list",
    listId: String(options.listId || "").replace(/^VL/, ""),
    tracks,
    shuffle,
    order: shuffle && tracks.length ? shuffledOrder(tracks.length) : null,
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

function playStateTrack(state, track) {
  const fromRadio = state.session?.source === "radio" && state.source === "now";
  const listId = fromRadio
    ? state.session.listId || playlistIdForPlay(state, track)
    : playlistIdForPlay(state, track);
  beginSession(state, {
    source: fromRadio ? "radio" : "list",
    listId: fromRadio ? state.session.listId || listId : listId,
    tracks: fromRadio ? state.session.tracks : sessionTracksForPlay(state, track),
  });
  return playTrack(track, fromRadio ? listId : "", playlistIndexOf(state, track), {
    ownList: !fromRadio,
  });
}

function skipRoster(state, status) {
  const session = state.session;
  if (session?.tracks?.length) {
    const tracks = orderedSessionTracks(session);
    const radio = session.source === "radio" || Boolean(radioListId(session.listId));
    return {
      tracks,
      playlistId: radio ? session.listId : isConcretePlaylist(session.listId) ? session.listId : "",
      ownList: !radio,
    };
  }

  const playingList = String(status?.playlistId || "").replace(/^VL/, "");
  const stateList = String(state.playlistId || "").replace(/^VL/, "");
  const concretePlaying = isConcretePlaylist(playingList) ? playingList : "";
  const concreteState = isConcretePlaylist(stateList) ? stateList : "";

  if (state.source === "playlist" || state.source === "liked") {
    const owned =
      state.source === "playlist"
        ? splitPlaylistRows(state.tracks || []).owned
        : state.tracks || [];
    const tracks = owned.filter((track) => track.videoId);
    if (tracks.length) {
      return { tracks, playlistId: concreteState || concretePlaying, ownList: true };
    }
  }

  const queued = (
    state.source === "now" ? state.tracks : state.nowTracks || []
  ).filter((track) => track.videoId);
  if (queued.length) {
    const radio = Boolean(radioListId(playingList || stateList));
    return { tracks: queued, playlistId: radio ? playingList || stateList : concretePlaying, ownList: !radio };
  }

  const playingId = status?.videoId || "";
  const visible = (state.visibleTracks || []).filter(
    (track) => track.videoId && !isSuggestedTrack(track)
  );
  if (playingId && visible.some((track) => track.videoId === playingId)) {
    return { tracks: visible, playlistId: concretePlaying, ownList: true };
  }

  return { tracks: [], playlistId: concretePlaying, ownList: true };
}

function syncSkipRoster(root, state, status) {
  const { tracks, playlistId, ownList } = skipRoster(state, status);
  const ids = tracks
    .map((track) => track.videoId)
    .filter((id) => /^[\w-]{11}$/.test(id));
  const list = String(playlistId || "").replace(/^VL/, "");
  const skipPlaylist = ownList ? (isConcretePlaylist(list) ? list : "") : list;
  const playingId = status?.videoId || "";
  const skipIndex = playingId ? ids.indexOf(playingId) : -1;
  if (ids.length > 1 && playingId && ids.includes(playingId)) {
    state.nowTracks = tracks;
  }
  const transport = root.querySelector(".ytunes-transport");
  [root, transport].forEach((node) => {
    if (!node) return;
    if (ids.length) node.dataset.skipIds = ids.join(",");
    else delete node.dataset.skipIds;
    if (skipPlaylist) node.dataset.skipPlaylist = skipPlaylist;
    else delete node.dataset.skipPlaylist;
    if (ownList) node.dataset.ownList = "1";
    else delete node.dataset.ownList;
    if (skipIndex >= 0) node.dataset.skipIndex = String(skipIndex);
    else delete node.dataset.skipIndex;
  });
}

function radioId(videoId) {
  return videoId ? `RDAMVM${videoId}` : "";
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

function retargetSourceIcons(root) {
  const base = `${location.pathname}${location.search}`;
  root.querySelectorAll(".ytunes-source-icon use").forEach((node) => {
    const href = node.getAttribute("href") || "";
    const id = href.includes("#") ? href.split("#").pop() : "";
    if (!id) return;
    node.setAttribute("href", `${base}#${id}`);
  });
}

function playingArtwork(state, status) {
  const id = status?.videoId || "";
  if (id) {
    const track = findTrackByVideo(state, id);
    if (track?.artwork && isArtworkSrc(track.artwork)) return track.artwork;
    const cover = (state.covers || []).find(
      (item) =>
        item.videoId === id ||
        item.tracks?.some((row) => row.videoId === id)
    );
    if (cover?.artwork && isArtworkSrc(cover.artwork)) return cover.artwork;
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
    setMarqueeText(subEl, formatLcdSub(status, findTrackByVideo(state, status?.videoId)));
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
  const realTitle = Boolean(title && title !== "yTunes" && !/^youtube music$/i.test(title));
  if (status?.videoId && realTitle) return false;
  if (status?.videoId && (status.artwork || status.cover)) return false;
  if (realTitle && (status?.artist || status?.subtitle || status?.artwork || status?.cover)) {
    return false;
  }
  return true;
}

function nowPlayingSnapshot(status) {
  if (isIdleStatus(status)) return null;
  return sanitizeNowPlaying({
    videoId: status.videoId,
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
  if (!videoId && (title === "yTunes" || /^youtube music$/i.test(title))) {
    return null;
  }
  return {
    id: videoId || "now",
    title: title || "Now Playing",
    artist: String(info.artist || "").trim(),
    album: String(info.album || "").trim(),
    year: String(info.year || "").trim(),
    duration: info.progress?.durationLabel || info.duration || "",
    artwork: String(info.cover || info.artwork || "").trim(),
    videoId,
    playlistId: String(info.playlistId || "").replace(/^VL/, ""),
  };
}

function nowPlayingSeed(status, prefs) {
  if (status && !isIdleStatus(status)) {
    const live = trackFromNowPlaying(status);
    if (live) return live;
  }
  return trackFromNowPlaying(sanitizeNowPlaying(prefs?.nowPlaying));
}

function setCoverEmptyMessage(root, message) {
  const empty = root.querySelector("#ytunes-cover-empty");
  if (!empty) return;
  empty.hidden = false;
  empty.textContent = message;
}

async function waitForNowPlayingStatus(seq, state, maxMs = 1200) {
  const deadline = Date.now() + maxMs;
  await refreshPlayerSnap();
  let status = probe();
  while (
    Date.now() < deadline &&
    seq === state.loadSeq &&
    !status?.videoId &&
    !String(status?.playlistId || "").replace(/^VL/, "")
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    await refreshPlayerSnap();
    status = probe();
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
  return state.source === "liked" || playlistIdOf(state.playlistId) === "LM";
}

function sourceSortable(state) {
  return ["songs", "liked", "playlist", "recents", "search"].includes(state.source);
}

function findTrackByVideo(state, videoId) {
  if (!videoId) return null;
  return (
    state.visibleTracks.find((item) => item.videoId === videoId) ||
    state.tracks.find((item) => item.videoId === videoId) ||
    (state.nowTracks || []).find((item) => item.videoId === videoId) ||
    null
  );
}

function playingMenuTrack(state, status) {
  if (isIdleStatus(status) || !status?.videoId) return null;
  const live = trackFromNowPlaying(status);
  const found = findTrackByVideo(state, status.videoId);
  if (!live && !found) return null;
  return {
    ...(found || {}),
    ...(live || {}),
    videoId: status.videoId,
    title: live?.title || found?.title || status.title || "",
    artist: live?.artist || found?.artist || status.artist || "",
    album: live?.album || found?.album || status.album || "",
  };
}

function createdPlaylistId(result) {
  if (!result || typeof result !== "object") return "";
  return String(result.playlistId || result.id || "").replace(/^VL/, "");
}

function isTrackLiked(state, videoId, probeLiked) {
  if (!videoId) return false;
  if (state.likeOverride?.videoId === videoId) return state.likeOverride.value === "like";
  const track = findTrackByVideo(state, videoId);
  if (track && typeof track.liked === "boolean") return track.liked;
  if (track && isLikedLibrary(state)) return true;
  return probeLiked === "like";
}

function rowLiked(state, track) {
  if (!track?.videoId) return false;
  const live = typeof probe === "function" ? probe() : null;
  return isTrackLiked(
    state,
    track.videoId,
    live?.videoId === track.videoId ? live.liked : undefined
  );
}

function syncWellLike(root, state, status) {
  const like = root.querySelector("#ytunes-sidebar-well-like");
  const more = root.querySelector("#ytunes-sidebar-well-more");
  const acts = root.querySelector(".ytunes-sidebar-well-acts");
  const videoId = status?.videoId || "";
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
  syncWellLike(root, state, typeof probe === "function" ? probe() : null);
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
    if (status?.videoId) lcd.dataset.video = status.videoId;
    else delete lcd.dataset.video;
    const listId = String(status?.playlistId || "").replace(/^VL/, "");
    if (listId) lcd.dataset.playlist = listId;
    else delete lcd.dataset.playlist;
  }

  if (idle) {
    setMarqueeText(title, "yTunes");
    setMarqueeText(sub, "YouTube Music");
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
    setMarqueeText(sub, formatLcdSub(status, findTrackByVideo(state, status?.videoId)));

    const ratio = Math.max(0, Math.min(1, status?.progress?.ratio || 0));
    if (!state.draggingSeek && seek) {
      seek.value = String(Math.round(ratio * 1000));
      setRangeFill(seek, ratio * 1000, 1000);
    }
    current.textContent = status?.progress?.currentLabel || "0:00";
    duration.textContent = status?.progress?.durationLabel || "0:00";
    setImg(root.querySelector("#ytunes-lcd-img"), playingArtwork(state, status), name);
    markPlayingRows(root, status?.videoId || "");
  }

  if (!state.draggingVolume && typeof status?.volume === "number") {
    volume.value = String(status.volume);
    setRangeFill(volume, status.volume, 100);
  }

  if (state.likeOverride && status?.videoId && state.likeOverride.videoId !== status.videoId) {
    state.likeOverride = null;
  }
  const likeVideoId =
    status?.videoId || state.visibleTracks[state.selectedIndex]?.videoId || "";
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

function trackRowHtml(state, track, index, selected) {
  const stats = playStat(state.prefs, track.videoId);
  const suggested = isSuggestedTrack(track);
  const playlist = state.source === "playlist";
  const listId = String(
    suggested ? "" : track.playlistId || state.playlistId || ""
  ).replace(/^VL/, "");
  const classes = [
    index === selected ? "is-selected" : "",
    suggested ? "is-suggested" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const acts = [];
  if (playlist && suggested && track.videoId) {
    acts.push(
      `<button type="button" class="ytunes-row-act" data-row-act="add" title="Add to playlist" aria-label="Add to playlist">${ROW_ICON_PLUS}</button>`
    );
  } else if (playlist && !suggested && (track.setVideoId || track.videoId)) {
    acts.push(
      `<button type="button" class="ytunes-row-act is-remove" data-row-act="remove" title="Remove from playlist" aria-label="Remove from playlist">${ROW_ICON_MINUS}</button>`
    );
  }
  if (track.videoId) {
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
      <tr data-index="${index}" data-id="${escapeHtml(track.id || "")}" data-video="${escapeHtml(
        track.videoId || ""
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

function renderTracks(root, state, tracks, emptyMessage) {
  const body = root.querySelector("#ytunes-tracks");
  const playlist = state.source === "playlist";
  const { owned, suggested } = playlist
    ? splitPlaylistRows(tracks)
    : { owned: tracks || [], suggested: [] };
  const visible = playlist ? owned.concat(suggested) : tracks || [];
  state.visibleTracks = visible;
  if (!visible.length) {
    body.innerHTML = `<tr class="is-empty"><td colspan="8">${escapeHtml(
      emptyMessage || "No tracks yet."
    )}</td></tr>`;
    renderStatusMeta(root, state, []);
    return;
  }
  const selected = state.selectedIndex;
  const parts = [];
  if (playlist && !owned.length) {
    parts.push(
      `<tr class="is-empty"><td colspan="8">${escapeHtml(
        emptyMessage || "This playlist is empty."
      )}</td></tr>`
    );
  }
  owned.forEach((track, i) => {
    parts.push(trackRowHtml(state, track, i, selected));
  });
  if (playlist && suggested.length) {
    parts.push(
      `<tr class="ytunes-section"><td colspan="8">Suggestions</td></tr>`
    );
    suggested.forEach((track, i) => {
      parts.push(trackRowHtml(state, track, owned.length + i, selected));
    });
  }
  body.innerHTML = parts.join("");
  renderStatusMeta(root, state, visible);
  markPlayingRows(root, probe()?.videoId || "");
  refreshMarquees(root);
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
        cover.videoId || cover.tracks?.[0]?.videoId || ""
      )}" data-playlist="${escapeHtml(
        String(cover.playlistId || cover.tracks?.[0]?.playlistId || "").replace(/^VL/, "")
      )}">
        <span class="ytunes-tile-art">${
          cover.artwork
            ? `<img src="${escapeHtml(cover.artwork)}" alt="">`
            : `<span class="ytunes-cf-ph">${escapeHtml(
                (cover.title || "?").charAt(0).toUpperCase()
              )}</span>`
        }</span>
        ${marqueeHtml(cover.title, "ytunes-tile-title")}
        ${marqueeHtml(sub, "ytunes-tile-sub")}
      </button>`;
    })
    .join("");
  refreshMarquees(root);
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

function highlightCoverRows(root, state, cover) {
  const album = cover?.title || "";
  const art = cover?.artwork || "";
  const coverTracks = cover?.tracks || [];
  let first = -1;
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((row) => {
    const index = Number(row.dataset.index);
    const track = state.visibleTracks[index];
    const match = Boolean(
      track &&
        (coverTracks.some((item) => item.videoId && item.videoId === track.videoId) ||
          cover?.id === coverIdForTrack(track) ||
          (album && track.album === album) ||
          (art && track.artwork === art))
    );
    row.classList.toggle("is-browse", match);
    if (match && first < 0) first = index;
  });
  if (first < 0) {
    applyCoverCaption(
      root,
      state,
      cover,
      isSongCover(cover) ? trackFromSongCover(cover) : null
    );
    return;
  }
  state.selectedIndex = first;
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((row) => {
    row.classList.toggle("is-selected", Number(row.dataset.index) === first);
  });
  root
    .querySelector(`#ytunes-tracks tr[data-index="${first}"]`)
    ?.scrollIntoView({ block: "nearest" });
  const songCaption =
    !isCoverBrowser(state) || isSongCover(cover) ? selectedCaptionTrack(state) : null;
  applyCoverCaption(root, state, cover, songCaption);
}

function selectTrackRow(root, state, index, play) {
  if (index < 0 || index >= state.visibleTracks.length) return;
  state.selectedIndex = index;
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((node) => {
    node.classList.toggle("is-selected", Number(node.dataset.index) === index);
  });
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
      av = Number(playStat(state.prefs, a.videoId).count) || 0;
      bv = Number(playStat(state.prefs, b.videoId).count) || 0;
      return (av - bv) * dir;
    }
    if (key === "lastPlayed") {
      av = playStat(state.prefs, a.videoId).lastPlayedAt || 0;
      bv = playStat(state.prefs, b.videoId).lastPlayedAt || 0;
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

function applyParsed(root, state, parsed, emptyMessage) {
  state.followVideoId = "";
  if (isLikedLibrary(state)) {
    for (const track of parsed.tracks) {
      track.liked = true;
    }
  }
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
  const covers =
    state.source === "search"
      ? searchCovers
      : isMixedStorefront(state)
        ? collectionCovers.length
          ? collectionCovers
          : coversFromTracks(playlistOwned)
        : parsed.collections.length &&
            (COVER_BROWSER_SOURCES.has(state.source) || state.source === "search")
          ? parsed.collections
          : coversFromTracks(playlistOwned);
  const pendingId = state.pendingSelectVideoId || "";
  state.pendingSelectVideoId = "";
  const pendingIndex = indexOfVideo(visible, pendingId);
  state.selectedIndex =
    pendingIndex >= 0
      ? pendingIndex
      : playlistOwned.length
        ? 0
        : parsed.tracks.length
          ? splitPlaylistRows(parsed.tracks).owned.length
          : -1;
  state.covers = covers;
  const pendingCover =
    pendingIndex >= 0 ? coverForTrack(state, visible[pendingIndex]) : null;
  showCovers(state, covers, pendingCover?.id || covers[0]?.id || "");
  const empty = root.querySelector("#ytunes-cover-empty");
  if (empty && !covers.length) {
    empty.hidden = false;
    empty.textContent =
      state.source === "playlist" && !playlistOwned.length
        ? "This playlist is empty."
        : parsed.tracks.length
          ? "Albums and artists appear here."
          : emptyMessage ||
            "No items. Sign in on YouTube Music if this library should have music.";
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
          : emptyMessage || "No items. Sign in on YouTube Music if this library should have music."
  );
  renderGrid(root, state);
  applyCoverCaption(root, state, state.coverFlow.current(), selectedCaptionTrack(state));
  syncSkipRoster(root, state, probe());
  if (pendingIndex >= 0) {
    root
      .querySelector(`#ytunes-tracks tr[data-index="${pendingIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
    const active = document.activeElement;
    if (
      !active ||
      !(active.matches("input, textarea") || active.closest(".ytunes-dialog, .ytunes-jump"))
    ) {
      root.querySelector("#ytunes-table-wrap")?.focus({ preventScroll: true });
    }
  }
  if (isCoverBrowser(state) && state.source !== "search") {
    previewCoverTracks(root, state, state.coverFlow?.current());
  }
}

function bindShell(root) {
  retargetSourceIcons(root);
  bindMarquees(root);
  const volume = root.querySelector("#ytunes-volume");
  const seek = root.querySelector("#ytunes-seek");
  const search = root.querySelector("#ytunes-search");
  const suggest = root.querySelector("#ytunes-suggest");
  const menu = root.querySelector("#ytunes-menu");
  const toast = bindToast(root);
  const state = {
    draggingVolume: false,
    draggingSeek: false,
    source: "songs",
    playlistId: "",
    collections: [],
    tracks: [],
    visibleTracks: [],
    covers: [],
    selectedCoverId: "",
    selectedIndex: -1,
    coverFlow: null,
    lastSource: { type: "songs" },
    loadSeq: 0,
    suggestSeq: 0,
    history: [{ type: "songs" }],
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
        const delay = cover.tracks?.length ? 0 : 80;
        previewTimer = window.setTimeout(() => {
          if (seq !== state.previewSeq) return;
          previewCoverTracks(root, state, cover, seq);
        }, delay);
        return;
      }
      highlightCoverRows(root, state, cover);
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
      playStateTrack(state, trackFromSongCover(cover));
      return;
    }
    if (!cover.tracks?.length && collectionBrowseBody(cover)) {
      try {
        await fetchCollectionTracks(cover);
      } catch {
        /* fall through to open */
      }
    }
    if (cover.tracks?.[0]) {
      beginSession(state, {
        source: "list",
        listId: collectionPlaylistId(cover) || cover.browseId,
        tracks: cover.tracks,
      });
      playStateTrack(state, cover.tracks[0]);
      return;
    }
    if (cover.browseId) {
      await openCollection(root, state, cover, { history: true });
      return;
    }
    if (cover.endpoint) {
      YTM.play({ endpoint: cover.endpoint }).catch(() => {});
    }
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
        { type: "playlist", browseId: `VL${id}`, playlistId: id },
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
    const videoId = status?.videoId || "";
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
          queued = await YTM.queueCached(videoId, status?.playlistId || "");
          if (videoId) state.nowVideoId = videoId;
        } else if (stillThin) {
          queued = await YTM.playerQueue();
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
        if (state.session?.source === "radio") {
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
      await refreshPlayerSnap();
      const live = probe();
      rememberNowPlaying(live, state);
      const status = overlayStatus(live, state);
      renderPlayer(root, status, state);
      followPlayingTrack(root, state, live);
      playCounter.note(live);
      tickSleep(live);
      refreshNowPlayingList(live);
      if (!state.covers.length) renderArtwell(root, null, status);
      if (state.lyricsOn) {
        const vid = status?.videoId || "";
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
    const gestured = Number(document.documentElement.dataset.ytunesGesture || 0);
    if (gestured && Date.now() - gestured < 400) {
      await refreshUi();
      return;
    }
    if (action === "playPause" || action === "play") {
      const live = probe();
      if (isIdleStatus(live)) {
        const last = sanitizeNowPlaying(state.prefs?.nowPlaying);
        if (last?.videoId) {
          try {
            await YTM.play({
              endpoint: {
                watchEndpoint: {
                  videoId: last.videoId,
                  playlistId: last.playlistId || undefined,
                },
              },
            });
            await refreshUi();
            return;
          } catch {
            /* fall through to host toggle */
          }
        }
      }
    }
    await controlPlayback(action);
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
        syncSkipRoster(root, state, probe());
        return;
      }
      if (action === "repeat") {
        cycleRepeat();
        return;
      }
      clickControl(action);
      refreshUi();
      window.setTimeout(() => refreshUi(), 120);
      return;
    }
  });

  let volumeHold = 0;
  let seekHold = 0;

  function holdRange(key, timerName) {
    state[key] = true;
    window.clearTimeout(timerName === "volume" ? volumeHold : seekHold);
  }

  function releaseRange(key, apply) {
    if (apply) apply();
    const delay = key === "draggingVolume" ? 280 : 320;
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

  volume.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    holdRange("draggingVolume", "volume");
  });
  volume.addEventListener("input", () => {
    holdRange("draggingVolume", "volume");
    setRangeFill(volume, volume.value, 100);
    setVolumeRatio(Number(volume.value) / 100);
  });
  volume.addEventListener("change", () => {
    releaseRange("draggingVolume", () => setVolumeRatio(Number(volume.value) / 100));
  });
  volume.addEventListener("pointerup", () => {
    if (state.draggingVolume) {
      releaseRange("draggingVolume", () => setVolumeRatio(Number(volume.value) / 100));
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
    const total = Number(probe()?.progress?.duration) || 0;
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
      releaseRange("draggingVolume", () => setVolumeRatio(Number(volume.value) / 100));
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
      refreshNowPlayingList(probe(), true);
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
    const track = playingMenuTrack(state, probe());
    if (!track?.videoId) return;
    if (!menu.hidden && state.menuTrack?.videoId === track.videoId) {
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

  function hideSuggest() {
    suggest.hidden = true;
    suggest.innerHTML = "";
  }

  async function runSearch(query) {
    const seq = (state.loadSeq += 1);
    hideSuggest();
    state.source = "search";
    setSidebarSelection(root, { type: "search" });
    const empty = root.querySelector("#ytunes-cover-empty");
    if (empty && !state.visibleTracks.length) {
      empty.hidden = false;
      empty.textContent = "Searching…";
    }
    try {
      const parsed = await YTM.searchParsed(query);
      if (seq !== state.loadSeq) return;
      state.playlistId = "";
      state.statusNote = `Results for “${query}”`;
      applyParsed(root, state, parsed, `No results for “${query}”.`);
      pushHistoryFor(root, state, { type: "search", query, title: query });
    } catch (error) {
      if (seq !== state.loadSeq) return;
      renderTracks(root, state, [], error.message || "Could not search.");
    }
  }

  function restoreLibrary() {
    hideSuggest();
    loadSource(root, state, state.lastSource || { type: "songs" }, { history: false });
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    clearTimeout(suggestTimer);
    const query = search.value.trim();
    if (!query) {
      restoreLibrary();
      return;
    }
    suggestTimer = window.setTimeout(async () => {
      const seq = (state.suggestSeq += 1);
      const items = await YTM.suggest(query);
      if (seq !== state.suggestSeq) return;
      if (!items.length) {
        hideSuggest();
        return;
      }
      suggest.innerHTML = items
        .slice(0, 8)
        .map(
          (item) =>
            `<li><button type="button" data-query="${escapeHtml(item)}">${escapeHtml(
              item
            )}</button></li>`
        )
        .join("");
      suggest.hidden = false;
    }, 160);
    if (query.length < 2) return;
    searchTimer = window.setTimeout(() => runSearch(query), 400);
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
    hideSuggest();
    runSearch(button.dataset.query);
  });

  search.addEventListener("blur", () => {
    window.setTimeout(hideSuggest, 120);
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

  async function reloadPlaylist() {
    if (state.source !== "playlist" || !state.lastSource) return;
    await loadSource(root, state, state.lastSource, { history: false });
  }

  async function addTrackToPlaylist(track, playlistId) {
    const listId = String(playlistId || "").replace(/^VL/, "");
    if (!track?.videoId || !listId) return;
    await YTM.addToPlaylist(listId, track.videoId);
    toast.show("Added to playlist");
    if (state.source === "playlist" && listId === String(state.playlistId || "").replace(/^VL/, "")) {
      await reloadPlaylist();
    }
  }

  async function removeTrackFromPlaylist(track) {
    const listId = String(state.playlistId || "").replace(/^VL/, "");
    if (!track || !listId || isSuggestedTrack(track)) return;
    if (!track.setVideoId && !track.videoId) return;
    await YTM.removeFromPlaylist(listId, track.setVideoId, track.videoId);
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
        likeTrack(track.videoId);
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
    clearTimeout(searchTimer);
    if (button.dataset.playlist) {
      loadSource(
        root,
        state,
        {
          type: "playlist",
          browseId: `VL${button.dataset.playlist}`,
          playlistId: button.dataset.playlist,
        },
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
      menuItem("album", "Go to Album", !albumBrowseOf(track)),
      menuItem("artist", "Go to Artist", !artistBrowseOf(track))
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
    if (!track?.videoId) return;
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
        const created = await YTM.createPlaylist(title);
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
        state.source === "playlist" && suggested && track.videoId && state.playlistId,
      canRemove:
        state.source === "playlist" &&
        !suggested &&
        state.playlistId &&
        (track.setVideoId || track.videoId),
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
    if ((action === "next" || action === "queue") && track.videoId) {
      try {
        await YTM.enqueue(track.videoId, action === "next" ? "next" : "end");
        YTM.invalidateQueue();
        toast.show(action === "next" ? "Playing next" : "Added to queue");
        if (state.source === "now") {
          state.nowVideoId = "";
          refreshNowPlayingList(probe(), true);
        }
      } catch {
        toast.show("Could not add to queue", "error");
      }
      return;
    }
    if (action === "radio" && track.videoId) {
      startRadio(track.videoId);
      return;
    }
    if (action === "like" && track.videoId) {
      likeTrack(track.videoId);
      return;
    }
    if (action === "dislike" && track.videoId) {
      try {
        await YTM.like(track.videoId, "dislike");
        state.likeOverride = { videoId: track.videoId, value: "dislike" };
        const stamp = (item) => {
          if (item.videoId === track.videoId) item.liked = false;
        };
        state.visibleTracks.forEach(stamp);
        state.tracks.forEach(stamp);
        (state.nowTracks || []).forEach(stamp);
        syncRowLikes(root, state);
        toast.show("Disliked");
      } catch {
        clickControl("dislike");
        toast.show("Could not update like", "error");
      }
      refreshUi();
      return;
    }
    if (action === "album") {
      const browseId = albumBrowseOf(track);
      if (browseId) {
        openCollection(
          root,
          state,
          {
            id: browseId,
            title: track.album || track.title,
            browseId,
            playlistId: track.playlistId,
            kind: "album",
          },
          { history: true }
        );
      }
      return;
    }
    if (action === "artist") {
      const browseId = artistBrowseOf(track);
      if (browseId) {
        openCollection(
          root,
          state,
          {
            id: browseId,
            title: track.artist || "Artist",
            browseId,
            kind: "artist",
          },
          { history: true }
        );
      }
      return;
    }
    if (action === "add-here" && track.videoId) {
      try {
        await addTrackToPlaylist(track, state.playlistId);
      } catch {
        toast.show("Could not add to playlist", "error");
      }
      return;
    }
    if (action === "add" && track.videoId) {
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
      await YTM.createPlaylist(title);
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
      controlPlayback(media).then(() => refreshUi());
      return;
    }
    // Hotkey priority: dialog > menu/suggest > lyrics > nav
    if (dialogs.onGlobalKey(event)) return;
    if (!menu.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        hideMenu();
      }
      return;
    }
    const typing = event.target?.closest?.("input, textarea, [contenteditable]");
    if ((event.metaKey || event.ctrlKey) && String(event.key || "").toLowerCase() === "f") {
      event.preventDefault();
      event.stopPropagation();
      search.focus();
      search.select();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && String(event.key || "").toLowerCase() === "k") {
      event.preventDefault();
      event.stopPropagation();
      dialogs.openJump();
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
      const row = table.querySelector(`tr[data-index="${next}"]`);
      row?.scrollIntoView({ block: "nearest" });
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

  async function likeTrack(videoId) {
    if (!videoId) {
      clickControl("like");
      refreshUi();
      return;
    }
    const status = probe();
    const next = isTrackLiked(
      state,
      videoId,
      status?.videoId === videoId ? status.liked : undefined
    )
      ? "indifferent"
      : "like";
    const liked = next === "like";
    state.likeOverride = { videoId, value: next };
    const stamp = (track) => {
      if (track.videoId === videoId) track.liked = liked;
    };
    state.visibleTracks.forEach(stamp);
    state.tracks.forEach(stamp);
    (state.nowTracks || []).forEach(stamp);
    if (status?.videoId === videoId) setPressed(root, "like", liked);
    syncRowLikes(root, state);
    try {
      await YTM.like(videoId, next);
      toast.show(liked ? "Liked" : "Removed like");
    } catch {
      if (status?.videoId === videoId) clickControl("like");
      toast.show("Could not update like", "error");
    }
    refreshUi();
    window.setTimeout(() => refreshUi(), 400);
  }

  async function likeCurrent() {
    const status = probe();
    const selected = state.visibleTracks[state.selectedIndex];
    likeTrack(status.videoId || selected?.videoId || "");
  }

  async function cycleRepeat() {
    const order = ["off", "all", "one"];
    const current = probe().repeat || "off";
    const want = order[(Math.max(0, order.indexOf(current)) + 1) % order.length];
    for (let i = 0; i < 3; i += 1) {
      clickControl("repeat");
      await refreshPlayerSnap();
      if ((probe().repeat || "off") === want) break;
    }
    setRepeatUi(root, probe().repeat || "off");
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
      const current = findTrackByVideo(state, status?.videoId);
      const albumName = current?.album || "";
      const albumTracks = albumName
        ? state.visibleTracks.filter((track) => track.album === albumName)
        : state.visibleTracks;
      const last = albumTracks[albumTracks.length - 1];
      const isLast = !last?.videoId || last.videoId === status?.videoId;
      if (isLast && status?.playing && ratio >= 0.995) {
        controlPlayback("pause");
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
        controlPlayback("pause");
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
    try {
      const status = probe();
      state.lyricsVideoId = status.videoId || "";
      let lyricsId = "";
      if (status.videoId) {
        const queued = await YTM.queueCached(
          status.videoId,
          status.playlistId || ""
        );
        lyricsId = queued.lyricsId || "";
        state.lyricsId = lyricsId;
      }
      if (!lyricsId) {
        text.textContent = "No lyrics for this track.";
        state.lyricsLines = [];
        return;
      }
      const parsed = await YTM.lyricsParsed(lyricsId);
      state.lyricsLines = parsed.lines || [];
      if (state.lyricsLines.length) {
        text.dataset.active = "";
        syncLyricsHighlight(probe());
      } else {
        text.textContent = parsed.text || "No lyrics for this track.";
      }
    } catch {
      text.textContent = "Could not load lyrics.";
      state.lyricsLines = [];
    }
  }

  async function startRadio(videoId) {
    const id = videoId || probe().videoId;
    if (!id) return;
    const listId = radioId(id);
    const seed =
      state.visibleTracks.find((track) => track.videoId === id) ||
      findTrackByVideo(state, id) ||
      { videoId: id, title: "", artist: "" };
    beginSession(state, { source: "radio", listId, tracks: [seed], shuffle: false });
    try {
      await YTM.play({
        endpoint: { watchEndpoint: { videoId: id, playlistId: listId } },
        ownList: false,
      });
    } catch {
      /* fall through to now playing */
    }
    loadSource(root, state, { type: "now", playlistId: listId }, { history: true });
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
      if (persist) persistChrome();
    };
    split.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      split.setPointerCapture(event.pointerId);
      main.classList.add("is-resizing");
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
      state.lastSource = state.prefs.source;
      state.history = [state.prefs.source];
      state.historyIndex = 0;
    }
    applySourceGroups(root, state.prefs.sourceGroups);
    renderPlayer(root, overlayStatus(probe(), state), state);
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

async function fetchCollectionTracks(cover, stillCurrent) {
  const body = collectionBrowseBody(cover);
  if (!body) return cover.tracks || [];
  let parsed = await YTM.browseParsed(body, 2);
  if (stillCurrent && !stillCurrent()) return [];
  let tracks = await collectSongsFromParsed(parsed, cover, stillCurrent);
  const playlistId = collectionPlaylistId(cover);
  const vl = playlistId
    ? playlistId.startsWith("VL")
      ? playlistId
      : `VL${playlistId}`
    : "";
  if (!tracks.length && vl && vl !== body.browseId) {
    parsed = await YTM.browseParsed({ browseId: vl }, 2);
    if (stillCurrent && !stillCurrent()) return [];
    tracks = await collectSongsFromParsed(parsed, cover, stillCurrent);
  }
  cover.tracks = tracks;
  if (playlistId) cover.playlistId = playlistId;
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

  if (!canPreviewCover(cover) || !collectionBrowseBody(cover)) {
    if (!stillCurrent()) return;
    if (!cover.tracks?.length) {
      state.tracks = [];
      renderTracks(root, state, [], "Select a collection to see its songs.");
    }
    highlightCoverRows(root, state, cover);
    return;
  }

  renderTracks(root, state, [], "Loading songs…");
  try {
    const tracks = await fetchCollectionTracks(cover, stillCurrent);
    if (!stillCurrent()) return;
    state.tracks = tracks;
    state.playlistId = cover.playlistId || tracks[0]?.playlistId || "";
    renderTracks(
      root,
      state,
      tracks,
      tracks.length ? "No tracks yet." : "No songs in this collection."
    );
    if (tracks.length) highlightCoverRows(root, state, cover);
  } catch (error) {
    if (!stillCurrent()) return;
    renderTracks(root, state, [], error.message || "Could not load songs.");
  }
}

async function openCollection(root, state, collection, options = {}) {
  const seq = (state.loadSeq += 1);
  try {
    const body = collectionBrowseBody(collection) || {
      browseId: collection.browseId || `VL${collection.playlistId}`,
    };
    const parsed = await YTM.browseParsed(body, 2);
    if (seq !== state.loadSeq) return;
    const tracks = parsed.tracks;
    state.playlistId = collection.playlistId || tracks[0]?.playlistId || "";
    state.selectedCoverId = collection.id;
    collection.tracks = tracks;
    if (options.history) {
      pushHistoryFor(root, state, {
        type: collection.kind || "album",
        browseId: collection.browseId,
        playlistId: collection.playlistId,
        title: collection.title,
      });
    }
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
  } catch (error) {
    if (seq !== state.loadSeq) return;
    renderTracks(root, state, [], error.message || "Could not load album.");
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
    const parsed = await YTM.browseParsed(
      { browseId: "FEmusic_liked_playlists" },
      2
    );
    const playlists = parsed.collections.filter(
      (item) => item.playlistId || item.browseId.startsWith("VL")
    );
    state.playlists = playlists.map((item) => ({
      title: item.title,
      playlistId: item.playlistId || item.browseId.replace(/^VL/, ""),
    }));
    host.innerHTML = state.playlists
      .map(
        (item) =>
          `<button type="button" data-playlist="${escapeHtml(item.playlistId)}">${sourceIconHtml(
            "playlist"
          )}<span class="ytunes-source-label">${escapeHtml(item.title)}</span></button>`
      )
      .join("");
    if (!playlists.length) {
      host.innerHTML = `<p class="ytunes-source-empty">No playlists</p>`;
    }
  } catch {
    host.innerHTML = `<p class="ytunes-source-empty">Could not load playlists</p>`;
  }
  setSidebarSelection(root, state.lastSource);
  refreshMarquees(root);
}

function applyStorefront(root, state, parsed, emptyMessage) {
  const { collections, songCovers } = storefrontCovers(parsed);
  const tracks = topLevelSongsFromCovers(songCovers);
  applyParsed(
    root,
    state,
    {
      tracks,
      collections,
      lyricsId: parsed.lyricsId,
    },
    tracks.length
      ? emptyMessage
      : collections.length
        ? emptyMessage || STOREFRONT_EMPTY
        : "No items. Sign in on YouTube Music if this library should have music."
  );
}

async function cachedHome(state) {
  if (state.homeCache && Date.now() - (state.homeCacheAt || 0) < 120000) {
    return state.homeCache;
  }
  const parsed = await YTM.browseParsed({ browseId: BROWSE_IDS.home }, 2);
  state.homeCache = parsed;
  state.homeCacheAt = Date.now();
  return parsed;
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
    const home = await cachedHome(state);
    chips = pickMoodChips(home.chips);
  } catch {
    chips = [];
  }
  if (!chips.some((chip) => chip.browseId || chip.params)) {
    try {
      const page = await YTM.browseParsed({ browseId: BROWSE_IDS.moods }, 1);
      const fromPage = pickMoodChips(page.chips);
      if (fromPage.some((chip) => chip.browseId || chip.params)) chips = fromPage;
    } catch {
      /* keep home chips */
    }
  }
  chips = chips.filter((chip) => chip.browseId || chip.params);
  host.innerHTML = chips.length
    ? moodButtonsHtml(chips)
    : `<p class="ytunes-source-empty">No stations</p>`;
  setSidebarSelection(root, state.lastSource);
  refreshMarquees(root);
}

async function loadPodcasts(state, source) {
  const body = {
    browseId: source.browseId || BROWSE_IDS.podcasts,
  };
  if (source.params) body.params = source.params;
  let parsed = { tracks: [], collections: [], chips: [] };
  try {
    parsed = await YTM.browseParsed(body, 3);
  } catch {
    parsed = { tracks: [], collections: [], chips: [] };
  }
  if (parsed.collections.length || parsed.tracks.length) return parsed;
  const home = await cachedHome(state);
  const chip = (home.chips || []).find((item) => /^podcasts?$/i.test(item.title));
  if (chip?.browseId) {
    try {
      return await YTM.browseParsed(
        {
          browseId: chip.browseId,
          ...(chip.params ? { params: chip.params } : {}),
        },
        3
      );
    } catch {
      /* fall through to home filter */
    }
  }
  return {
    collections: home.collections.filter(isPodcastish),
    tracks: home.tracks.filter(isPodcastish),
    lyricsId: home.lyricsId,
    chips: home.chips,
  };
}

async function loadMoodStation(source) {
  if (source.browseId) {
    const body = { browseId: source.browseId };
    if (source.params) body.params = source.params;
    return YTM.browseParsed(body, 3);
  }
  if (source.title) return YTM.searchParsed(source.title);
  return YTM.browseParsed({ browseId: BROWSE_IDS.moods }, 2);
}

async function loadSource(root, state, source, options = {}) {
  const seq = (state.loadSeq += 1);
  const type = source.type || "songs";
  const empty = root.querySelector("#ytunes-cover-empty");
  if (empty && !state.visibleTracks.length && !state.covers.length && type !== "now") {
    empty.hidden = false;
    empty.textContent = "Loading library…";
  }

  state.source = type;
  state.followVideoId = "";
  state.statusNote = type === "mixes" ? "From Home" : "";
  state.playlistId = source.playlistId || (type === "liked" ? "LM" : "");
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

  try {
    if (type === "search") {
      const query = source.query || source.title || "";
      const searchInput = root.querySelector("#ytunes-search");
      if (searchInput && query) searchInput.value = query;
      if (!query) {
        renderTracks(root, state, [], "No results.");
        return;
      }
      const parsed = await YTM.searchParsed(query);
      if (seq !== state.loadSeq) return;
      state.statusNote = `Results for “${query}”`;
      applyParsed(root, state, parsed, `No results for “${query}”.`);
      return;
    }

    if (type === "radio") {
      const videoId = probe().videoId || state.visibleTracks[state.selectedIndex]?.videoId;
      if (!videoId) {
        if (seq !== state.loadSeq) return;
        renderTracks(root, state, [], "Play a song, then start Radio.");
        return;
      }
      const listId = radioId(videoId);
      beginSession(state, {
        source: "radio",
        listId,
        tracks: [{ videoId, title: "", artist: "" }],
      });
      if (options.play !== false) {
        await YTM.play({
          endpoint: { watchEndpoint: { videoId, playlistId: listId } },
          ownList: false,
        }).catch(() => {});
      }
      source = { type: "now", playlistId: listId };
    }

    if ((source.type || type) === "now") {
      state.nowVideoId = "";
      const painted = overlayStatus(probe(), state);
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
      const videoId = status.videoId || stored?.videoId || "";
      const playlistId =
        source.playlistId || status.playlistId || stored?.playlistId || "";
      let tracks = [];
      let lyricsId = "";
      let queuedPlaylist = "";
      try {
        const queued = await YTM.queueCached(videoId, playlistId);
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
      if ((state.tracks || []).length > tracks.length) return;
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
      if (state.session?.source === "radio") {
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
      const library = await YTM.browseParsed({ browseId: BROWSE_IDS.songs }, 2);
      if (seq !== state.loadSeq) return;
      const tracks = (library.tracks || []).filter(isVideoish);
      const collections = (library.collections || []).filter(isVideoish);
      applyStorefront(
        root,
        state,
        {
          tracks,
          collections,
          lyricsId: library.lyricsId,
        },
        tracks.length || !collections.length
          ? "No music videos in your library."
          : "Select a video. Double-click a cover to open it."
      );
      return;
    }

    if (type === "podcasts") {
      const parsed = await loadPodcasts(state, source);
      if (seq !== state.loadSeq) return;
      applyStorefront(
        root,
        state,
        parsed,
        "Select a podcast. Double-click a cover to open it."
      );
      return;
    }

    if (type === "mixes") {
      const home = await cachedHome(state);
      if (seq !== state.loadSeq) return;
      const seen = new Set();
      const collections = [];
      const add = (item) => {
        const id = item.id || item.playlistId || item.browseId || item.title;
        if (!id || seen.has(id)) return;
        seen.add(id);
        collections.push(item);
      };
      home.collections.filter(isMixCollection).forEach(add);
      (state.playlists || []).forEach((item) => {
        const list = String(item.playlistId || "").replace(/^VL/, "");
        if (!list.startsWith("RD")) return;
        add({
          id: list,
          title: item.title,
          playlistId: list,
          browseId: `VL${list}`,
          kind: "playlist",
        });
      });
      applyStorefront(root, state, {
        collections,
        tracks: [],
        lyricsId: home.lyricsId,
      });
      return;
    }

    if (type === "mood") {
      const parsed = await loadMoodStation(source);
      if (seq !== state.loadSeq) return;
      applyStorefront(root, state, parsed, STOREFRONT_EMPTY);
      return;
    }

    const browseId = source.browseId || BROWSE_IDS[type];
    if (!browseId) {
      if (seq !== state.loadSeq) return;
      renderTracks(root, state, [], "Could not load library.");
      return;
    }
    const body = { browseId };
    if (source.params) body.params = source.params;
    const parsed = await YTM.browseParsed(body, 2);
    if (seq !== state.loadSeq) return;
    if (type === "home") {
      state.homeCache = parsed;
      state.homeCacheAt = Date.now();
    }
    if (type === "home" || type === "explore" || type === "charts") {
      applyStorefront(root, state, parsed);
      return;
    }
    const collectionFirst =
      !parsed.tracks.length ||
      ["albums", "artists", "artist", "album"].includes(type);
    let emptyMessage = collectionFirst
      ? "Select an album. Double-click a cover to open it."
      : "No items.";
    if (
      !parsed.tracks.length &&
      !parsed.collections.length &&
      !(await YTM.signedIn())
    ) {
      emptyMessage = "Sign in on YouTube Music to see this library.";
    }
    applyParsed(
      root,
      state,
      {
        tracks: parsed.tracks,
        collections: collectionFirst ? parsed.collections : [],
        lyricsId: parsed.lyricsId,
      },
      emptyMessage
    );
    if (type === "playlist" && parsed.tracks.length) {
      const pid = String(source.playlistId || parsed.tracks[0]?.playlistId || "").replace(
        /^VL/,
        ""
      );
      state.playlistId = pid;
      if (pid && !pid.startsWith("RD")) {
        for (const track of splitPlaylistRows(state.tracks).owned) {
          if (!track.playlistId || String(track.playlistId).startsWith("RD")) {
            track.playlistId = pid;
          }
        }
      }
    }
  } catch (error) {
    if (seq !== state.loadSeq) return;
    if (empty) empty.textContent = "Could not load library.";
    renderTracks(root, state, [], error.message || "Could not load library.");
  }
}

function bootLibrary(root, state) {
  loadPlaylists(root, state);
  loadMoods(root, state);
  loadSource(root, state, state.lastSource || { type: "songs" }, {
    history: false,
    play: false,
  });
}
