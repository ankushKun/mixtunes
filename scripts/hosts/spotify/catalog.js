const PAGE_REQ = "ytunes-page-req";
const PAGE_RES = "ytunes-page-res";

function pageRequest(action, payload, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const onRes = (event) => {
      let data;
      try {
        data =
          typeof event.detail === "string"
            ? JSON.parse(event.detail)
            : event.detail;
      } catch {
        return;
      }
      if (data?.id !== id) return;
      document.removeEventListener(PAGE_RES, onRes);
      clearTimeout(timer);
      if (data.ok) {
        resolve(data.result);
      } else {
        reject(new Error(data.error || "page request failed"));
      }
    };
    const timer = setTimeout(() => {
      document.removeEventListener(PAGE_RES, onRes);
      reject(new Error("page request timed out"));
    }, timeout);
    document.addEventListener(PAGE_RES, onRes);
    document.dispatchEvent(
      new CustomEvent(PAGE_REQ, {
        detail: JSON.stringify({ id, action, payload }),
      })
    );
  });
}

const SpotifyRemote = {
  rest(method, path, body) {
    return pageRequest("rest", { method, path, body });
  },
  pathfinder(operationName, variables) {
    return pageRequest("pathfinder", { operationName, variables });
  },
  play(payload) {
    return pageRequest("play", payload);
  },
  player(payload) {
    return pageRequest("player", payload, 4000);
  },
  snapshot() {
    return pageRequest("snapshot", {}, 4000);
  },
  signedIn() {
    return pageRequest("signedIn", {}, 4000)
      .then((result) => Boolean(result?.signedIn))
      .catch(() => false);
  },
  playerQueue() {
    return pageRequest("playerQueue", {}, 4000).catch(() => ({
      tracks: [],
      playlistId: "",
    }));
  },
  like(id, rating) {
    return pageRequest("like", { id, rating });
  },
  harvest() {
    return pageRequest("harvest", {}, 4000).catch(() => ({ tracks: [], playlists: [] }));
  },
};

