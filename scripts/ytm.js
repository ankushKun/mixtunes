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

function pickVideoId(node) {
  return (
    node?.playlistItemData?.videoId ||
    node?.navigationEndpoint?.watchEndpoint?.videoId ||
    watchEndpoint(node)?.watchEndpoint?.videoId ||
    ""
  );
}

function collectionKind(browseId, playlistId, subtitle) {
  if (browseId.startsWith("MPRE") || /album/i.test(subtitle)) return "album";
  if (browseId.startsWith("MPLA") || browseId.startsWith("UC")) return "artist";
  if (playlistId || browseId.startsWith("VL")) return "playlist";
  return "album";
}

function parseTwoRow(item, acc) {
  const title = runsText(item.title);
  if (!title) return;
  const subtitle = runsText(item.subtitle);
  const browseId = pickBrowseId(item);
  const playlistId = pickPlaylistId(item);
  const endpoint = watchEndpoint(item) || item.navigationEndpoint;
  if (!browseId && !playlistId && !endpoint?.watchEndpoint) return;
  if (/^new playlist$/i.test(title)) return;
  const bits = subtitle.split("•").map((part) => part.trim()).filter(Boolean);
  acc.collections.push({
    id: browseId || playlistId || title,
    kind: collectionKind(browseId, playlistId, subtitle),
    title,
    subtitle,
    artist: bits[0] || "",
    year: bits.find((bit) => /^\d{4}$/.test(bit)) || "",
    artwork: thumbnailUrl(item),
    browseId,
    playlistId,
    endpoint,
  });
}

function parseListItem(item, acc) {
  const flex = item.flexColumns || [];
  const columns = flex.map((column) => {
    const text = column.musicResponsiveListItemFlexColumnRenderer?.text;
    return { text: runsText(text), runs: text?.runs || [] };
  });
  const title = columns[0]?.text || runsText(item.title);
  if (!title) return;

  let duration = "";
  for (const column of columns) {
    if (/^\d+:\d+(?::\d+)?$/.test(column.text)) duration = column.text;
  }
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

  if (videoId || endpoint?.watchEndpoint) {
    acc.tracks.push({
      title,
      artist: bits[0] || "",
      album: bits[1] || "",
      duration,
      artwork: thumbnailUrl(item),
      videoId,
      playlistId,
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
      title,
      artist:
        bits.find(
          (bit) =>
            !/^(song|video|album|single|ep)$/i.test(bit) &&
            !/^\d{4}$/.test(bit) &&
            !/^\d+:\d+(?::\d+)?$/.test(bit)
        ) ||
        bits[1] ||
        "",
      album: bits[2] && !/^\d{4}$/.test(bits[2]) ? bits[2] : "",
      duration: bits.find((bit) => /^\d+:\d+(?::\d+)?$/.test(bit)) || "",
      artwork: thumbnailUrl(item),
      videoId,
      playlistId,
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

function parseBrowse(response) {
  const acc = { tracks: [], collections: [] };
  const seen = new Set();

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.musicCardShelfRenderer) {
      const tracksAt = acc.tracks.length;
      const collectionsAt = acc.collections.length;
      parseCardShelf(node.musicCardShelfRenderer, acc);
      for (let i = acc.tracks.length - 1; i >= tracksAt; i -= 1) {
        const key = `t:${acc.tracks[i].videoId || acc.tracks[i].title}`;
        if (seen.has(key)) acc.tracks.splice(i, 1);
        else seen.add(key);
      }
      for (let i = acc.collections.length - 1; i >= collectionsAt; i -= 1) {
        const key = `c:${acc.collections[i].id}`;
        if (seen.has(key)) acc.collections.splice(i, 1);
        else seen.add(key);
      }
      walk(node.musicCardShelfRenderer.contents);
      return;
    }
    if (node.musicTwoRowItemRenderer) {
      const start = acc.collections.length;
      parseTwoRow(node.musicTwoRowItemRenderer, acc);
      for (let i = acc.collections.length - 1; i >= start; i -= 1) {
        const key = `c:${acc.collections[i].id}`;
        if (seen.has(key)) acc.collections.splice(i, 1);
        else seen.add(key);
      }
      return;
    }
    if (node.musicResponsiveListItemRenderer) {
      const tracksAt = acc.tracks.length;
      const collectionsAt = acc.collections.length;
      parseListItem(node.musicResponsiveListItemRenderer, acc);
      for (let i = acc.tracks.length - 1; i >= tracksAt; i -= 1) {
        const key = `t:${acc.tracks[i].videoId || acc.tracks[i].title}`;
        if (seen.has(key)) acc.tracks.splice(i, 1);
        else seen.add(key);
      }
      for (let i = acc.collections.length - 1; i >= collectionsAt; i -= 1) {
        const key = `c:${acc.collections[i].id}`;
        if (seen.has(key)) acc.collections.splice(i, 1);
        else seen.add(key);
      }
      return;
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
  const walk = (node) => {
    if (!node || typeof node !== "object" || found.length) return;
    if (node.nextContinuationData?.continuation) {
      found.push(node.nextContinuationData.continuation);
      return;
    }
    if (node.continuationCommand?.token) {
      found.push(node.continuationCommand.token);
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
  return found[0] || "";
}

const SONGS_SEARCH_PARAMS = "EgWKAQIIAWoMEA4QChADEAQQCRAF";

function mergeParsed(parts) {
  const tracks = [];
  const collections = [];
  const seen = new Set();
  for (const part of parts) {
    for (const track of part.tracks) {
      const key = `t:${track.videoId || track.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push(track);
    }
    for (const item of part.collections) {
      const key = `c:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collections.push(item);
    }
  }
  return { tracks, collections };
}

async function followPages(fetchPage, body, pages) {
  let response = await fetchPage(body);
  const parsed = parseBrowse(response);
  for (let i = 1; i < pages; i += 1) {
    const token = continuationToken(response);
    if (!token) break;
    response = await fetchPage({ continuation: token });
    const extra = parseBrowse(response);
    parsed.tracks.push(...extra.tracks);
    parsed.collections.push(...extra.collections);
  }
  return parsed;
}

const YTM = {
  browse(body) {
    return pageRequest("innertube", { endpoint: "browse", body });
  },
  search(body) {
    return pageRequest("innertube", { endpoint: "search", body });
  },
  play(payload) {
    return pageRequest("play", payload);
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
};
