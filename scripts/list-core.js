(function (root, factory) {
  const api = factory();
  root.YTunesList = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LIST_ROW_HEIGHT = 24;
  const BROWSE_PAGE_CAP = 500;

  function browsePageCount(pages) {
    if (pages === "all" || pages === Infinity) return BROWSE_PAGE_CAP;
    const n = Number(pages);
    if (!Number.isFinite(n) || n <= 0) return 2;
    return Math.min(BROWSE_PAGE_CAP, Math.floor(n));
  }

  function libraryBrowsePages(type) {
    if (type === "home") return 4;
    if (
      type === "liked" ||
      type === "songs" ||
      type === "playlist" ||
      type === "recents" ||
      type === "album" ||
      type === "artist"
    ) {
      return "all";
    }
    return 2;
  }

  function libraryUpdatePlan({ paintedCount = 0, nextCount = 0, isFinal = false } = {}) {
    const painted = Math.max(0, Number(paintedCount) || 0);
    const next = Math.max(0, Number(nextCount) || 0);
    if (painted <= 0) return isFinal || next > 0 ? "paint" : "status";
    if (!isFinal) return "status";
    return next !== painted ? "paint" : "skip";
  }

  function resolveFollowOpts(pagesOrOpts) {
    if (pagesOrOpts && typeof pagesOrOpts === "object") {
      return {
        pages: browsePageCount(pagesOrOpts.pages ?? 2),
        onProgress: typeof pagesOrOpts.onProgress === "function" ? pagesOrOpts.onProgress : null,
        shouldStop: typeof pagesOrOpts.shouldStop === "function" ? pagesOrOpts.shouldStop : null,
      };
    }
    return {
      pages: browsePageCount(pagesOrOpts),
      onProgress: null,
      shouldStop: null,
    };
  }

  function virtualWindow({
    count,
    rowHeight = LIST_ROW_HEIGHT,
    scrollTop = 0,
    viewportHeight = 0,
    overscan = 8,
    headerHeight = 0,
  }) {
    const total = Math.max(0, Number(count) || 0);
    const h = Math.max(1, Number(rowHeight) || LIST_ROW_HEIGHT);
    const extra = Math.max(0, Number(overscan) || 0);
    const head = Math.max(0, Number(headerHeight) || 0);
    const top = Math.max(0, Number(scrollTop) || 0);
    const view = Math.max(0, Number(viewportHeight) || 0);
    if (!total) {
      return { start: 0, end: 0, padTop: 0, padBottom: 0 };
    }
    const y0 = Math.max(0, top - head);
    const y1 = Math.max(y0, top + view - head);
    const start = Math.max(0, Math.floor(y0 / h) - extra);
    const end = Math.min(total, Math.max(start, Math.ceil(y1 / h) + extra));
    return {
      start,
      end,
      padTop: start * h,
      padBottom: Math.max(0, (total - end) * h),
    };
  }

  function scrollToRowIndex({
    scrollTop = 0,
    viewportHeight = 0,
    headerHeight = 0,
    rowIndex = 0,
    rowHeight = LIST_ROW_HEIGHT,
  }) {
    const h = Math.max(1, Number(rowHeight) || LIST_ROW_HEIGHT);
    const head = Math.max(0, Number(headerHeight) || 0);
    const view = Math.max(0, Number(viewportHeight) || 0);
    const index = Math.max(0, Number(rowIndex) || 0);
    const rowTop = head + index * h;
    const rowBottom = rowTop + h;
    const viewTop = Number(scrollTop) || 0;
    const viewBottom = viewTop + view;
    if (rowTop < viewTop + head) return index * h;
    if (rowBottom > viewBottom) return Math.max(0, rowBottom - view);
    return viewTop;
  }

  function flattenListRows({
    owned = [],
    suggested = [],
    sectioned = false,
    emptyOwnedMessage = "",
  }) {
    const rows = [];
    if (emptyOwnedMessage && !owned.length) {
      rows.push({ kind: "empty", key: "empty", title: emptyOwnedMessage });
    }
    let lastShelf = "";
    owned.forEach((track, i) => {
      const shelf = String(track?.shelf || "").trim();
      if (sectioned && shelf && shelf !== lastShelf) {
        rows.push({ kind: "section", key: `s:${shelf}`, title: shelf });
        lastShelf = shelf;
      }
      rows.push({
        kind: "track",
        key: `t:${i}`,
        index: i,
        track,
        suggested: false,
      });
    });
    if (suggested.length) {
      rows.push({ kind: "section", key: "s:Suggestions", title: "Suggestions" });
      suggested.forEach((track, i) => {
        const index = owned.length + i;
        rows.push({
          kind: "track",
          key: `t:${index}`,
          index,
          track,
          suggested: true,
        });
      });
    }
    return rows;
  }

  function flattenIndexForTrack(rows, trackIndex) {
    const want = Number(trackIndex);
    for (let i = 0; i < (rows || []).length; i += 1) {
      if (rows[i].kind === "track" && rows[i].index === want) return i;
    }
    return -1;
  }

  function coverIdForTrack(track) {
    if (!track) return "";
    const album = String(track.album || "").trim();
    const artist = String(track.artist || "").trim();
    if (album) return `album:${album}:${artist}`;
    if (track.albumBrowseId) return track.albumBrowseId;
    return track.videoId || track.id || `t:${track.title}`;
  }

  function coversFromTracks(tracks) {
    const groups = new Map();
    for (const track of tracks || []) {
      const key = coverIdForTrack(track);
      if (!key) continue;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(track);
    }
    const covers = [];
    for (const [key, group] of groups) {
      const track = group[0];
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

  function trackMatchesCover(track, cover) {
    if (!track || !cover) return false;
    if (cover.tracks?.some((item) => item.videoId && item.videoId === track.videoId)) {
      return true;
    }
    if (cover.id && cover.id === coverIdForTrack(track)) return true;
    if (cover.title && track.album && track.album === cover.title) return true;
    if (cover.artwork && track.artwork && track.artwork === cover.artwork) return true;
    return false;
  }

  function spacerRowHtml(height, colspan = 8) {
    const px = Math.max(0, Math.round(Number(height) || 0));
    if (!px) return "";
    return `<tr class="ytunes-virt-pad" aria-hidden="true"><td colspan="${colspan}" style="height:${px}px;padding:0;border:0;line-height:0"></td></tr>`;
  }

  return {
    LIST_ROW_HEIGHT,
    BROWSE_PAGE_CAP,
    browsePageCount,
    libraryBrowsePages,
    libraryUpdatePlan,
    resolveFollowOpts,
    virtualWindow,
    scrollToRowIndex,
    flattenListRows,
    flattenIndexForTrack,
    coverIdForTrack,
    coversFromTracks,
    trackMatchesCover,
    spacerRowHtml,
  };
});