function formatClock(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function unwrapTrackNode(item) {
  if (!item || typeof item !== "object") return null;
  const nested = item.track || item.trackV2 || item.itemV2 || item.item || item;
  if (nested && nested.data && typeof nested.data === "object" && (nested.data.uri || nested.data.name)) {
    return nested.data;
  }
  if (item.data && typeof item.data === "object" && (item.data.uri || item.data.name)) {
    return item.data;
  }
  return nested;
}

function artistNames(track) {
  if (Array.isArray(track?.artists)) {
    return track.artists.map((artist) => artist?.name || artist?.profile?.name).filter(Boolean).join(", ");
  }
  const items = track?.artists?.items || [];
  return items.map((artist) => artist?.profile?.name || artist?.name).filter(Boolean).join(", ");
}

function albumNode(track) {
  return track?.album || track?.albumOfTrack || {};
}

function artworkOf(track) {
  const album = albumNode(track);
  const images = album.images || album.coverArt?.sources || track?.images || [];
  return images[0]?.url || images[images.length - 1]?.url || "";
}

function durationMsOf(track) {
  return Number(track?.duration_ms) || Number(track?.duration?.totalMilliseconds) || 0;
}

function isTrackNode(track) {
  if (!track || typeof track !== "object") return false;
  if (track.is_local) return false;
  const uri = String(track.uri || "");
  if (/^spotify:(album|artist|playlist|episode|show|ad):/i.test(uri)) return false;
  if (track.type && track.type !== "track") return false;
  if (track.__typename && track.__typename !== "Track" && track.__typename !== "GenericTrack") {
    return false;
  }
  return Boolean(
    /^spotify:track:/i.test(uri) ||
      track.type === "track" ||
      track.__typename === "Track" ||
      track.__typename === "GenericTrack"
  );
}

function mapTrack(item, extra = {}) {
  const track = unwrapTrackNode(item);
  if (!isTrackNode(track)) return null;
  const id = YTunesSpotifyIds.trackIdOf(track.uri || track.id);
  if (!id) return null;
  const title = String(track.name || track.title || "").trim();
  if (!title) return null;
  const durationMs = durationMsOf(track);
  const album = albumNode(track);
  const year = String(album.release_date || album.date?.isoString || album.date?.year || "").slice(0, 4);
  return {
    id,
    videoId: id,
    uri: track.uri || `spotify:track:${id}`,
    title,
    artist: artistNames(track),
    album: album.name || "",
    year,
    artwork: artworkOf(track),
    duration: formatClock(durationMs),
    durationMs,
    albumId: YTunesSpotifyIds.trackIdOf(album.id || album.uri) || "",
    artistId: track.artists?.[0]?.id || track.artists?.items?.[0]?.uri || "",
    playlistId: extra.playlistId || "",
    likeStatus: extra.likeStatus || "",
  };
}

function extractTracksFromPayload(root, extra = {}, seen, out) {
  const bag = out || [];
  const seenSet = seen || new WeakSet();
  if (!root || typeof root !== "object") return bag;
  if (seenSet.has(root)) return bag;
  seenSet.add(root);
  const mapped = mapTrack(root, extra);
  if (mapped && !bag.some((track) => track.id === mapped.id)) bag.push(mapped);
  const kids = Array.isArray(root) ? root : Object.values(root);
  for (const child of kids) {
    if (child && typeof child === "object") extractTracksFromPayload(child, extra, seenSet, bag);
  }
  return bag;
}

function scrapeTracklist(extra = {}) {
  const rows = document.querySelectorAll('[data-testid="tracklist-row"]');
  const tracks = [];
  for (const row of rows) {
    const link =
      row.querySelector('a[href*="/track/"]') ||
      row.querySelector('[data-testid="internal-track-link"]');
    const id = YTunesSpotifyIds.trackIdOf(link?.getAttribute("href") || "");
    if (!id) continue;
    const title = String(link?.textContent || "").trim();
    if (!title) continue;
    const artists = [...row.querySelectorAll('a[href*="/artist/"]')]
      .map((node) => String(node.textContent || "").trim())
      .filter(Boolean);
    const album = String(row.querySelector('a[href*="/album/"]')?.textContent || "").trim();
    const duration = String(
      row.querySelector('[data-testid="duration"]')?.textContent || ""
    ).trim();
    const artwork = row.querySelector("img")?.getAttribute("src") || "";
    tracks.push({
      id,
      videoId: id,
      uri: `spotify:track:${id}`,
      title,
      artist: artists.join(", "),
      album,
      year: "",
      artwork,
      duration,
      durationMs: 0,
      albumId: YTunesSpotifyIds.trackIdOf(
        row.querySelector('a[href*="/album/"]')?.getAttribute("href") || ""
      ),
      artistId: "",
      playlistId: extra.playlistId || "",
      likeStatus: extra.likeStatus || "",
    });
  }
  return tracks;
}

function scrapePlaylists() {
  const seen = new Set();
  const items = [];
  for (const link of document.querySelectorAll('a[href*="/playlist/"]')) {
    const href = link.getAttribute("href") || "";
    const id = (href.match(/\/playlist\/([A-Za-z0-9]{22})/) || [])[1];
    if (!id || seen.has(id)) continue;
    const title = String(link.textContent || "").trim();
    if (!title) continue;
    seen.add(id);
    items.push({ title, playlistId: id });
  }
  return items;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapCollection(item, kind) {
  if (!item) return null;
  const images = item.images || item.album?.images || [];
  const art = images[0]?.url || images[images.length - 1]?.url || "";
  const id = item.id || "";
  if (!id) return null;
  const playlistId =
    kind === "album"
      ? `spotify:album:${id}`
      : kind === "playlist"
        ? item.uri || `spotify:playlist:${id}`
        : item.uri || id;
  return {
    id,
    title: item.name || "",
    subtitle: item.owner?.display_name || (item.artists || []).map((a) => a.name).join(", ") || "",
    artwork: art,
    kind,
    playlistId,
    browseId: id,
    uri: item.uri || playlistId,
  };
}

function emptyParsed() {
  return { tracks: [], collections: [], shelves: [], chips: [], lyricsId: "" };
}

/**
 * Spacing between paged Web API reads. A tight sequential walk of /me/tracks
 * 429s within a few pages, and one 429 arms a 60s backoff that then blocks the
 * player snapshot too, so pacing here is cheaper than recovering from it.
 */
const PAGE_GAP_MS = 250;

/**
 * Hard ceiling on one library walk. BROWSE_PAGE_CAP is 500, which at 50 items a
 * page is a 500-request burst that Spotify answers with an escalating 429
 * penalty lasting far longer than the walk saved.
 */
const WALK_PAGE_CAP = 60;

/** Clamp a caller's page budget to WALK_PAGE_CAP. */
function walkPages(pages) {
  return Math.min(YTunesList.browsePageCount(pages), WALK_PAGE_CAP);
}

async function collectItems(path, maxPages, opts = {}) {
  const pages = YTunesList.browsePageCount(maxPages);
  const items = [];
  let next = path;
  for (let i = 0; i < pages && next; i += 1) {
    if (opts.shouldStop?.()) break;
    let page;
    try {
      page = await SpotifyRemote.rest("GET", next);
    } catch (error) {
      // A rate limit partway through must not discard the pages that landed.
      // Report what we have; only a first-page failure is a real failure.
      if (!items.length) throw error;
      break;
    }
    const batch = page.items || [];
    items.push(...batch);
    opts.onBatch?.(batch);
    next = page.next
      ? String(page.next).replace(/^https:\/\/api\.spotify\.com\/v1/, "")
      : "";
    if (next) await sleep(PAGE_GAP_MS);
  }
  return items;
}

const SpotifyCatalog = (() => {
  const MEMO_MS = 120000;
  const memo = new Map();

  async function memoized(key, load) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
    const value = await load();
    memo.set(key, { at: Date.now(), value });
    return value;
  }

  function followOpts(type, opts = {}) {
    const pages =
      type === "liked" || type === "playlist" || type === "album"
        ? opts.pages ?? "all"
        : opts.pages ?? 2;
    return {
      pages,
      onProgress: opts.onProgress || null,
      shouldStop: opts.shouldStop || null,
    };
  }

  async function waitForLikedTracks(extra, follow) {
    const likedLink =
      document.querySelector('a[href="/collection/tracks"]') ||
      document.querySelector('a[href*="/collection/tracks"]');
    likedLink?.click();
    const started = Date.now();
    let last = [];
    let harvested = { hashes: {}, tracks: [] };
    while (Date.now() - started < 8000) {
      harvested = await SpotifyRemote.harvest();
      last = extractTracksFromPayload(
        { items: harvested?.tracks || [] },
        extra
      );
      if (last.length) return last;
      last = scrapeTracklist(extra);
      if (last.length) return last;
      await sleep(400);
    }
    const ops = Object.keys(harvested?.hashes || {});
    const pathfinderHits = [];
    for (const op of ops) {
      try {
        const data = await SpotifyRemote.pathfinder(op);
        last = extractTracksFromPayload(data, extra);
        pathfinderHits.push({ op, tracks: last.length });
        if (last.length) return last;
      } catch (error) {
        pathfinderHits.push({ op, error: String(error && error.message || error).slice(0, 80) });
      }
    }
    last = scrapeTracklist(extra);
    return last;
  }

  /**
   * Liked Songs come from the Web API first: /me/tracks is paginated and
   * ordered, and needs no stock DOM. The scrape path is only a fallback for a
   * missing token — the overlay covers the page it would have to read, and
   * Spotify never navigates there on its own.
   */
  async function browseLiked(opts) {
    const follow = followOpts("liked", opts);
    const extra = { likeStatus: "like", playlistId: "collection" };
    const tracks = [];
    try {
      await collectItems("/me/tracks?limit=50", walkPages(follow.pages), {
        shouldStop: follow.shouldStop,
        onBatch: (batch) => {
          for (const item of batch) {
            const track = mapTrack(item, extra);
            if (track) tracks.push(track);
          }
          // Paint each page as it lands so a long library fills in instead of
          // blocking on the full walk.
          follow.onProgress?.({
            ...emptyParsed(),
            tracks: tracks.slice(),
            playlistId: "collection",
          });
        },
      });
    } catch {
      /* no first page: fall through to the page scrape */
    }
    const final = tracks.length ? tracks : await waitForLikedTracks(extra, follow);
    follow.onProgress?.({ ...emptyParsed(), tracks: final, isFinal: true });
    return { ...emptyParsed(), tracks: final, playlistId: "collection" };
  }

  async function browsePlaylist(source, opts) {
    const follow = followOpts("playlist", opts);
    let id = String(source.playlistId || source.browseId || source.id || "");
    id = id.replace(/^spotify:playlist:/, "");
    if (id === "collection" || id.endsWith(":collection")) return browseLiked(opts);
    if (id.startsWith("spotify:album:")) {
      return browseAlbum({ browseId: id.replace(/^spotify:album:/, "") }, opts);
    }
    if (!id) return emptyParsed();
    const tracks = [];
    await collectItems(`/playlists/${encodeURIComponent(id)}/tracks?limit=50`, walkPages(follow.pages), {
      shouldStop: follow.shouldStop,
      onBatch: (batch) => {
        for (const item of batch) {
          const track = mapTrack(item, { playlistId: id });
          if (track) tracks.push(track);
        }
        follow.onProgress?.({
          ...emptyParsed(),
          tracks: tracks.slice(),
          playlistId: id,
        });
      },
    });
    follow.onProgress?.({ ...emptyParsed(), tracks, playlistId: id, isFinal: true });
    return { ...emptyParsed(), tracks, playlistId: id };
  }

  async function browseAlbum(source, opts) {
    const id = String(source.browseId || source.id || "").replace(/^spotify:album:/, "");
    if (!id) return emptyParsed();
    const album = await SpotifyRemote.rest("GET", `/albums/${encodeURIComponent(id)}`);
    const items = album.tracks?.items || [];
    const extra = {
      playlistId: `spotify:album:${id}`,
      album: album.name,
      year: String(album.release_date || "").slice(0, 4),
    };
    const tracks = items
      .map((item) =>
        mapTrack(
          {
            ...item,
            album,
          },
          extra
        )
      )
      .filter(Boolean);
    opts.onProgress?.({ tracks, collections: [], isFinal: true });
    return { ...emptyParsed(), tracks, playlistId: extra.playlistId };
  }

  async function browseArtist(source) {
    const id = String(source.browseId || source.id || "").replace(/^spotify:artist:/, "");
    if (!id) return emptyParsed();
    try {
      const top = await SpotifyRemote.rest(
        "GET",
        `/artists/${encodeURIComponent(id)}/top-tracks?market=from_token`
      );
      const tracks = (top.tracks || []).map((item) => mapTrack(item)).filter(Boolean);
      return { ...emptyParsed(), tracks };
    } catch {
      return emptyParsed();
    }
  }

  async function browseNow() {
    const queued = await SpotifyRemote.playerQueue();
    return { ...emptyParsed(), tracks: queued.tracks || [], playlistId: queued.playlistId || "" };
  }

  async function browseCollection(query, opts) {
    const body = query?.body || query || {};
    if (body.albumId) return browseAlbum({ browseId: body.albumId }, opts);
    if (body.artistId) return browseArtist({ browseId: body.artistId });
    if (body.playlistId || body.id) {
      return browsePlaylist({ playlistId: body.playlistId || body.id }, opts);
    }
    return emptyParsed();
  }

  async function browse(source, opts = {}) {
    const type = source?.type || "liked";
    if (type === "collection") return browseCollection(source, opts);
    if (type === "search") return search(source.query || source.title || "");
    if (type === "liked" || type === "songs") return browseLiked(opts);
    if (type === "playlist") return browsePlaylist(source, opts);
    if (type === "album") return browseAlbum(source, opts);
    if (type === "artist") return browseArtist(source);
    if (type === "now") return browseNow();
    return emptyParsed();
  }

  async function search(query) {
    if (!query) return emptyParsed();
    for (const op of ["searchDesktop", "searchTracks"]) {
      try {
        const data = await SpotifyRemote.pathfinder(op, {
          searchTerm: query,
          offset: 0,
          limit: 20,
          numberOfTopResults: 5,
          includeAudiobooks: false,
        });
        const tracks = extractTracksFromPayload(data);
        if (tracks.length) return { ...emptyParsed(), tracks, collections: [] };
      } catch {
        /* wait for a harvested hash */
      }
    }
    try {
      const data = await SpotifyRemote.rest(
        "GET",
        `/search?q=${encodeURIComponent(query)}&type=track,album,playlist,artist&limit=20`
      );
      const tracks = (data.tracks?.items || []).map((item) => mapTrack(item)).filter(Boolean);
      const collections = [
        ...(data.albums?.items || []).map((item) => mapCollection(item, "album")),
        ...(data.playlists?.items || []).map((item) => mapCollection(item, "playlist")),
        ...(data.artists?.items || []).map((item) => mapCollection(item, "artist")),
      ].filter(Boolean);
      return { ...emptyParsed(), tracks, collections };
    } catch {
      return emptyParsed();
    }
  }

  async function suggest(query) {
    if (!query) return [];
    try {
      const data = await SpotifyRemote.rest(
        "GET",
        `/search?q=${encodeURIComponent(query)}&type=track&limit=6`
      );
      return (data.tracks?.items || [])
        .map((item) => item?.name)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function playlists() {
    return memoized("playlists", async () => {
      // Same reasoning as browseLiked: the sidebar the scraper wants is behind
      // the overlay, so ask the API before falling back to the page.
      try {
        const items = await collectItems("/me/playlists?limit=50", 2);
        const owned = items
          .map((item) => ({
            title: String(item?.name || "").trim(),
            playlistId: String(item?.id || item?.uri || "").replace(
              /^spotify:playlist:/,
              ""
            ),
          }))
          .filter((item) => item.title && item.playlistId);
        if (owned.length) return owned;
      } catch {
        /* fall back to the page */
      }
      const scraped = scrapePlaylists();
      if (scraped.length) return scraped;
      const harvested = await SpotifyRemote.harvest();
      if (harvested?.playlists?.length) {
        return harvested.playlists.map((item) => ({
          title: item.name || item.title,
          playlistId: String(item.id || item.playlistId || "").replace(/^spotify:playlist:/, ""),
        })).filter((item) => item.title && item.playlistId);
      }
      return scraped;
    });
  }

  function moods() {
    return Promise.resolve([]);
  }

  function listIdFor(source) {
    if (!source) return "";
    if (source.playlistId) return YTunesSpotifyIds.listId(source.playlistId);
    if (source.type === "liked" || source.type === "songs") return "collection";
    return "";
  }

  function isSongCover(cover) {
    if (!cover) return false;
    if (cover.kind === "song") return true;
    if (cover.kind === "album" || cover.kind === "playlist" || cover.kind === "artist") {
      return false;
    }
    return Boolean(cover.id && YTunesSpotifyIds.playable(cover.id) && (cover.tracks?.length || 1) <= 1);
  }

  function trackFromCover(cover) {
    const id = YTunesSpotifyIds.trackIdOf(cover?.id || cover?.videoId);
    return {
      id,
      videoId: id,
      title: cover?.title,
      artist: cover?.artist || "",
      album: cover?.album || "",
      artwork: cover?.artwork,
      uri: cover?.uri || (id ? `spotify:track:${id}` : ""),
      playlistId: cover?.playlistId || "",
    };
  }

  function albumOf(track) {
    const id = String(track?.albumId || "");
    if (!id) return null;
    return {
      id,
      browseId: id,
      playlistId: `spotify:album:${id}`,
      kind: "album",
      title: track.album || "",
    };
  }

  function artistOf(track) {
    const id = String(track?.artistId || "");
    if (!id) return null;
    return { id, browseId: id, kind: "artist", title: track.artist || "" };
  }

  function collectionQuery(cover) {
    if (!cover) return null;
    if (cover.kind === "album" || cover.albumId || String(cover.playlistId || "").startsWith("spotify:album:")) {
      const albumId = cover.albumId || cover.browseId || cover.id;
      return {
        type: "collection",
        body: { albumId },
        playlistId: `spotify:album:${albumId}`,
        selfBrowseId: albumId,
        selfId: cover.id || albumId,
      };
    }
    if (cover.kind === "artist") {
      return {
        type: "collection",
        body: { artistId: cover.browseId || cover.id },
        selfBrowseId: cover.browseId || cover.id,
        selfId: cover.id,
      };
    }
    const playlistId = cover.playlistId || cover.browseId || cover.id;
    if (!playlistId) return null;
    return {
      type: "collection",
      body: { playlistId },
      playlistId,
      selfBrowseId: cover.browseId || "",
      selfId: cover.id || "",
    };
  }

  function forgetPlaylists() {
    memo.delete("playlists");
  }

  return {
    browse,
    search,
    suggest,
    playlists,
    moods,
    collectionQuery,
    listIdFor,
    forgetPlaylists,
    isSongCover,
    trackFromCover,
    albumOf,
    artistOf,
    signedIn: () => SpotifyRemote.signedIn(),
    lyrics: async () => ({ text: "", lines: [] }),
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { extractTracksFromPayload, mapTrack };
}
