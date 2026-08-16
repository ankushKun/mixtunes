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
  const hay = `${item?.title || ""} ${item?.subtitle || ""} ${item?.shelf || ""}`.toLowerCase();
  return /\bmix\b|supermix|\bradio\b|station|replay|discover|archive|new release/.test(hay);
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

function isCoverBrowser(state) {
  if (COVER_BROWSER_SOURCES.has(state.source)) return true;
  return (state.covers || []).some((cover) => cover.browseId || cover.playlistId);
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
  if (cover.kind === "song") return true;
  if (cover.kind === "artist" || cover.kind === "podcast") return false;
  const browseId = String(cover.browseId || "");
  if (browseId.startsWith("MPRE") || browseId.startsWith("UC") || browseId.startsWith("MPLA")) {
    return false;
  }
  const hay = `${cover.subtitle || ""} ${cover.kind || ""}`;
  if (/\bplaylist\b/i.test(hay) || /\balbum\b/i.test(hay)) return false;
  if (/\bsong\b/i.test(hay)) return true;
  const videoId =
    cover.videoId ||
    cover.endpoint?.watchEndpoint?.videoId ||
    (cover.tracks?.length === 1 ? cover.tracks[0].videoId : "");
  if (cover.kind === "playlist" || browseId.startsWith("VL")) return false;
  if (!cover.kind && cover.tracks?.length && !browseId && !cover.playlistId) return true;
  if (videoId && !browseId && (cover.tracks?.length || 1) <= 1) return true;
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
  const queue = [...preferred, ...rest].slice(0, 10);
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
  if (named.length) return named;
  if (moodish.length && moodish.length <= 16) return moodish;
  return DEFAULT_MOODS.map((title) => {
    const found = moodish.find(
      (chip) =>
        chip.title.toLowerCase() === title.toLowerCase() ||
        (title === "Energise" && /^energize$/i.test(chip.title))
    );
    return found || { title, browseId: "", params: "" };
  });
}

function storefrontCovers(parsed) {
  const collections = (parsed.collections || []).filter((item) => !isLibraryShelf(item));
  const shelvesWithCollections = new Set(
    collections.map((item) => item.shelf).filter(Boolean)
  );
  const loose = (parsed.tracks || []).filter(
    (track) =>
      !isLibraryShelf(track) && track.shelf && !shelvesWithCollections.has(track.shelf)
  );
  const songCovers = coversFromTracks(loose).map((cover) => ({
    ...cover,
    kind: "song",
    shelf: cover.tracks?.[0]?.shelf || "",
    subtitle: cover.tracks?.[0]?.shelf || cover.subtitle,
    videoId: cover.tracks?.[0]?.videoId || "",
  }));
  return [...collections, ...songCovers];
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
  const artist = status?.artist || track?.artist || "";
  const album = status?.album || track?.album || "";
  const year = status?.year || track?.year || "";
  if (artist && album && year) return `${artist} — ${album} (${year})`;
  if (artist && album) return `${artist} — ${album}`;
  if (artist && year) return `${artist} (${year})`;
  if (artist) return artist;
  return status?.subtitle || "YouTube Music";
}

function coverIdForTrack(track) {
  if (!track) return "";
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
      artwork: track.artwork,
      tracks: group,
    });
  }
  return covers;
}

