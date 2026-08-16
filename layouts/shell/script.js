function setImg(img, url, alt) {
  if (!img) return;
  const frame = img.closest(".ytunes-lcd-art, .ytunes-selected-art");
  if (!url) {
    img.removeAttribute("src");
    if (frame) frame.hidden = true;
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

function coversFromTracks(tracks) {
  const covers = [];
  const seen = new Set();
  for (const track of tracks) {
    const key = track.album || track.artwork || track.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    covers.push({
      id: key,
      title: track.album || track.title,
      subtitle: track.artist,
      artist: track.artist,
      artwork: track.artwork,
      tracks: tracks.filter(
        (item) => (item.album || item.artwork || item.title) === key
      ),
    });
  }
  return covers;
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
  return YTM.play({ endpoint });
}

function renderPlayer(root, status, options = {}) {
  const play = root.querySelector(".ytunes-play");
  const title = root.querySelector("#ytunes-lcd-title");
  const sub = root.querySelector("#ytunes-lcd-sub");
  const seek = root.querySelector("#ytunes-seek");
  const current = root.querySelector("#ytunes-time-current");
  const duration = root.querySelector("#ytunes-time-duration");
  const volume = root.querySelector("#ytunes-volume");

  const playing = Boolean(status?.playing);
  play.classList.toggle("is-playing", playing);
  play.setAttribute("aria-label", playing ? "Pause" : "Play");

  const name = status?.title || "yTunes";
  title.textContent = name;
  sub.textContent = status?.subtitle || "YouTube Music";

  const ratio = Math.max(0, Math.min(1, status?.progress?.ratio || 0));
  if (!options.draggingSeek && seek) {
    seek.value = String(Math.round(ratio * 1000));
    setRangeFill(seek, ratio * 1000, 1000);
  }
  current.textContent = status?.progress?.currentLabel || "0:00";
  duration.textContent = status?.progress?.durationLabel || "0:00";

  if (!options.draggingVolume && typeof status?.volume === "number") {
    volume.value = String(status.volume);
    setRangeFill(volume, status.volume, 100);
  }

  setImg(root.querySelector("#ytunes-lcd-img"), status?.artwork || status?.cover || "", name);

  const playingTitle = status?.title || "";
  root.querySelectorAll("#ytunes-tracks tr[data-title]").forEach((row) => {
    row.classList.toggle("is-playing", row.dataset.title === playingTitle);
  });
}

function renderTracks(root, tracks, emptyMessage) {
  const body = root.querySelector("#ytunes-tracks");
  const statusLeft = root.querySelector("#ytunes-status-left");
  const statusCenter = root.querySelector("#ytunes-status-center");
  if (!tracks.length) {
    body.innerHTML = `<tr class="is-empty"><td colspan="5">${escapeHtml(emptyMessage)}</td></tr>`;
    statusLeft.textContent = "0 items";
    statusCenter.textContent = "";
    return;
  }
  body.innerHTML = tracks
    .map(
      (track, index) => `
      <tr data-index="${index}" data-title="${escapeHtml(track.title)}">
        <td><span class="ytunes-speaker" aria-hidden="true"></span></td>
        <td>${escapeHtml(track.title)}</td>
        <td>${escapeHtml(track.duration || "")}</td>
        <td>${escapeHtml(track.artist || "")}</td>
        <td>${escapeHtml(track.album || "")}</td>
      </tr>`
    )
    .join("");
  statusLeft.textContent = `${tracks.length} item${tracks.length === 1 ? "" : "s"}`;
  statusCenter.textContent = "";
}

function showCovers(state, covers, selectedId) {
  state.covers = covers;
  state.selectedCoverId = selectedId || covers[0]?.id || "";
  state.coverFlow.setList(covers, state.selectedCoverId);
}

function highlightCoverRows(root, state, cover) {
  const album = cover?.title || "";
  const art = cover?.artwork || "";
  root.querySelectorAll("#ytunes-tracks tr[data-index]").forEach((row) => {
    const track = state.visibleTracks[Number(row.dataset.index)];
    const match = Boolean(
      track &&
        ((album && track.album === album) || (art && track.artwork === art))
    );
    row.classList.toggle("is-browse", match);
  });
}

function bindShell(root) {
  const volume = root.querySelector("#ytunes-volume");
  const seek = root.querySelector("#ytunes-seek");
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
    coverFlow: null,
    lastSource: { type: "songs" },
    searchSeq: 0,
  };

  async function selectCover(cover, play) {
    if (!cover) return;
    state.selectedCoverId = cover.id;
    if (!play) {
      highlightCoverRows(root, state, cover);
      return;
    }
    if (cover.browseId && !cover.tracks?.length) {
      await openCollection(root, state, cover);
      return;
    }
    if (cover.tracks?.[0]) {
      playTrack(cover.tracks[0], state.playlistId || cover.playlistId);
    } else if (cover.endpoint) {
      YTM.play({ endpoint: cover.endpoint });
    }
  }

  state.coverFlow = CoverFlow(root, {
    onBrowse: (cover) => selectCover(cover, false),
    onPlay: (cover) => selectCover(cover, true),
  });

  root.querySelector(".ytunes-transport").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    clickControl(button.dataset.action);
    renderPlayer(root, probe(), state);
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
  });

  root.querySelector("#ytunes-original").addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("newytm", "true");
    location.assign(url.toString());
  });

  const search = root.querySelector("#ytunes-search");
  let searchTimer = 0;

  async function runSearch(query) {
    const seq = (state.searchSeq += 1);
    const empty = root.querySelector("#ytunes-cover-empty");
    empty.hidden = false;
    empty.textContent = "Searching…";
    showCovers(state, [], "");
    renderTracks(root, [], "Searching…");
    try {
      const parsed = await YTM.searchParsed(query);
      if (seq !== state.searchSeq) return;
      state.source = "search";
      state.playlistId = "";
      state.tracks = parsed.tracks;
      state.collections = parsed.collections;
      state.visibleTracks = parsed.tracks;
      const covers = parsed.collections.length
        ? parsed.collections
        : coversFromTracks(parsed.tracks);
      showCovers(state, covers, covers[0]?.id || "");
      if (parsed.tracks.length) {
        renderTracks(root, parsed.tracks, "No tracks yet.");
      } else if (covers.length) {
        renderTracks(
          root,
          [],
          "Select an album. Double-click a cover to open it."
        );
      } else {
        empty.textContent = `No results for “${query}”.`;
        renderTracks(root, [], `No results for “${query}”.`);
      }
      const statusCenter = root.querySelector("#ytunes-status-center");
      if (statusCenter) statusCenter.textContent = `Results for “${query}”`;
    } catch (error) {
      if (seq !== state.searchSeq) return;
      empty.textContent = "Could not search.";
      renderTracks(root, [], error.message || "Could not search.");
    }
  }

  function restoreLibrary() {
    state.searchSeq += 1;
    loadSource(root, state, state.lastSource || { type: "songs" });
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = search.value.trim();
    if (!query) {
      restoreLibrary();
      return;
    }
    if (query.length < 2) return;
    searchTimer = window.setTimeout(() => runSearch(query), 400);
  });

  search.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      clearTimeout(searchTimer);
      const query = search.value.trim();
      if (query) runSearch(query);
    } else if (event.key === "Escape") {
      event.preventDefault();
      search.value = "";
      restoreLibrary();
      search.blur();
    }
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

  root.querySelector("#ytunes-tracks").addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    root.querySelectorAll("#ytunes-tracks tr").forEach((node) => {
      node.classList.toggle("is-selected", node === row);
    });
    playTrack(state.visibleTracks[Number(row.dataset.index)], state.playlistId);
  });

  root.querySelector(".ytunes-source-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-source], [data-browse], [data-playlist]");
    if (!button) return;
    root.querySelectorAll(".ytunes-source-list button").forEach((node) => {
      const on = node === button;
      node.classList.toggle("is-selected", on);
      if (on) node.setAttribute("aria-current", "true");
      else node.removeAttribute("aria-current");
    });
    search.value = "";
    state.searchSeq += 1;
    clearTimeout(searchTimer);
    if (button.dataset.playlist) {
      loadSource(root, state, {
        type: "playlist",
        browseId: `VL${button.dataset.playlist}`,
        playlistId: button.dataset.playlist,
      });
      return;
    }
    loadSource(root, state, {
      type: button.dataset.source,
      browseId: button.dataset.browse,
    });
  });

  renderPlayer(root, probe(), state);
  setInterval(() => renderPlayer(root, probe(), state), 200);
  bootLibrary(root, state);
}

