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
  return /^[\w-]{11}$/.test(String(id || ""));
}

function isConcretePlaylist(id) {
  const value = String(id || "").replace(/^VL/, "");
  return Boolean(value) && !value.startsWith("RD");
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

function walkNamedShelf(renderer, acc, walk) {
  const title = shelfTitle(renderer);
  const prev = acc.shelf;
  if (title) acc.shelf = title;
  for (const value of Object.values(renderer)) {
    if (value && typeof value === "object") walk(value);
  }
  acc.shelf = prev;
}

function parseBrowse(response) {
  const acc = { tracks: [], collections: [], lyricsId: "", suggestions: [], chips: [] };
  const seen = new Set();
  const seenNodes = new WeakSet();

  const rememberTrack = (index) => {
    const track = acc.tracks[index];
    const key = track.setVideoId
      ? `set:${track.setVideoId}`
      : `t:${track.videoId || track.id}`;
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
  const seen = new Set();
  let lyricsId = "";
  for (const part of parts) {
    if (!lyricsId && part.lyricsId) lyricsId = part.lyricsId;
    for (const track of part.tracks || []) {
      const key = track.setVideoId
        ? `set:${track.setVideoId}`
        : `t:${track.videoId || track.id || track.title}`;
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
  }
  return { tracks, collections, lyricsId, chips };
}

async function followPages(fetchPage, body, pages) {
  let response = await fetchPage(body);
  const parts = [parseBrowse(response)];
  for (let i = 1; i < pages; i += 1) {
    const token = continuationToken(response);
    if (!token) break;
    response = await fetchPage({ continuation: token });
    parts.push(parseBrowse(response));
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
  player(payload) {
    return pageRequest("player", payload, 4000);
  },
  browseParsed(body, pages = 2) {
    return followPages(YTM.browse, body, pages);
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
    const resolvedPlaylist = host.playlistId || playlistId || "";
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
    const thin =
      (parsed.tracks || []).length < 8 && hostPlayable.length < 8;
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
    return {
      tracks: mergeQueueTracks(host.tracks || [], parsed.tracks || []),
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
    const gen = queueMemo.gen;
    queueMemo.key = key;
    queueMemo.inflight = YTM.queue(videoId, playlistId)
      .then((data) => {
        if (gen === queueMemo.gen) {
          queueMemo.data = data;
          queueMemo.at = Date.now();
          queueMemo.inflight = null;
        }
        return data;
      })
      .catch((error) => {
        if (gen === queueMemo.gen) queueMemo.inflight = null;
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