function coverForTrack(state, track) {
  if (!track || !state.covers.length) return null;
  const id = coverIdForTrack(track);
  return (
    state.covers.find((cover) => cover.id === id) ||
    state.covers.find((cover) =>
      cover.tracks?.some((item) => item.videoId && item.videoId === track.videoId)
    ) ||
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
  const cover = coverForTrack(state, track);
  if (!cover || !state.coverFlow) return;
  const index = state.covers.findIndex((item) => item.id === cover.id);
  if (index < 0) return;
  state.selectedCoverId = cover.id;
  state.coverFlow.setIndex(index, true);
  renderGrid(root, state);
  renderArtwell(root, cover, probe());
}

function markPlayingRows(root, videoId) {
  const id = videoId || "";
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((row) => {
    row.classList.toggle("is-playing", Boolean(id && row.dataset.video === id));
  });
}

function playTrack(track, playlistId) {
  if (!track) return Promise.resolve();
  const endpoint = track.endpoint ? { ...track.endpoint } : {};
  const watch = {
    ...(endpoint.watchEndpoint || {}),
    videoId: track.videoId || endpoint.watchEndpoint?.videoId,
  };
  if (playlistId || track.playlistId) {
    watch.playlistId = playlistId || track.playlistId;
  }
  if (watch.videoId) endpoint.watchEndpoint = watch;
  if (!endpoint.watchEndpoint && !endpoint.browseEndpoint) {
    return Promise.reject(new Error("Nothing to play"));
  }
  return YTM.play({ endpoint });
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

function isIdleStatus(status) {
  if (status?.playing) return false;
  const title = String(status?.title || "").trim();
  const realTitle = Boolean(title && title !== "yTunes" && !/^youtube music$/i.test(title));
  if (status?.videoId && realTitle) return false;
  if (status?.videoId && (status.artwork || status.cover)) return false;
  return true;
}

function isLikedLibrary(state) {
  return state.source === "songs" || state.source === "liked" || state.playlistId === "LM";
}

function findTrackByVideo(state, videoId) {
  if (!videoId) return null;
  return (
    state.visibleTracks.find((item) => item.videoId === videoId) ||
    state.tracks.find((item) => item.videoId === videoId) ||
    null
  );
}

function isTrackLiked(state, videoId, probeLiked) {
  if (!videoId) return false;
  if (state.likeOverride?.videoId === videoId) return state.likeOverride.value === "like";
  const track = findTrackByVideo(state, videoId);
  if (track && isLikedLibrary(state)) return true;
  if (track && typeof track.liked === "boolean") return track.liked;
  return probeLiked === "like";
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
  if (lcd) lcd.title = idle ? "" : lcd.getAttribute("aria-pressed") === "true" ? "Hide lyrics" : "Show lyrics";

  if (idle) {
    title.textContent = "yTunes";
    sub.textContent = "YouTube Music";
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
    title.textContent = name;
    sub.textContent = formatLcdSub(status, findTrackByVideo(state, status?.videoId));

    const ratio = Math.max(0, Math.min(1, status?.progress?.ratio || 0));
    if (!state.draggingSeek && seek) {
      seek.value = String(Math.round(ratio * 1000));
      setRangeFill(seek, ratio * 1000, 1000);
    }
    current.textContent = status?.progress?.currentLabel || "0:00";
    duration.textContent = status?.progress?.durationLabel || "0:00";
    setImg(root.querySelector("#ytunes-lcd-img"), status?.artwork || status?.cover || "", name);
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
  setPressed(root, "shuffle", Boolean(status?.shuffle || state.shuffleOn));
  setPressed(root, "repeat", status?.repeat && status.repeat !== "off");
  setPressed(root, "like", isTrackLiked(state, likeVideoId, status?.liked));
}

function renderTracks(root, state, tracks, emptyMessage) {
  const body = root.querySelector("#ytunes-tracks");
  const statusLeft = root.querySelector("#ytunes-status-left");
  const statusCenter = root.querySelector("#ytunes-status-center");
  state.visibleTracks = tracks;
  if (!tracks.length) {
    body.innerHTML = `<tr class="is-empty"><td colspan="5">${escapeHtml(
      emptyMessage || "No tracks yet."
    )}</td></tr>`;
    statusLeft.textContent = "0 items";
    statusCenter.textContent = "";
    return;
  }
  const selected = state.selectedIndex;
  body.innerHTML = tracks
    .map(
      (track, index) => `
      <tr data-index="${index}" data-id="${escapeHtml(track.id || "")}" data-video="${escapeHtml(
        track.videoId || ""
      )}" class="${index === selected ? "is-selected" : ""}">
        <td><span class="ytunes-speaker" aria-hidden="true"></span></td>
        <td>${escapeHtml(track.title)}</td>
        <td>${escapeHtml(track.duration || "")}</td>
        <td>${escapeHtml(track.artist || "")}</td>
        <td>${escapeHtml(track.album || "")}</td>
      </tr>`
    )
    .join("");
  statusLeft.textContent = `${tracks.length} item${tracks.length === 1 ? "" : "s"}`;
  statusCenter.textContent = totalTimeLabel(tracks);
  markPlayingRows(root, probe()?.videoId || "");
}

function renderGrid(root, state) {
  const grid = root.querySelector("#ytunes-grid");
  if (!grid) return;
  if (!state.covers.length) {
    grid.innerHTML = `<p class="ytunes-source-empty">No albums</p>`;
    return;
  }
  grid.innerHTML = state.covers
    .map(
      (cover) => `
      <button type="button" class="ytunes-tile${
        cover.id === state.selectedCoverId ? " is-selected" : ""
      }" data-cover-id="${escapeHtml(cover.id)}">
        <span class="ytunes-tile-art">${
          cover.artwork
            ? `<img src="${escapeHtml(cover.artwork)}" alt="">`
            : `<span class="ytunes-cf-ph">${escapeHtml(
                (cover.title || "?").charAt(0).toUpperCase()
              )}</span>`
        }</span>
        <span class="ytunes-tile-title">${escapeHtml(cover.title)}</span>
        <span class="ytunes-tile-sub">${escapeHtml(
          (typeof coverCaptionSub === "function" ? coverCaptionSub(cover) : "") ||
            cover.artist ||
            cover.subtitle ||
            ""
        )}</span>
      </button>`
    )
    .join("");
}

function renderArtwell(root, cover, status) {
  const title = cover?.title || status?.title || "";
  const sub =
    (typeof coverCaptionSub === "function" ? coverCaptionSub(cover) : "") ||
    cover?.artist ||
    cover?.subtitle ||
    status?.subtitle ||
    "";
  const art = cover?.artwork || status?.cover || status?.artwork || "";
  setImg(root.querySelector("#ytunes-artwell-img"), art, title);
  const titleEl = root.querySelector("#ytunes-artwell-title");
  const subEl = root.querySelector("#ytunes-artwell-sub");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
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
  if (first < 0) return;
  state.selectedIndex = first;
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((row) => {
    row.classList.toggle("is-selected", Number(row.dataset.index) === first);
  });
  root
    .querySelector(`#ytunes-tracks tr[data-index="${first}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function selectTrackRow(root, state, index, play) {
  if (index < 0 || index >= state.visibleTracks.length) return;
  state.selectedIndex = index;
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((node) => {
    node.classList.toggle("is-selected", Number(node.dataset.index) === index);
  });
  const track = state.visibleTracks[index];
  syncCoverFlowToTrack(root, state, track);
  if (play) playTrack(track, state.playlistId);
}

function sortTracks(state) {
  const key = state.sortKey;
  if (!key) return state.visibleTracks;
  const dir = state.sortDir === "desc" ? -1 : 1;
  const copy = state.visibleTracks.slice();
  copy.sort((a, b) => {
    let av;
    let bv;
    if (key === "duration") {
      av = parseClock(a.duration || "");
      bv = parseClock(b.duration || "");
      return (av - bv) * dir;
    }
    av = String(a[key] || "").toLowerCase();
    bv = String(b[key] || "").toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return copy;
}

function applyParsed(root, state, parsed, emptyMessage) {
  if (isLikedLibrary(state)) {
    for (const track of parsed.tracks) {
      if (typeof track.liked !== "boolean") track.liked = true;
    }
  }
  state.tracks = parsed.tracks;
  state.collections = parsed.collections;
  state.lyricsId = parsed.lyricsId || state.lyricsId || "";
  const covers = parsed.collections.length
    ? parsed.collections
    : coversFromTracks(parsed.tracks);
  state.selectedIndex = parsed.tracks.length ? 0 : -1;
  showCovers(state, covers, covers[0]?.id || "");
  const empty = root.querySelector("#ytunes-cover-empty");
  if (empty && !covers.length) {
    empty.hidden = false;
    empty.textContent =
      emptyMessage ||
      "No items. Sign in on YouTube Music if this library should have music.";
  }
  renderTracks(
    root,
    state,
    parsed.tracks,
    parsed.tracks.length
      ? emptyMessage
      : covers.length
        ? emptyMessage || "Select an album. Double-click a cover to open it."
        : emptyMessage || "No items. Sign in on YouTube Music if this library should have music."
  );
  renderGrid(root, state);
  renderArtwell(root, state.coverFlow.current(), probe());
  if (isCoverBrowser(state)) previewCoverTracks(root, state, state.coverFlow?.current());
}

function bindShell(root) {
  const volume = root.querySelector("#ytunes-volume");
  const seek = root.querySelector("#ytunes-seek");
  const search = root.querySelector("#ytunes-search");
  const suggest = root.querySelector("#ytunes-suggest");
  const menu = root.querySelector("#ytunes-menu");
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
    likeOverride: null,
    shuffleOn: false,
    homeCache: null,
    homeCacheAt: 0,
    previewSeq: 0,
  };

  function syncNav() {
    syncNavButtons(root, state);
  }

  let previewTimer = 0;

  async function selectCover(cover, play) {
    if (!cover) return;
    state.selectedCoverId = cover.id;
    renderGrid(root, state);
    renderArtwell(root, cover, probe());
    if (!play) {
      if (isCoverBrowser(state)) {
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
      return;
    }
    if (cover.browseId && !cover.tracks?.length) {
      await openCollection(root, state, cover, { history: true });
      return;
    }
    if (cover.tracks?.[0]) {
      playTrack(cover.tracks[0], state.playlistId || cover.playlistId);
    } else if (cover.endpoint) {
      YTM.play({ endpoint: cover.endpoint }).catch(() => {});
    }
  }

  state.coverFlow = CoverFlow(root, {
    onBrowse: (cover) => selectCover(cover, false),
    onPlay: (cover) => selectCover(cover, true),
  });

  async function refreshUi() {
    try {
      await refreshPlayerSnap();
      renderPlayer(root, probe(), state);
      if (!state.covers.length) renderArtwell(root, null, probe());
    } catch {
      /* keep the player poll alive */
    }
  }

  root.querySelector(".ytunes-transport").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    controlPlayback(button.dataset.action).then(() => refreshUi());
  });

  root.querySelector(".ytunes-history").addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (!nav) return;
    if (nav.dataset.nav === "back") goHistory(-1);
    if (nav.dataset.nav === "forward") goHistory(1);
  });

  root.addEventListener("click", (event) => {
    const tool = event.target.closest(".ytunes-lcd-tool, .ytunes-status-tools [data-action]");
    if (tool) {
      const action = tool.dataset.action;
      if (action === "like") {
        likeCurrent();
        return;
      }
      if (action === "shuffle") {
        shufflePlay();
        return;
      }
      clickControl(action);
      refreshUi();
      window.setTimeout(() => refreshUi(), 120);
      return;
    }
    const lcd = event.target.closest("#ytunes-lcd");
    if (
      lcd &&
      !lcd.classList.contains("is-idle") &&
      !event.target.closest(".ytunes-lcd-tool, input, .ytunes-lcd-progress")
    ) {
      toggleLyrics();
    }
  });

  volume.addEventListener("pointerdown", () => {
    state.draggingVolume = true;
  });
  seek.addEventListener("pointerdown", () => {
    state.draggingSeek = true;
  });
  window.addEventListener("pointerup", () => {
    state.draggingVolume = false;
    state.draggingSeek = false;
  });
  volume.addEventListener("input", () => {
    setRangeFill(volume, volume.value, 100);
    setVolumeRatio(Number(volume.value) / 100);
  });
  seek.addEventListener("input", () => {
    setRangeFill(seek, seek.value, 1000);
    seekToRatio(Number(seek.value) / 1000);
  });

  root.querySelector(".ytunes-views").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    root.querySelectorAll(".ytunes-views [data-view]").forEach((node) => {
      node.setAttribute("aria-pressed", String(node === button));
    });
    root.querySelector(".ytunes-main").dataset.view = button.dataset.view;
    if (button.dataset.view === "coverflow") state.coverFlow.focus();
  });

  root.querySelector("#ytunes-original").addEventListener("click", async () => {
    try {
      await chrome.storage.local.set({ overlayEnabled: false });
    } catch {
      location.reload();
    }
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
      applyParsed(root, state, parsed, `No results for “${query}”.`);
      const statusCenter = root.querySelector("#ytunes-status-center");
      if (statusCenter && parsed.tracks.length) {
        statusCenter.textContent = `Results for “${query}” · ${totalTimeLabel(parsed.tracks)}`;
      }
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
      if (src.includes("/hq720.")) {
        img.src = src.replace("/hq720.", "/mqdefault.");
      }
    },
    true
  );

  const table = root.querySelector("#ytunes-tracks");
  table.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    selectTrackRow(root, state, Number(row.dataset.index), false);
  });
  table.addEventListener("dblclick", (event) => {
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
  });

  function hideMenu() {
    menu.hidden = true;
    menu.innerHTML = "";
  }

  table.addEventListener("contextmenu", (event) => {
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    event.preventDefault();
    selectTrackRow(root, state, Number(row.dataset.index), false);
    const track = state.visibleTracks[Number(row.dataset.index)];
    if (!track) return;
    const playlistButtons = state.playlists
      .slice(0, 12)
      .map(
        (item) =>
          `<button type="button" data-menu="add" data-playlist="${escapeHtml(
            item.playlistId
          )}">Add to ${escapeHtml(item.title)}</button>`
      )
      .join("");
    const albumId = albumBrowseOf(track);
    const artistId = artistBrowseOf(track);
    menu.innerHTML = `
      <button type="button" data-menu="play">Play</button>
      <button type="button" data-menu="radio">Start Radio</button>
      <button type="button" data-menu="like">Like</button>
      <button type="button" data-menu="dislike">Dislike</button>
      <button type="button" data-menu="album"${albumId ? "" : " disabled"}>Go to Album</button>
      <button type="button" data-menu="artist"${artistId ? "" : " disabled"}>Go to Artist</button>
      ${playlistButtons}
    `;
    menu.hidden = false;
    const x = Math.min(event.clientX, window.innerWidth - 200);
    const y = Math.min(event.clientY, window.innerHeight - 8);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.dataset.index = String(row.dataset.index);
  });

  menu.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-menu]");
    if (!button) return;
    const track = state.visibleTracks[Number(menu.dataset.index)];
    hideMenu();
    if (!track) return;
    if (button.dataset.menu === "play") {
      playTrack(track, state.playlistId);
      return;
    }
    if (button.dataset.menu === "radio" && track.videoId) {
      startRadio(track.videoId);
      return;
    }
    if (button.dataset.menu === "like" && track.videoId) {
      try {
        await YTM.like(track.videoId, "like");
        state.likeOverride = { videoId: track.videoId, value: "like" };
      } catch {
        clickControl("like");
      }
      refreshUi();
      return;
    }
    if (button.dataset.menu === "dislike" && track.videoId) {
      try {
        await YTM.like(track.videoId, "dislike");
        state.likeOverride = { videoId: track.videoId, value: "dislike" };
      } catch {
        clickControl("dislike");
      }
      refreshUi();
      return;
    }
    if (button.dataset.menu === "album") {
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
    if (button.dataset.menu === "artist") {
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
    if (button.dataset.menu === "add" && track.videoId) {
      try {
        await YTM.addToPlaylist(button.dataset.playlist, track.videoId);
      } catch {
        /* playlist add can fail for system lists */
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !menu.contains(event.target)) hideMenu();
  });

  root.querySelector("#ytunes-new-playlist").addEventListener("click", async () => {
    const title = await promptDialog(root, "New Playlist", "Create");
    if (!title) return;
    try {
      await YTM.createPlaylist(title);
      await loadPlaylists(root, state);
    } catch {
      /* ignore */
    }
  });

  function onHotkey(event) {
    if (!document.getElementById("ytunes-root")) return;
    const typing = event.target?.closest?.("input, textarea, [contenteditable]");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopPropagation();
      search.focus();
      search.select();
      return;
    }
    if (typing) return;
    const view = root.querySelector(".ytunes-main")?.dataset.view;
    const tableFocus = root.querySelector("#ytunes-table-wrap") === document.activeElement;
    if (event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      controlPlayback("playPause").then(() => refreshUi());
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
    if (event.key === "Escape") {
      hideMenu();
      hideSuggest();
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
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (view === "coverflow" && !tableFocus) {
        event.preventDefault();
        event.stopPropagation();
        state.coverFlow.move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }
  }

  document.addEventListener("keydown", onHotkey, true);

  async function likeCurrent() {
    const status = probe();
    const selected = state.visibleTracks[state.selectedIndex];
    const videoId = status.videoId || selected?.videoId || "";
    if (!videoId) {
      clickControl("like");
      refreshUi();
      return;
    }
    const next = isTrackLiked(state, videoId, status.liked) ? "indifferent" : "like";
    state.likeOverride = { videoId, value: next };
    const stamp = (track) => {
      if (track.videoId === videoId) track.liked = next === "like";
    };
    state.visibleTracks.forEach(stamp);
    state.tracks.forEach(stamp);
    setPressed(root, "like", next === "like");
    try {
      await YTM.like(videoId, next);
    } catch {
      clickControl("like");
    }
    refreshUi();
    window.setTimeout(() => refreshUi(), 400);
  }

  async function shufflePlay() {
    let pool = state.visibleTracks.filter((track) => track.videoId);
    if (!pool.length) pool = state.tracks.filter((track) => track.videoId);
    if (!pool.length) {
      clickControl("shuffle");
      refreshUi();
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    state.shuffleOn = true;
    setPressed(root, "shuffle", true);
    const index = state.visibleTracks.findIndex((track) => track.videoId === pick.videoId);
    if (index >= 0) {
      selectTrackRow(root, state, index, false);
      table
        .querySelector(`tr[data-index="${index}"]`)
        ?.scrollIntoView({ block: "center", inline: "nearest" });
      root.querySelector("#ytunes-table-wrap")?.focus({ preventScroll: true });
    } else {
      syncCoverFlowToTrack(root, state, pick);
    }
    await playTrack(pick, state.playlistId || pick.playlistId);
    markPlayingRows(root, pick.videoId);
    if (!probe().shuffle) clickControl("shuffle");
    refreshUi();
    window.setTimeout(() => refreshUi(), 400);
  }

  async function toggleLyrics(force) {
    const panel = root.querySelector("#ytunes-lyrics");
    const text = root.querySelector("#ytunes-lyrics-text");
    const on = force == null ? !state.lyricsOn : force;
    state.lyricsOn = on;
    setPressed(root, "lyrics", on);
    const lcd = root.querySelector("#ytunes-lcd");
    if (lcd) {
      lcd.setAttribute("aria-pressed", on ? "true" : "false");
      lcd.title = lcd.classList.contains("is-idle") ? "" : on ? "Hide lyrics" : "Show lyrics";
    }
    if (!on) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    text.textContent = "Loading lyrics…";
    try {
      const status = probe();
      let lyricsId = state.lyricsId;
      if (!lyricsId && status.videoId) {
        const queued = await YTM.queue(status.videoId, state.playlistId);
        lyricsId = queued.lyricsId;
        state.lyricsId = lyricsId;
      }
      text.textContent = lyricsId
        ? (await YTM.lyrics(lyricsId)) || "No lyrics for this track."
        : "No lyrics for this track.";
    } catch {
      text.textContent = "Could not load lyrics.";
    }
  }

  async function startRadio(videoId) {
    const id = videoId || probe().videoId;
    if (!id) return;
    try {
      await YTM.play({
        endpoint: { watchEndpoint: { videoId: id, playlistId: radioId(id) } },
      });
    } catch {
      /* fall through to now playing */
    }
    loadSource(
      root,
      state,
      { type: "now", playlistId: radioId(id) },
      { history: true }
    );
  }

  async function goHistory(delta) {
    const next = state.historyIndex + delta;
    if (next < 0 || next >= state.history.length) return;
    state.historyIndex = next;
    syncNav();
    await loadSource(root, state, state.history[next], { history: false });
  }

  refreshUi();
  setInterval(refreshUi, 200);
  bootLibrary(root, state);
  syncNav();
}

function promptDialog(root, title, okLabel) {
  const dialog = root.querySelector("#ytunes-dialog");
  const form = root.querySelector("#ytunes-dialog-form");
  const input = root.querySelector("#ytunes-dialog-input");
  const heading = root.querySelector("#ytunes-dialog-title");
  const ok = root.querySelector("#ytunes-dialog-ok");
  const cancel = root.querySelector("#ytunes-dialog-cancel");
  heading.textContent = title;
  ok.textContent = okLabel;
  input.value = "";
  dialog.hidden = false;
  input.focus();
  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.hidden = true;
      form.onsubmit = null;
      cancel.onclick = null;
      resolve(value);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      finish(input.value.trim());
    };
    cancel.onclick = () => finish("");
  });
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

  const body = collectionBrowseBody(cover);
  if (!canPreviewCover(cover) || !body) {
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
    let parsed = await YTM.browseParsed(body, 3);
    if (!stillCurrent()) return;
    let tracks = await collectSongsFromParsed(parsed, cover, stillCurrent);
    if (!stillCurrent()) return;
    const playlistId = collectionPlaylistId(cover);
    const vl = playlistId
      ? playlistId.startsWith("VL")
        ? playlistId
        : `VL${playlistId}`
      : "";
    if (!tracks.length && vl && vl !== body.browseId) {
      parsed = await YTM.browseParsed({ browseId: vl }, 3);
      if (!stillCurrent()) return;
      tracks = await collectSongsFromParsed(parsed, cover, stillCurrent);
      if (!stillCurrent()) return;
    }
    cover.tracks = tracks;
    state.tracks = tracks;
    state.playlistId = playlistId || tracks[0]?.playlistId || "";
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
    const parsed = await YTM.browseParsed(body, 3);
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
    if (!tracks.length && parsed.collections.length) {
      showCovers(state, parsed.collections, parsed.collections[0]?.id || "");
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
    renderArtwell(root, collection, probe());
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
          `<button type="button" data-playlist="${escapeHtml(item.playlistId)}">${escapeHtml(
            item.title
          )}</button>`
      )
      .join("");
    if (!playlists.length) {
      host.innerHTML = `<p class="ytunes-source-empty">No playlists</p>`;
    }
  } catch {
    host.innerHTML = `<p class="ytunes-source-empty">Could not load playlists</p>`;
  }
  setSidebarSelection(root, state.lastSource);
}

