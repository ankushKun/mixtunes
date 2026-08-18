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
      if (data.ok) resolve(data.result);
      else reject(new Error(data.error || "page request failed"));
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

function runsText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.text && !node.runs) return node.text;
  const runs = node.runs || [];
  return runs.map((run) => run.text || "").join("");
}

function thumbnailUrl(node) {
  const thumbs =
    node?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    node?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    node?.thumbnail?.thumbnails ||
    node?.thumbnailRenderer?.thumbnail?.thumbnails ||
    [];
  if (!thumbs.length) return "";
  const url = thumbs[thumbs.length - 1]?.url || "";
  return typeof squareArtwork === "function" ? squareArtwork(url, 600) : url;
}

function watchEndpoint(node) {
  return (
    node?.navigationEndpoint ||
    node?.onTap ||
    node?.playNavigationEndpoint ||
    node?.overlay?.musicItemThumbnailOverlayRenderer?.content
      ?.musicPlayButtonRenderer?.playNavigationEndpoint ||
    null
  );
}

function pickPlaylistId(node) {
  const endpoint = watchEndpoint(node);
  return (
    endpoint?.watchEndpoint?.playlistId ||
    endpoint?.watchPlaylistEndpoint?.playlistId ||
    node?.navigationEndpoint?.watchEndpoint?.playlistId ||
    ""
  );
}

function pickBrowseId(node) {
  return (
    node?.navigationEndpoint?.browseEndpoint?.browseId ||
    node?.onTap?.browseEndpoint?.browseId ||
    node?.browseEndpoint?.browseId ||
    ""
  );
}

function pickSetVideoId(node) {
  return (
    node?.playlistItemData?.setVideoId ||
    node?.playlistSetVideoId ||
    node?.setVideoId ||
    node?.navigationEndpoint?.watchEndpoint?.playlistSetVideoId ||
    watchEndpoint(node)?.watchEndpoint?.playlistSetVideoId ||
    ""
  );
}

function isSuggestionShelf(title) {
  return /suggest|recommend|you might|more like|more from/i.test(String(title || ""));
}

function pickVideoId(node) {
  return (
    node?.playlistItemData?.videoId ||
    node?.navigationEndpoint?.watchEndpoint?.videoId ||
    watchEndpoint(node)?.watchEndpoint?.videoId ||
    node?.videoId ||
    ""
  );
}

function browseFromRuns(runs) {
  for (const run of runs || []) {
    const id = run?.navigationEndpoint?.browseEndpoint?.browseId || "";
    if (id) return id;
  }
  return "";
}

function isPlayableVideoId(id) {
  return YTunesYtmIds.playable(id);
}

function isConcretePlaylist(id) {
  return YTunesYtmIds.isConcreteList(id);
}

function musicVideoType(node) {
  const watch =
    watchEndpoint(node)?.watchEndpoint || node?.navigationEndpoint?.watchEndpoint;
  return (
    watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
      ?.musicVideoType || ""
  );
}

function yearFromBits(bits) {
  return (bits || []).find((bit) => /^\d{4}$/.test(bit)) || "";
}