async function openCollection(root, state, collection) {
  renderTracks(root, [], "Loading…");
  try {
    const body = collection.browseId
      ? { browseId: collection.browseId }
      : { browseId: `VL${collection.playlistId}` };
    const parsed = await YTM.browseParsed(body, 3);
    const tracks = parsed.tracks;
    state.playlistId = collection.playlistId || tracks[0]?.playlistId || "";
    state.visibleTracks = tracks;
    state.selectedCoverId = collection.id;
    collection.tracks = tracks;
    if (!tracks.length && parsed.collections.length) {
      showCovers(state, parsed.collections, state.selectedCoverId);
      renderTracks(root, [], "Select an album.");
      return;
    }
    renderTracks(
      root,
      tracks,
      tracks.length ? "No tracks yet." : "No tracks in this album."
    );
    showCovers(state, state.covers, state.selectedCoverId);
  } catch (error) {
    renderTracks(root, [], error.message || "Could not load album.");
  }
}

async function loadPlaylists(root) {
  const host = root.querySelector("#ytunes-playlists");
  try {
    const parsed = await YTM.browseParsed(
      { browseId: "FEmusic_liked_playlists" },
      2
    );
    const playlists = parsed.collections.filter(
      (item) => item.playlistId || item.browseId.startsWith("VL")
    );
    host.innerHTML = playlists
      .map((item) => {
        const playlistId = item.playlistId || item.browseId.replace(/^VL/, "");
        return `<button type="button" data-playlist="${escapeHtml(playlistId)}">${escapeHtml(item.title)}</button>`;
      })
      .join("");
    if (!playlists.length) {
      host.innerHTML = `<p class="ytunes-source-empty">No playlists</p>`;
    }
  } catch {
    host.innerHTML = `<p class="ytunes-source-empty">Could not load playlists</p>`;
  }
}