function applyStorefront(root, state, parsed, emptyMessage) {
  const collections = storefrontCovers(parsed);
  applyParsed(
    root,
    state,
    {
      tracks: [],
      collections,
      lyricsId: parsed.lyricsId,
    },
    collections.length
      ? emptyMessage || STOREFRONT_EMPTY
      : "No items. Sign in on YouTube Music if this library should have music."
  );
}

async function cachedHome(state) {
  if (state.homeCache && Date.now() - (state.homeCacheAt || 0) < 120000) {
    return state.homeCache;
  }
  const parsed = await YTM.browseParsed({ browseId: BROWSE_IDS.home }, 3);
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
        )}">${escapeHtml(chip.title)}</button>`
    )
    .join("");
}

async function loadMoods(root, state) {
  const host = root.querySelector("#ytunes-moods");
  if (!host) return;
  host.innerHTML = moodButtonsHtml(
    DEFAULT_MOODS.map((title) => ({ title, browseId: "", params: "" }))
  );
  let chips = [];
  try {
    const home = await cachedHome(state);
    chips = pickMoodChips(home.chips);
  } catch {
    chips = [];
  }
  if (!chips.length || chips.every((chip) => !chip.browseId && !chip.params)) {
    try {
      const page = await YTM.browseParsed({ browseId: BROWSE_IDS.moods }, 1);
      const fromPage = pickMoodChips(page.chips);
      if (fromPage.some((chip) => chip.browseId || chip.params)) chips = fromPage;
      else if (!chips.length) chips = fromPage;
    } catch {
      /* keep home or defaults */
    }
  }
  if (!chips.length) {
    chips = DEFAULT_MOODS.map((title) => ({ title, browseId: "", params: "" }));
  }
  host.innerHTML = moodButtonsHtml(chips);
  setSidebarSelection(root, state.lastSource);
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
  if (empty && !state.visibleTracks.length && !state.covers.length) {
    empty.hidden = false;
    empty.textContent = "Loading library…";
  }

  state.source = type;
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
    if (type === "radio") {
      const videoId = probe().videoId || state.visibleTracks[state.selectedIndex]?.videoId;
      if (!videoId) {
        if (seq !== state.loadSeq) return;
        renderTracks(root, state, [], "Play a song, then start Radio.");
        return;
      }
      await YTM.play({
        endpoint: { watchEndpoint: { videoId, playlistId: radioId(videoId) } },
      }).catch(() => {});
      source = { type: "now", playlistId: radioId(videoId) };
    }

    if ((source.type || type) === "now") {
      await refreshPlayerSnap();
      const status = probe();
      let tracks = [];
      try {
        const queued = await YTM.queue(status.videoId, source.playlistId || state.playlistId);
        if (seq !== state.loadSeq) return;
        tracks = queued.tracks;
        state.lyricsId = queued.lyricsId || "";
      } catch {
        tracks = [];
      }
      if (!tracks.length && status?.title) {
        tracks = [
          {
            id: status.videoId || "now",
            title: status.title,
            artist: status.artist,
            album: status.album,
            year: status.year,
            duration: status.progress?.durationLabel,
            artwork: status.cover || status.artwork,
            videoId: status.videoId,
          },
        ];
      }
      if (seq !== state.loadSeq) return;
      state.tracks = tracks;
      state.playlistId = source.playlistId || state.playlistId;
      showCovers(state, coversFromTracks(tracks), "");
      renderTracks(root, state, tracks, "Nothing is playing.");
      renderGrid(root, state);
      renderArtwell(root, state.coverFlow.current(), status);
      return;
    }

    if (type === "videos") {
      const home = await cachedHome(state);
      if (seq !== state.loadSeq) return;
      const tracks = home.tracks.filter(isVideoish);
      const collections = home.collections.filter(isVideoish);
      applyParsed(
        root,
        state,
        {
          tracks,
          collections,
          lyricsId: home.lyricsId,
        },
        tracks.length || !collections.length
          ? "No music videos right now."
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
      applyStorefront(root, state, {
        collections: home.collections.filter(isMixCollection),
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
    const parsed = await YTM.browseParsed(body, 3);
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
      ["albums", "artists", "artist", "album", "playlist"].includes(type);
    applyParsed(
      root,
      state,
      {
        tracks: parsed.tracks,
        collections: collectionFirst ? parsed.collections : [],
        lyricsId: parsed.lyricsId,
      },
      collectionFirst
        ? "Select an album. Double-click a cover to open it."
        : "No items. Sign in on YouTube Music if this library should have music."
    );
    if (type === "playlist" && parsed.tracks.length) {
      state.playlistId = source.playlistId || parsed.tracks[0]?.playlistId || "";
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
  loadSource(root, state, { type: "songs" }, { history: false });
}