function likeStatusOf(node) {
  if (!node || typeof node !== "object") return "";
  const direct =
    node.likeStatus ||
    node.likeButtonRenderer?.likeStatus ||
    node.likeButtonViewModel?.likeButtonViewModel?.likeStatus ||
    "";
  if (/^(LIKE|DISLIKE|INDIFFERENT)$/i.test(direct)) return String(direct).toLowerCase();

  let found = "";
  const seen = new WeakSet();
  const visit = (value) => {
    if (found || !value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const likeBtn = value.likeButtonRenderer;
    if (likeBtn?.likeStatus) {
      found = String(likeBtn.likeStatus).toLowerCase();
      return;
    }
    const toggle = value.toggleMenuServiceItemRenderer;
    if (toggle) {
      const icon = String(toggle.defaultIcon?.iconType || "").toUpperCase();
      const label = `${runsText(toggle.defaultText)} ${runsText(toggle.toggledText)}`.toLowerCase();
      const isLikeItem =
        icon === "LIKE" ||
        icon === "FAVORITE" ||
        /\blike\b/.test(label) ||
        /liked/.test(label);
      if (isLikeItem) {
        const defaultText = runsText(toggle.defaultText).toLowerCase();
        if (toggle.isToggled === true || /unlike|remove from liked/.test(defaultText)) {
          found = "like";
        } else if (toggle.isToggled === false) {
          found = "indifferent";
        }
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(node);
  return found;
}

function likedFlag(item) {
  return likeStatusOf(item) === "like";
}

function isMetaBit(bit) {
  const text = String(bit || "").trim();
  if (!text) return true;
  if (/^\d{4}$/.test(text)) return true;
  if (/^(song|songs|video|videos|album|single|ep|playlist|mix)$/i.test(text)) return true;
  if (/^[\d.,]+\s*[kmb]?\s*(plays?|views?)$/i.test(text)) return true;
  if (/^\d+:\d+(?::\d+)?$/.test(text)) return true;
  return false;
}

function collectionKind(browseId, playlistId, subtitle, shelf, videoId) {
  const hay = `${subtitle || ""} ${shelf || ""}`;
  const browse = String(browseId || "");
  if (/podcast/i.test(hay) || browse.startsWith("MPSP")) return "podcast";
  if (browse.startsWith("MPRE")) return "album";
  if (browse.startsWith("MPLA") || browse.startsWith("UC")) return "artist";
  if (/\b(album|single|ep)\b/i.test(subtitle) && !/\b(song|video)\b/i.test(subtitle)) {
    return "album";
  }
  if (/\bplaylist\b/i.test(subtitle) && !/\b(song|video)\b/i.test(subtitle)) {
    return "playlist";
  }
  if (/\b(mix|radio|station)\b/i.test(subtitle) && !/\b(song|video)\b/i.test(subtitle)) {
    return "playlist";
  }
  if (/\bsong\b/i.test(subtitle) || /\bvideo\b/i.test(subtitle)) return "song";
  if (videoId && /(plays?|views?)/i.test(subtitle)) return "song";
  if (videoId && !browse.startsWith("VL") && !/\bplaylist\b/i.test(hay)) return "song";
  if (playlistId || browse.startsWith("VL")) return "playlist";
  if (videoId) return "song";
  return "album";
}

function durationFromItem(item, columns) {
  for (const column of columns) {
    if (/^\d+:\d+(?::\d+)?$/.test(column.text)) return column.text;
  }
  const fixed = item.fixedColumns || [];
  for (const column of fixed) {
    const text = runsText(
      column.musicResponsiveListItemFixedColumnRenderer?.text
    );
    if (/^\d+:\d+(?::\d+)?$/.test(text)) return text;
  }
  const length = runsText(item.lengthText);
  if (/^\d+:\d+(?::\d+)?$/.test(length)) return length;
  return "";
}

function parseTwoRow(item, acc) {
  const title = runsText(item.title);
  if (!title) return;
  const subtitle = runsText(item.subtitle);
  const browseId = pickBrowseId(item);
  const playlistId = pickPlaylistId(item);
  const endpoint = watchEndpoint(item) || item.navigationEndpoint;
  const videoId = pickVideoId(item) || endpoint?.watchEndpoint?.videoId || "";
  if (!browseId && !playlistId && !endpoint?.watchEndpoint && !videoId) return;
  if (/^new playlist$/i.test(title)) return;
  const bits = subtitle.split("•").map((part) => part.trim()).filter(Boolean);
  const shelf = acc.shelf || "";
  const kind = collectionKind(browseId, playlistId, subtitle, shelf, videoId);
  const artist = bits.find((bit) => !isMetaBit(bit)) || bits[0] || "";
  const id = browseId || playlistId || videoId || `c:${title}:${acc.collections.length}`;
  const collection = {
    id,
    kind,
    title,
    subtitle,
    artist,
    year: yearFromBits(bits),
    artwork: thumbnailUrl(item),
    browseId,
    playlistId,
    videoId,
    endpoint,
    shelf,
  };
  if (kind === "song" && (videoId || endpoint?.watchEndpoint)) {
    collection.tracks = [
      {
        id: videoId || id,
        title,
        artist,
        album: "",
        year: collection.year,
        artwork: collection.artwork,
        videoId,
        playlistId,
        browseId,
        shelf,
        suggested: isSuggestionShelf(shelf),
        setVideoId: pickSetVideoId(item),
        endpoint: endpoint || { watchEndpoint: { videoId, playlistId: playlistId || undefined } },
      },
    ];
  }
  acc.collections.push(collection);
}

function columnPlain(text) {
  const value = String(text || "").trim();
  if (!value || value.includes("•") || isMetaBit(value)) return "";
  return value;
}

function creditsFromBits(bits, columns) {
  const artistCol = columnPlain(columns?.[1]?.text);
  const albumCol = columnPlain(columns?.[2]?.text);
  const artist = artistCol || bits.find((bit) => !isMetaBit(bit)) || bits[0] || "";
  const album =
    (albumCol && albumCol !== artist ? albumCol : "") ||
    bits.find((bit) => bit !== artist && !isMetaBit(bit)) ||
    "";
  return { artist, album, year: yearFromBits(bits) };
}

function parseListItem(item, acc) {
  const flex = item.flexColumns || [];
  const columns = flex.map((column) => {
    const text = column.musicResponsiveListItemFlexColumnRenderer?.text;
    return { text: runsText(text), runs: text?.runs || [] };
  });
  const title = columns[0]?.text || runsText(item.title);
  if (!title) return;

  const duration = durationFromItem(item, columns);
  const rest = columns
    .slice(1)
    .map((column) => column.text)
    .filter((text) => text && text !== duration);
  const bits = rest
    .join(" • ")
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean);

  const videoId = pickVideoId(item);
  const browseId = pickBrowseId(item);
  const playlistId = pickPlaylistId(item);
  const endpoint = watchEndpoint(item) || item.navigationEndpoint;
  const { artist, album, year } = creditsFromBits(bits, columns);
  const pageType =
    item.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ||
    endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ||
    "";
  const asCollection =
    browseId.startsWith("MPRE") ||
    browseId.startsWith("MPLA") ||
    browseId.startsWith("MPSP") ||
    /ALBUM|ARTIST|PLAYLIST|PODCAST/i.test(pageType);

  if (!asCollection && (videoId || endpoint?.watchEndpoint)) {
    acc.tracks.push({
      id: videoId || `t:${title}:${acc.tracks.length}`,
      title,
      artist,
      album,
      year,
      duration,
      artwork: thumbnailUrl(item),
      videoId,
      playlistId,
      browseId,
      artistBrowseId: browseFromRuns(columns[1]?.runs),
      albumBrowseId: browseFromRuns(columns[2]?.runs),
      musicVideoType: musicVideoType(item),
      shelf: acc.shelf || "",
      suggested: isSuggestionShelf(acc.shelf),
      liked: likedFlag(item),
      setVideoId: pickSetVideoId(item),
      endpoint: endpoint || {
        watchEndpoint: { videoId, playlistId: playlistId || undefined },
      },
    });
    return;
  }

  if (browseId || playlistId) {
    parseTwoRow(
      {
        title: { runs: [{ text: title }] },
        subtitle: { runs: [{ text: rest.join(" • ") }] },
        thumbnail: item.thumbnail,
        navigationEndpoint: item.navigationEndpoint,
        overlay: item.overlay,
      },
      acc
    );
  }
}

function parseCardShelf(item, acc) {
  const title =
    runsText(item.title) ||
    runsText(item.header?.musicCardShelfHeaderBasicRenderer?.title);
  if (!title) return;
  const subtitle = runsText(item.subtitle);
  const buttonCommand = item.buttons?.[0]?.buttonRenderer?.command;
  const endpoint =
    item.onTap ||
    watchEndpoint(item) ||
    item.navigationEndpoint ||
    buttonCommand ||
    null;
  const videoId =
    pickVideoId(item) ||
    endpoint?.watchEndpoint?.videoId ||
    buttonCommand?.watchEndpoint?.videoId ||
    "";
  const browseId =
    pickBrowseId(item) ||
    item.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
    "";
  const playlistId =
    pickPlaylistId(item) ||
    buttonCommand?.watchPlaylistEndpoint?.playlistId ||
    buttonCommand?.watchEndpoint?.playlistId ||
    "";
  const bits = subtitle
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean);

  if (videoId || endpoint?.watchEndpoint) {
    acc.tracks.push({
      id: videoId || `t:${title}:${acc.tracks.length}`,
      title,
      artist: bits.find((bit) => !isMetaBit(bit)) || bits[1] || "",
      album: bits.find((bit, i) => i > 0 && !isMetaBit(bit)) || "",
      year: yearFromBits(bits),
      duration: bits.find((bit) => /^\d+:\d+(?::\d+)?$/.test(bit)) || "",
      artwork: thumbnailUrl(item),
      videoId,
      playlistId,
      browseId,
      musicVideoType: musicVideoType(item),
      shelf: acc.shelf || "",
      suggested: isSuggestionShelf(acc.shelf),
      liked: likedFlag(item),
      setVideoId: pickSetVideoId(item),
      endpoint: endpoint || {
        watchEndpoint: { videoId, playlistId: playlistId || undefined },
      },
    });
    return;
  }

  if (browseId || playlistId) {
    parseTwoRow(
      {
        title: { runs: [{ text: title }] },
        subtitle: { runs: [{ text: subtitle }] },
        thumbnail: item.thumbnail,
        thumbnailRenderer: item.thumbnailRenderer,
        navigationEndpoint: endpoint || item.navigationEndpoint,
        overlay: item.overlay,
      },
      acc
    );
  }
}

function parsePanelVideo(item, acc) {
  const title = runsText(item.title);
  if (!title) return;
  const videoId = pickVideoId(item);
  if (!videoId && !item.navigationEndpoint?.watchEndpoint) return;
  const byline = runsText(item.longBylineText || item.shortBylineText);
  const bits = byline
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean);
  const { artist, album, year } = creditsFromBits(bits);
  acc.tracks.push({
    id: videoId || `t:${title}:${acc.tracks.length}`,
    title,
    artist: artist || runsText(item.shortBylineText) || "",
    album,
    year,
    duration: runsText(item.lengthText),
    artwork: thumbnailUrl(item),
    videoId,
    playlistId: pickPlaylistId(item),
    musicVideoType: musicVideoType(item),
    shelf: acc.shelf || "",
    suggested: isSuggestionShelf(acc.shelf),
    liked: likedFlag(item),
    setVideoId: pickSetVideoId(item),
    endpoint: item.navigationEndpoint || {
      watchEndpoint: { videoId },
    },
  });
}

function parseChip(node, acc) {
  const title =
    runsText(node.text) || runsText(node.title) || runsText(node.buttonText);
  if (!title || /^play all$/i.test(title) || /^show all$/i.test(title)) return;
  const endpoint =
    node.navigationEndpoint ||
    node.clickCommand ||
    node.onTap ||
    node.command ||
    null;
  const browse = endpoint?.browseEndpoint || node.browseEndpoint;
  if (!browse?.browseId && !endpoint) return;
  if (!acc.chips) acc.chips = [];
  acc.chips.push({
    title,
    browseId: browse?.browseId || "",
    params: browse?.params || "",
    endpoint,
  });
}

function shelfTitle(node) {
  return (
    runsText(node.title) ||
    runsText(node.header?.musicCarouselShelfBasicHeaderRenderer?.title) ||
    runsText(node.header?.musicShelfHeaderRenderer?.title) ||
    runsText(node.header?.title) ||
    ""
  );
}

function pushShelf(acc, title, tracksAt, collectionsAt) {
  const tracks = acc.tracks.slice(tracksAt);
  const collections = acc.collections.slice(collectionsAt);
  if (!tracks.length && !collections.length) return;
  if (!acc.shelves) acc.shelves = [];
  acc.shelves.push({
    title: title || acc.shelf || "",
    tracks,
    collections,
  });
}

function walkNamedShelf(renderer, acc, walk) {
  const title = shelfTitle(renderer);
  const prev = acc.shelf;
  const tracksAt = acc.tracks.length;
  const collectionsAt = acc.collections.length;
  if (title) acc.shelf = title;
  for (const value of Object.values(renderer)) {
    if (value && typeof value === "object") walk(value);
  }
  pushShelf(acc, title, tracksAt, collectionsAt);
  acc.shelf = prev;
}

function parseBrowse(response) {
  const acc = {
    tracks: [],
    collections: [],
    shelves: [],
    lyricsId: "",
    suggestions: [],
    chips: [],
  };
  const seen = new Set();
  const seenNodes = new WeakSet();

  const rememberTrack = (index) => {
    const track = acc.tracks[index];
    const key = `t:${track.videoId || track.setVideoId || track.id}`;
    if (seen.has(key)) acc.tracks.splice(index, 1);
    else seen.add(key);
  };
  const rememberCollection = (index) => {
    const key = `c:${acc.collections[index].id}`;
    if (seen.has(key)) acc.collections.splice(index, 1);
    else seen.add(key);
  };

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.musicCardShelfRenderer) {
      const prev = acc.shelf;
      const shelf = shelfTitle(node.musicCardShelfRenderer);
      if (shelf) acc.shelf = shelf;
      const tracksAt = acc.tracks.length;
      const collectionsAt = acc.collections.length;
      parseCardShelf(node.musicCardShelfRenderer, acc);
      for (let i = acc.tracks.length - 1; i >= tracksAt; i -= 1) rememberTrack(i);
      for (let i = acc.collections.length - 1; i >= collectionsAt; i -= 1) {
        rememberCollection(i);
      }
      walk(node.musicCardShelfRenderer.contents);
      pushShelf(acc, shelf || acc.shelf, tracksAt, collectionsAt);
      acc.shelf = prev;
      return;
    }
    if (node.musicCarouselShelfRenderer) {
      walkNamedShelf(node.musicCarouselShelfRenderer, acc, walk);
      return;
    }
    if (node.musicShelfRenderer) {
      walkNamedShelf(node.musicShelfRenderer, acc, walk);
      return;
    }
    if (node.musicPlaylistShelfRenderer) {
      walkNamedShelf(node.musicPlaylistShelfRenderer, acc, walk);
      return;
    }
    if (node.chipCloudChipRenderer) {
      parseChip(node.chipCloudChipRenderer, acc);
    }
    if (node.musicNavigationButtonRenderer) {
      parseChip(node.musicNavigationButtonRenderer, acc);
    }
    if (node.musicTwoRowItemRenderer) {
      const start = acc.collections.length;
      parseTwoRow(node.musicTwoRowItemRenderer, acc);
      for (let i = acc.collections.length - 1; i >= start; i -= 1) {
        rememberCollection(i);
      }
      return;
    }
    if (node.musicResponsiveListItemRenderer) {
      const tracksAt = acc.tracks.length;
      const collectionsAt = acc.collections.length;
      parseListItem(node.musicResponsiveListItemRenderer, acc);
      for (let i = acc.tracks.length - 1; i >= tracksAt; i -= 1) rememberTrack(i);
      for (let i = acc.collections.length - 1; i >= collectionsAt; i -= 1) {
        rememberCollection(i);
      }
      return;
    }
    if (node.playlistPanelVideoWrapperRenderer) {
      const wrapper = node.playlistPanelVideoWrapperRenderer;
      walk(wrapper.primaryRenderer);
      return;
    }
    if (node.playlistPanelVideoRenderer) {
      const start = acc.tracks.length;
      parsePanelVideo(node.playlistPanelVideoRenderer, acc);
      for (let i = acc.tracks.length - 1; i >= start; i -= 1) rememberTrack(i);
      return;
    }
    const browse = node.browseEndpoint || node.navigationEndpoint?.browseEndpoint;
    const pageType =
      browse?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType || "";
    if (
      browse?.browseId &&
      /LYRICS/i.test(pageType) &&
      !acc.lyricsId
    ) {
      acc.lyricsId = browse.browseId;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  };

  walk(response);
  return acc;
}