async function loadSource(root, state, source) {
  const empty = root.querySelector("#ytunes-cover-empty");
  empty.hidden = false;
  empty.textContent = "Loading library…";
  renderTracks(root, [], "Loading library…");
  showCovers(state, [], "");

  const type = source.type || "songs";
  state.source = type;
  state.playlistId = source.playlistId || (type === "liked" ? "LM" : "");
  if (type !== "search") {
    state.lastSource = {
      type,
      browseId: source.browseId,
      playlistId: source.playlistId,
    };
  }

  try {
    if (type === "now") {
      const status = probe();
      const tracks = status?.title
        ? [
            {
              title: status.title,
              artist: status.artist,
              album: status.album,
              duration: status.progress?.durationLabel,
              artwork: status.cover || status.artwork,
            },
          ]
        : [];
      state.tracks = tracks;
      state.visibleTracks = tracks;
      showCovers(state, coversFromTracks(tracks), "");
      renderTracks(root, tracks, "Nothing is playing.");
      return;
    }

    const browseId =
      source.browseId ||
      {
        songs: "FEmusic_liked_videos",
        liked: "VLLM",
        albums: "FEmusic_liked_albums",
        artists: "FEmusic_library_corpus_track_artists",
      }[type];
    const parsed = await YTM.browseParsed({ browseId }, 3);
    state.tracks = parsed.tracks;
    state.collections = parsed.collections;

    if (type === "albums" || type === "artists" || type === "playlist") {
      const covers = parsed.collections.length
        ? parsed.collections
        : coversFromTracks(parsed.tracks);
      state.visibleTracks = parsed.tracks;
      showCovers(state, covers, covers[0]?.id || "");
      if (parsed.tracks.length) {
        renderTracks(root, parsed.tracks, "No tracks yet.");
      } else if (covers.length) {
        renderTracks(root, [], "Select an album. Double-click a cover to open it.");
      } else {
        renderTracks(
          root,
          [],
          "No items. Sign in on YouTube Music if this library should have music."
        );
      }
      if (type !== "albums" && type !== "artists" && parsed.tracks.length) {
        state.playlistId = source.playlistId || parsed.tracks[0]?.playlistId || "";
      }
      return;
    }

    state.visibleTracks = parsed.tracks;
    showCovers(state, coversFromTracks(parsed.tracks), "");
    renderTracks(
      root,
      parsed.tracks,
      parsed.tracks.length
        ? "No tracks yet."
        : "No items. Sign in on YouTube Music if this library should have music."
    );
  } catch (error) {
    empty.textContent = "Could not load library.";
    renderTracks(root, [], error.message || "Could not load library.");
  }
}

function bootLibrary(root, state) {
  loadPlaylists(root);
  loadSource(root, state, { type: "songs" });
}