function continuationToken(response) {
  const found = [];
  const seenNodes = new WeakSet();
  const walk = (node, inShelf) => {
    if (!node || typeof node !== "object") return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    const shelf =
      inShelf ||
      Boolean(
        node.musicPlaylistShelfRenderer ||
          node.musicShelfRenderer ||
          node.playlistPanelRenderer
      );
    const token =
      node.nextContinuationData?.continuation ||
      node.continuationCommand?.token ||
      "";
    if (token) {
      found.push({ token, shelf });
      if (shelf) return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, shelf));
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value, shelf);
    }
  };
  walk(response, false);
  return (found.find((item) => item.shelf) || found[0])?.token || "";
}

const SONGS_SEARCH_PARAMS = "EgWKAQIIAWoMEA4QChADEAQQCRAF";

const queueMemo = { key: "", at: 0, data: null, inflight: null, gen: 0 };

function parseQueuePanel(response) {
  const acc = { tracks: [], collections: [], lyricsId: "", chips: [] };
  const seen = new Set();
  const seenWalk = new WeakSet();
  const rememberTrack = (index) => {
    const key = `t:${acc.tracks[index].videoId || acc.tracks[index].id}`;
    if (seen.has(key) || !isPlayableVideoId(acc.tracks[index].videoId)) {
      acc.tracks.splice(index, 1);
    } else {
      seen.add(key);
    }
  };

  const walkPanel = (node) => {
    if (!node || typeof node !== "object") return;
    if (seenWalk.has(node)) return;
    seenWalk.add(node);
    if (Array.isArray(node)) {
      node.forEach(walkPanel);
      return;
    }
    if (node.automixPreviewVideoRenderer) return;
    if (node.playlistPanelVideoWrapperRenderer) {
      walkPanel(node.playlistPanelVideoWrapperRenderer.primaryRenderer);
      return;
    }
    if (node.playlistPanelVideoRenderer) {
      const start = acc.tracks.length;
      parsePanelVideo(node.playlistPanelVideoRenderer, acc);
      for (let i = acc.tracks.length - 1; i >= start; i -= 1) rememberTrack(i);
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walkPanel(value);
    }
  };

  const collect = (node, buckets, visited) => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    if (node.musicQueueRenderer) {
      buckets.queues.push(node.musicQueueRenderer);
      return;
    }
    if (node.playlistPanelRenderer) {
      buckets.panels.push(node.playlistPanelRenderer);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => collect(child, buckets, visited));
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") collect(value, buckets, visited);
    }
  };

  const buckets = { queues: [], panels: [] };
  collect(response, buckets, new WeakSet());
  (buckets.queues.length ? buckets.queues : buckets.panels).forEach(walkPanel);
  acc.lyricsId = parseBrowse(response).lyricsId || "";
  return acc;
}

function automixPlaylistId(response) {
  let found = "";
  const seenNodes = new WeakSet();
  const walk = (node) => {
    if (!node || typeof node !== "object" || found) return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    const preview = node.automixPreviewVideoRenderer;
    if (preview) {
      found =
        preview.content?.automixPlaylistVideoRenderer?.navigationEndpoint
          ?.watchEndpoint?.playlistId ||
        preview.navigationEndpoint?.watchEndpoint?.playlistId ||
        pickPlaylistId(preview) ||
        "";
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  };
  walk(response);
  return found;
}

function playableQueueTracks(tracks) {
  return (tracks || []).filter((track) => isPlayableVideoId(track.videoId));
}

function mergeQueueTracks(hostTracks, nextTracks) {
  const host = playableQueueTracks(hostTracks);
  const next = playableQueueTracks(nextTracks);
  const extras = new Map();
  for (const track of next) extras.set(track.videoId, track);
  const out = [];
  const seen = new Set();
  const push = (track) => {
    const key = track.setVideoId || track.videoId;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(track);
  };
  for (const track of host) {
    const extra = extras.get(track.videoId);
    push(
      extra
        ? {
            ...extra,
            ...track,
            artwork: track.artwork || extra.artwork,
            duration: track.duration || extra.duration,
            album: track.album || extra.album,
            artist: track.artist || extra.artist,
          }
        : track
    );
  }
  for (const track of next) push(track);
  return out;
}

function mergeParsed(parts) {
  const tracks = [];
  const collections = [];
  const chips = [];
  const shelves = [];
  const shelfIndex = new Map();
  const seen = new Set();
  let lyricsId = "";
  for (const part of parts) {
    if (!lyricsId && part.lyricsId) lyricsId = part.lyricsId;
    for (const track of part.tracks || []) {
      const key = `t:${track.videoId || track.setVideoId || track.id || track.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push(track);
    }
    for (const item of part.collections || []) {
      const key = `c:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collections.push(item);
    }
    for (const chip of part.chips || []) {
      const key = `chip:${chip.title}:${chip.browseId}:${chip.params || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(chip);
    }
    for (const shelf of part.shelves || []) {
      const name = String(shelf.title || "").trim();
      const next = {
        title: name,
        tracks: [...(shelf.tracks || [])],
        collections: [...(shelf.collections || [])],
      };
      if (name && shelfIndex.has(name)) {
        const existing = shelves[shelfIndex.get(name)];
        const known = new Set(
          existing.tracks
            .map((track) => track.videoId || track.id)
            .concat(existing.collections.map((item) => item.id))
        );
        for (const track of next.tracks) {
          const key = track.videoId || track.id;
          if (key && known.has(key)) continue;
          if (key) known.add(key);
          existing.tracks.push(track);
        }
        for (const item of next.collections) {
          if (item.id && known.has(item.id)) continue;
          if (item.id) known.add(item.id);
          existing.collections.push(item);
        }
      } else {
        if (name) shelfIndex.set(name, shelves.length);
        shelves.push(next);
      }
    }
  }
  return { tracks, collections, lyricsId, chips, shelves };
}

function resolveFollowOpts(pagesOrOpts) {
  if (typeof YTunesList !== "undefined" && YTunesList.resolveFollowOpts) {
    return YTunesList.resolveFollowOpts(pagesOrOpts);
  }
  const pages =
    pagesOrOpts && typeof pagesOrOpts === "object" ? pagesOrOpts.pages ?? 2 : pagesOrOpts;
  const n =
    pages === "all" || pages === Infinity
      ? 500
      : Number.isFinite(Number(pages)) && Number(pages) > 0
        ? Math.min(500, Math.floor(Number(pages)))
        : 2;
  return {
    pages: n,
    onProgress:
      pagesOrOpts && typeof pagesOrOpts.onProgress === "function" ? pagesOrOpts.onProgress : null,
    shouldStop:
      pagesOrOpts && typeof pagesOrOpts.shouldStop === "function" ? pagesOrOpts.shouldStop : null,
  };
}

function yieldBrowse() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function followPages(fetchPage, body, pagesOrOpts) {
  const opts = resolveFollowOpts(pagesOrOpts);
  let response = await fetchPage(body);
  const parts = [parseBrowse(response)];
  if (opts.onProgress) opts.onProgress(mergeParsed(parts));
  for (let i = 1; i < opts.pages; i += 1) {
    if (opts.shouldStop && opts.shouldStop()) break;
    const token = continuationToken(response);
    if (!token) break;
    response = await fetchPage({ continuation: token });
    parts.push(parseBrowse(response));
    if (opts.onProgress) opts.onProgress(mergeParsed(parts));
    if (opts.onProgress) await yieldBrowse();
  }
  return mergeParsed(parts);
}

function parseSuggestions(response) {
  const out = [];
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const renderer =
      node.searchSuggestionRenderer || node.historySuggestionRenderer;
    if (renderer) {
      const query =
        renderer.navigationEndpoint?.searchEndpoint?.query ||
        runsText(renderer.suggestion) ||
        "";
      if (query && !seen.has(query)) {
        seen.add(query);
        out.push(query);
      }
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  };
  walk(response);
  return out;
}

function parseLyrics(response) {
  const chunks = [];
  const lines = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const msRaw =
      node.startTimeMs ??
      node.start_time_ms ??
      node.cueRange?.startTimeMilliseconds;
    const startRaw = msRaw ?? node.cueRange?.startTimeMs ?? node.startTime;
    const lineText =
      runsText(node.lyricLine) ||
      runsText(node.text) ||
      (typeof node.line === "string" ? node.line : "");
    const start = Number(startRaw);
    if (lineText && Number.isFinite(start) && start >= 0) {
      lines.push({
        t: msRaw != null || start >= 1000 ? start / 1000 : start,
        text: lineText,
      });
    }
    if (node.musicDescriptionShelfRenderer) {
      const text = runsText(node.musicDescriptionShelfRenderer.description);
      if (text) chunks.push(text);
      return;
    }
    if (typeof node.lyrics === "string" && node.lyrics.trim()) {
      chunks.push(node.lyrics);
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  };
  walk(response);
  const unique = [];
  const seen = new Set();
  for (const line of lines.sort((a, b) => a.t - b.t)) {
    const key = `${line.t}:${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }
  const text =
    chunks.join("\n\n").trim() || unique.map((line) => line.text).join("\n");
  return { text, lines: unique };
}

const YTM = {
  browse(body) {
    return pageRequest("innertube", { endpoint: "browse", body });
  },
  search(body) {
    return pageRequest("innertube", { endpoint: "search", body });
  },
  next(body) {
    return pageRequest("innertube", { endpoint: "next", body });
  },
  play(payload) {
    return pageRequest("play", payload);
  },
  cue(payload) {
    return pageRequest("cue", payload, 4000);
  },
  player(payload) {
    return pageRequest("player", payload, 4000);
  },
  browseParsed(body, pagesOrOpts = 2) {
    return followPages(YTM.browse, body, pagesOrOpts);
  },
  async searchParsed(query) {
    const mixed = followPages(YTM.search, { query }, 1);
    const songs = followPages(
      YTM.search,
      { query, params: SONGS_SEARCH_PARAMS },
      2
    ).catch(() => ({ tracks: [], collections: [] }));
    const [mixedParsed, songsParsed] = await Promise.all([mixed, songs]);
    return mergeParsed([songsParsed, mixedParsed]);
  },
  async suggest(query) {
    if (!query) return [];
    try {
      const response = await pageRequest("innertube", {
        endpoint: "music/get_search_suggestions",
        body: { input: query },
      });
      return parseSuggestions(response);
    } catch {
      return [];
    }
  },
  playerQueue() {
    return pageRequest("playerQueue", {}, 4000).catch(() => ({
      tracks: [],
      playlistId: "",
    }));
  },
  async queue(videoId, playlistId) {
    if (!videoId && !playlistId) return { tracks: [], lyricsId: "", playlistId: "" };
    let host = { tracks: [], playlistId: "" };
    try {
      host = await YTM.playerQueue();
    } catch {
      host = { tracks: [], playlistId: "" };
    }
    const hostMatches =
      typeof YTunesPlayback !== "undefined" && YTunesPlayback.hostQueueMatches
        ? YTunesPlayback.hostQueueMatches(host, videoId, playlistId)
        : true;
    const resolvedPlaylist = (hostMatches && host.playlistId) || playlistId || "";
    const nextBody = {
      videoId: videoId || undefined,
      playlistId: resolvedPlaylist || undefined,
      enablePersistentPlaylistPanel: true,
      isAudioOnly: true,
    };
    let response = {};
    try {
      response = await YTM.next(nextBody);
    } catch {
      response = {};
    }
    let parsed = parseQueuePanel(response);
    const hostPlayable = playableQueueTracks(host.tracks);
    const radioList = String(resolvedPlaylist || "").replace(/^VL/, "").startsWith("RD");
    const parsedCount = playableQueueTracks(parsed.tracks).length;
    const thin = parsedCount < 8 && (!hostMatches || hostPlayable.length < 8);
    if (thin && (radioList || !isConcretePlaylist(resolvedPlaylist))) {
      const followId =
        automixPlaylistId(response) ||
        (radioList ? resolvedPlaylist : "") ||
        (!resolvedPlaylist && videoId ? `RDAMVM${videoId}` : "");
      if (followId) {
        try {
          const more = await YTM.next({
            videoId: videoId || undefined,
            playlistId: followId,
            enablePersistentPlaylistPanel: true,
            isAudioOnly: true,
          });
          parsed = mergeParsed([parsed, parseQueuePanel(more)]);
        } catch {
          /* keep the first panel */
        }
      }
    }
    const tracks =
      typeof YTunesPlayback !== "undefined" && YTunesPlayback.resolveQueueTracks
        ? YTunesPlayback.resolveQueueTracks(host, parsed.tracks, videoId, resolvedPlaylist)
        : hostMatches
          ? mergeQueueTracks(host.tracks || [], parsed.tracks || [])
          : playableQueueTracks(parsed.tracks).length
            ? playableQueueTracks(parsed.tracks)
            : mergeQueueTracks(host.tracks || [], parsed.tracks || []);
    return {
      tracks,
      lyricsId: parsed.lyricsId || "",
      playlistId: resolvedPlaylist || parsed.tracks?.[0]?.playlistId || "",
    };
  },
  async queueCached(videoId, playlistId) {
    const key = `${videoId || ""}|${playlistId || ""}`;
    const ttl = (queueMemo.data?.tracks || []).length > 1 ? 4000 : 500;
    if (
      queueMemo.key === key &&
      queueMemo.data &&
      Date.now() - queueMemo.at < ttl
    ) {
      return queueMemo.data;
    }
    if (queueMemo.inflight && queueMemo.key === key) return queueMemo.inflight;
    const gen = (queueMemo.gen += 1);
    const requestKey = key;
    queueMemo.key = key;
    queueMemo.inflight = YTM.queue(videoId, playlistId)
      .then((data) => {
        if (gen === queueMemo.gen && queueMemo.key === requestKey) {
          queueMemo.data = data;
          queueMemo.at = Date.now();
          queueMemo.inflight = null;
        }
        return data;
      })
      .catch((error) => {
        if (gen === queueMemo.gen && queueMemo.key === requestKey) {
          queueMemo.inflight = null;
        }
        throw error;
      });
    return queueMemo.inflight;
  },
  invalidateQueue() {
    queueMemo.gen += 1;
    queueMemo.key = "";
    queueMemo.data = null;
    queueMemo.at = 0;
    queueMemo.inflight = null;
  },
  async lyrics(browseId) {
    const parsed = await YTM.lyricsParsed(browseId);
    return parsed.text;
  },
  async lyricsParsed(browseId) {
    if (!browseId) return { text: "", lines: [] };
    const response = await YTM.browse({ browseId });
    return parseLyrics(response);
  },
  signedIn() {
    return pageRequest("signedIn", {}, 4000)
      .then((result) => Boolean(result?.signedIn))
      .catch(() => false);
  },
  enqueue(videoId, position) {
    // Spike verdict: enqueue works through the live host
    // (ytmusic-app.handleCommand + queueAddEndpoint). There is no
    // InnerTube REST insert. Context menu Play Next / Add to Queue
    // uses this path; absence would be clearer than a disabled tease.
    if (!videoId) return Promise.reject(new Error("No video"));
    return pageRequest("queueAdd", { videoId, position: position || "end" });
  },
  renamePlaylist(playlistId, title) {
    // Spike API only — no rename UI until this endpoint is proven.
    return pageRequest("innertube", {
      endpoint: "browse/edit_playlist",
      body: {
        playlistId,
        actions: [{ action: "ACTION_SET_PLAYLIST_NAME", playlistName: title }],
      },
    });
  },
  removeFromPlaylist(playlistId, setVideoId, videoId) {
    const actions = setVideoId
      ? [{ action: "ACTION_REMOVE_VIDEO", setVideoId }]
      : [{ action: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId: videoId }];
    return pageRequest("innertube", {
      endpoint: "browse/edit_playlist",
      body: { playlistId, actions },
    });
  },
  like(videoId, rating) {
    const endpoint =
      rating === "like"
        ? "like/like"
        : rating === "dislike"
          ? "like/dislike"
          : "like/removelike";
    return pageRequest("innertube", {
      endpoint,
      body: {
        target: { videoId },
      },
    });
  },
  createPlaylist(title) {
    return pageRequest("innertube", {
      endpoint: "playlist/create",
      body: { title, privacyStatus: "PRIVATE" },
    });
  },
  addToPlaylist(playlistId, videoId) {
    return pageRequest("innertube", {
      endpoint: "browse/edit_playlist",
      body: {
        playlistId,
        actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: videoId }],
      },
    });
  },
};

/**
 * Catalog half of the MusicHost contract: everything the iTunes chrome needs to
 * read, expressed in iTunes source types instead of InnerTube browse ids.
 *
 * Wrapped so the browse-id table and YouTube Music's content heuristics stay
 * private to this adapter. scripts/hosts/ytm/player.js assembles the final
 * MusicHost object from this and the player half.
 */
const YtmCatalog = (() => {
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
    playlists: "FEmusic_liked_playlists",
  };

  // Pages to follow when the caller does not ask for a specific budget.
  // Storefronts are shallow on purpose; libraries page until exhausted.
  const DEFAULT_PAGES = {
    explore: 2,
    charts: 2,
    podcasts: 3,
    mood: 3,
    collection: "all",
    videos: "all",
    playlists: 2,
    moods: 1,
  };

  const MEMO_MS = 120000;
  const memo = new Map();

  const MOOD_NAMES = [
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

  async function memoized(key, load) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
    const value = await load();
    memo.set(key, { at: Date.now(), value });
    return value;
  }

  function emptyParsed() {
    return { tracks: [], collections: [], shelves: [], chips: [], lyricsId: "" };
  }

  function uniqueTracks(tracks) {
    const seen = new Set();
    const out = [];
    for (const track of tracks || []) {
      const key =
        track.videoId ||
        (track.title
          ? `n:${track.title}:${track.artist || ""}:${track.duration || ""}`
          : track.id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(track);
    }
    return out;
  }

  /** Playlist and album ids need a `VL` prefix to be browsable. */
  function vlBrowseId(id) {
    const value = String(id || "");
    if (!value) return "";
    return value.startsWith("VL") ? value : `VL${value}`;
  }

  function browsableId(id) {
    const value = String(id || "");
    if (!value || value.startsWith("VL")) return value;
    return /^(PL|RD|OLAK|LM)/.test(value) ? `VL${value}` : value;
  }

  function pagesFor(type) {
    if (type in DEFAULT_PAGES) return DEFAULT_PAGES[type];
    return YTunesList.libraryBrowsePages(type);
  }

  /** Caller opts win; the host only fills in a page budget it knows better. */
  function followOpts(type, opts = {}) {
    return {
      pages: opts.pages ?? pagesFor(type),
      onProgress: opts.onProgress || null,
      shouldStop: opts.shouldStop || null,
    };
  }

  function stopped(opts) {
    return Boolean(opts.shouldStop && opts.shouldStop());
  }

  function browseBody(source, type) {
    const params = source.params ? { params: source.params } : {};
    const explicit = browsableId(source.browseId);
    if (explicit) return { browseId: explicit, ...params };
    if (source.playlistId && (type === "playlist" || type === "album" || type === "liked")) {
      return { browseId: vlBrowseId(source.playlistId), ...params };
    }
    const mapped = BROWSE_IDS[type];
    return mapped ? { browseId: mapped, ...params } : null;
  }

  /**
   * The playable list id backing a source, so the shell can queue and write to it
   * without knowing that Liked Songs is `LM` here.
   */
  function listIdFor(source) {
    if (!source) return "";
    if (source.playlistId) return YTunesYtmIds.listId(source.playlistId);
    if (source.type === "liked") return YTunesYtmIds.listId(BROWSE_IDS.liked);
    return "";
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

  /** An endless station rather than a fixed list. `RDAMVM` is a song radio, not a mix. */
  function isMixCollection(item) {
    if (isLibraryShelf(item) || isPodcastish(item)) return false;
    const list = YTunesYtmIds.listId(item?.playlistId || item?.browseId);
    if (list.startsWith("RD") && !list.startsWith("RDAMVM")) return true;
    const hay = `${item?.title || ""} ${item?.subtitle || ""} ${item?.shelf || ""}`.toLowerCase();
    return /\b(mix|supermix|radio|station)\b/.test(hay);
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

  /** Prefer the classic named moods; fall back to whatever the page offers. */
  function pickMoodChips(chips) {
    const moodish = uniqueChips(chips).filter(isMoodChip);
    const named = moodish.filter((chip) =>
      MOOD_NAMES.some(
        (name) =>
          name.toLowerCase() === chip.title.toLowerCase() ||
          (name === "Energise" && /^energize$/i.test(chip.title))
      )
    );
    const pool = named.length ? named : moodish;
    return pool.filter((chip) => chip.browseId || chip.params);
  }

  function isSongShelfCollection(item) {
    const title = String(item?.title || "").toLowerCase();
    return /^(songs|tracks|top songs|popular|singles)$/i.test(title) || /\bsongs\b/.test(title);
  }

  /**
   * Artist and some album pages list sub-collections instead of songs. Follow a few
   * of them so a Cover Flow preview has rows to show.
   */
  async function drillForTracks(parsed, query, opts) {
    let tracks = uniqueTracks(parsed.tracks);
    if (tracks.length) return tracks;
    const nested = (parsed.collections || []).filter((item) => {
      if (!collectionBody(item)) return false;
      if (query.selfBrowseId && item.browseId === query.selfBrowseId) return false;
      if (query.selfId && item.id === query.selfId) return false;
      return true;
    });
    const preferred = nested.filter(isSongShelfCollection);
    const rest = nested.filter((item) => !isSongShelfCollection(item) && item.kind !== "artist");
    for (const item of [...preferred, ...rest].slice(0, 3)) {
      if (stopped(opts)) return tracks;
      try {
        const next = await YTM.browseParsed(collectionBody(item), 2);
        tracks = uniqueTracks(tracks.concat(next.tracks || []));
        if (tracks.length >= 250) break;
      } catch {
        /* skip a nested album that fails */
      }
    }
    return tracks;
  }

  /**
   * One song versus a collection of songs. The parser labels most covers, but
   * storefront shelves often omit `kind`, so fall back to the browse-id family:
   * `MPRE` album, `UC` artist, `MPLA` playlist, `VL` list.
   */
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
    if (browseId.startsWith("VL")) return false;
    if (!cover.kind && cover.tracks?.length && !browseId && !cover.playlistId) return true;
    if (videoId && (cover.tracks?.length || 1) <= 1) return true;
    return false;
  }

  /** Synthesize a playable track from a song cover that carries no track rows. */
  function trackFromCover(cover) {
    const videoId = cover?.videoId || cover?.endpoint?.watchEndpoint?.videoId || "";
    return {
      id: videoId || cover?.id,
      title: cover?.title,
      artist: cover?.artist || "",
      album: cover?.album || "",
      artwork: cover?.artwork,
      videoId,
      playlistId: collectionPlaylistId(cover),
      browseId: cover?.browseId,
      endpoint: cover?.endpoint,
      shelf: cover?.shelf,
    };
  }

  /** The album this track belongs to, as a cover the shell can open. */
  function albumOf(track) {
    if (!track) return null;
    const id = String(track.albumBrowseId || "");
    const browseId = String(track.browseId || "");
    const target =
      id || (browseId.startsWith("MPRE") || !browseId.startsWith("UC") ? browseId : "");
    if (!target) return null;
    return { id: target, browseId: target, playlistId: track.playlistId, kind: "album" };
  }

  /** The artist behind this track, as a cover the shell can open. */
  function artistOf(track) {
    if (!track) return null;
    const target =
      String(track.artistBrowseId || "") ||
      (String(track.browseId || "").startsWith("UC") ? track.browseId : "");
    if (!target) return null;
    return { id: target, browseId: target, kind: "artist" };
  }

  function collectionPlaylistId(cover) {
    return (
      cover?.playlistId ||
      cover?.endpoint?.watchEndpoint?.playlistId ||
      cover?.endpoint?.watchPlaylistEndpoint?.playlistId ||
      ""
    );
  }

  function collectionBody(cover) {
    if (!cover) return null;
    const browseId = browsableId(cover.browseId);
    if (browseId) return { browseId };
    const playlistId = collectionPlaylistId(cover);
    return playlistId ? { browseId: vlBrowseId(playlistId) } : null;
  }

  /**
   * An opaque handle for "the songs behind this cover". The shell passes it straight
   * back to browse(); it must not read the fields.
   */
  function collectionQuery(cover) {
    const body = collectionBody(cover);
    if (!body) return null;
    return {
      type: "collection",
      body,
      playlistId: collectionPlaylistId(cover),
      selfBrowseId: cover.browseId || "",
      selfId: cover.id || "",
    };
  }

  async function browseCollection(query, opts) {
    const follow = followOpts("collection", opts);
    let parsed = await YTM.browseParsed(query.body, follow);
    if (!opts.tracksOnly || stopped(follow)) return parsed;

    let tracks = await drillForTracks(parsed, query, follow);
    const alt = vlBrowseId(query.playlistId);
    if (!tracks.length && alt && alt !== query.body.browseId && !stopped(follow)) {
      parsed = await YTM.browseParsed({ browseId: alt }, follow);
      tracks = await drillForTracks(parsed, query, follow);
    }
    return { ...parsed, tracks, playlistId: query.playlistId };
  }

  function home() {
    return memoized("home", () => YTM.browseParsed({ browseId: BROWSE_IDS.home }, 4));
  }

  async function browseVideos(opts) {
    const library = await YTM.browseParsed(
      { browseId: BROWSE_IDS.songs },
      followOpts("videos", opts)
    );
    return {
      ...library,
      tracks: (library.tracks || []).filter(isVideoish),
      collections: (library.collections || []).filter(isVideoish),
    };
  }

  /** Stations, plus any radio playlists the user saved. */
  async function browseMixes() {
    const page = await home();
    const seen = new Set();
    const collections = [];
    const add = (item) => {
      const key = item.id || item.playlistId || item.browseId || item.title;
      if (!key || seen.has(key)) return;
      seen.add(key);
      collections.push(item);
    };
    (page.collections || []).filter(isMixCollection).forEach(add);
    for (const item of await playlists()) {
      const list = YTunesYtmIds.listId(item.playlistId);
      if (!list.startsWith("RD")) continue;
      add({
        id: list,
        title: item.title,
        playlistId: list,
        browseId: vlBrowseId(list),
        kind: "playlist",
      });
    }
    return { ...emptyParsed(), collections, lyricsId: page.lyricsId };
  }

  /**
   * The podcasts browse id is not enabled on every account, so fall back to the
   * Home podcasts chip and finally to filtering Home itself.
   */
  async function browsePodcasts(source, opts) {
    const body = browseBody(source, "podcasts");
    let parsed = emptyParsed();
    try {
      parsed = await YTM.browseParsed(body, followOpts("podcasts", opts));
    } catch {
      parsed = emptyParsed();
    }
    if (parsed.collections?.length || parsed.tracks?.length) return parsed;

    const page = await home();
    const chip = (page.chips || []).find((item) => /^podcasts?$/i.test(item.title));
    if (chip?.browseId) {
      try {
        return await YTM.browseParsed(
          { browseId: chip.browseId, ...(chip.params ? { params: chip.params } : {}) },
          followOpts("podcasts", opts)
        );
      } catch {
        /* fall through to filtering Home */
      }
    }
    return {
      ...emptyParsed(),
      collections: (page.collections || []).filter(isPodcastish),
      tracks: (page.tracks || []).filter(isPodcastish),
      lyricsId: page.lyricsId,
      chips: page.chips,
    };
  }

  async function browseMood(source, opts) {
    if (source.browseId) {
      return YTM.browseParsed(browseBody(source, "mood"), followOpts("mood", opts));
    }
    if (source.title) return YTM.searchParsed(source.title);
    return YTM.browseParsed({ browseId: BROWSE_IDS.moods }, followOpts("mood", opts));
  }

  /**
   * Read a source the iTunes chrome asked for.
   *
   * @param {{type: string, browseId?: string, playlistId?: string, params?: string,
   *   title?: string, query?: string}} source iTunes source, or a collectionQuery handle.
   * @param {{pages?: number|"all", onProgress?: Function, shouldStop?: Function,
   *   tracksOnly?: boolean}} [opts] `onProgress` is what keeps the library painting
   *   as pages arrive; `tracksOnly` follows nested collections to find songs.
   * @returns {Promise<{tracks, collections, shelves, chips, lyricsId}|null>} null when
   *   this host cannot serve the source at all.
   */
  async function browse(source, opts = {}) {
    const type = source?.type || "songs";
    if (type === "collection") return browseCollection(source, opts);
    if (type === "search") return search(source.query || source.title || "");
    if (type === "videos") return browseVideos(opts);
    if (type === "mixes") return browseMixes();
    if (type === "podcasts") return browsePodcasts(source, opts);
    if (type === "mood") return browseMood(source, opts);

    const body = browseBody(source, type);
    if (!body) return null;
    const parsed = await YTM.browseParsed(body, followOpts(type, opts));
    if (type === "home") memo.set("home", { at: Date.now(), value: parsed });
    return parsed;
  }

  function search(query) {
    return query ? YTM.searchParsed(query) : Promise.resolve(emptyParsed());
  }

  function suggest(query) {
    return YTM.suggest(query);
  }

  /** Saved and created playlists for the sidebar. */
  function playlists() {
    return memoized("playlists", async () => {
      const parsed = await YTM.browseParsed(
        { browseId: BROWSE_IDS.playlists },
        followOpts("playlists")
      );
      return (parsed.collections || [])
        .filter((item) => item.playlistId || String(item.browseId || "").startsWith("VL"))
        .map((item) => ({
          title: item.title,
          playlistId: YTunesYtmIds.listId(item.playlistId || item.browseId),
        }));
    });
  }

  /** Mood and genre stations for the sidebar. */
  async function moods() {
    let chips = [];
    try {
      chips = pickMoodChips((await home()).chips);
    } catch {
      chips = [];
    }
    if (chips.length) return chips;
    try {
      const page = await YTM.browseParsed(
        { browseId: BROWSE_IDS.moods },
        followOpts("moods")
      );
      return pickMoodChips(page.chips);
    } catch {
      return [];
    }
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
    signedIn: () => YTM.signedIn(),
    lyrics: (id) => YTM.lyricsParsed(id),
  };
})();
