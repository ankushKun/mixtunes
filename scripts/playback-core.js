/**
 * Host-agnostic playback logic: roster math, queue merging, and the iTunes
 * play-context decision. Nothing here may assume a particular host's id format.
 *
 * Identifier rules come from an injected strategy — see scripts/hosts/ytm/ids.js.
 * Each world configures it once at boot (MAIN: page.js, isolated: the adapter).
 * Left unconfigured, ids are treated as opaque strings with no radio support.
 */
(function (root, factory) {
  const api = factory();
  root.YTunesPlayback = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /** @typedef {{ playable(id: string): boolean, listId(raw: string): string,
   *   radioListId(raw: string): string, isConcreteList(raw: string): boolean,
   *   radioFor(id: string): string, rowKey(track: object): string,
   *   idleTitle(title: string): boolean }} HostIds */

  /** @type {HostIds} */
  const OPAQUE_IDS = {
    playable: (id) => Boolean(String(id ?? "").trim()),
    listId: (raw) => String(raw ?? "").trim(),
    radioListId: () => "",
    isConcreteList: (raw) => Boolean(String(raw ?? "").trim()),
    radioFor: () => "",
    rowKey: (track) => trackId(track),
    idleTitle: () => false,
  };

  let ids = OPAQUE_IDS;

  /** @param {Partial<HostIds>} hostIds */
  function configure(hostIds) {
    ids = { ...OPAQUE_IDS, ...(hostIds || {}) };
    return ids;
  }

  /** Canonical track identity. Hosts may keep a native alias, `id` wins. */
  function trackId(track) {
    if (!track) return "";
    return String(track.id || track.videoId || "").trim();
  }

  function playable(id) {
    return ids.playable(id);
  }

  function listId(raw) {
    return ids.listId(raw);
  }

  function radioListId(raw) {
    return ids.radioListId(raw);
  }

  function isConcreteList(raw) {
    return ids.isConcreteList(raw);
  }

  function radioFor(id) {
    return ids.radioFor(id);
  }

  function playableTracks(tracks) {
    return (tracks || []).filter((track) => playable(trackId(track)));
  }

  function adjacentInRoster(roster, currentId, kind, wrap, hintIndex) {
    const list = roster || [];
    if (!list.length) return { id: "", index: -1 };
    const hinted = hintIndex >= 0 && hintIndex < list.length ? hintIndex : -1;
    const index = hinted >= 0 ? hinted : currentId ? list.indexOf(currentId) : -1;
    if (kind === "next") {
      if (index < 0) return { id: list[0], index: 0 };
      if (index + 1 < list.length) return { id: list[index + 1], index: index + 1 };
      if (wrap) return { id: list[0], index: 0 };
      return { id: "", index: -1 };
    }
    if (index < 0) return { id: list[list.length - 1], index: list.length - 1 };
    if (index > 0) return { id: list[index - 1], index: index - 1 };
    if (wrap) return { id: list[list.length - 1], index: list.length - 1 };
    return { id: "", index: -1 };
  }

  function hostQueueMatches(host, currentId, playlistId) {
    const hostList = listId(host?.playlistId);
    const wantList = listId(playlistId);
    const tracks = playableTracks(host?.tracks);
    if (wantList && hostList && hostList !== wantList) return false;
    if (wantList && !hostList) return false;
    if (currentId && tracks.length && !tracks.some((track) => trackId(track) === currentId)) {
      return false;
    }
    return Boolean(tracks.length || hostList);
  }

  function mergeQueueTracks(hostTracks, nextTracks) {
    const host = playableTracks(hostTracks);
    const next = playableTracks(nextTracks);
    const extras = new Map();
    for (const track of next) extras.set(trackId(track), track);
    const out = [];
    const seen = new Set();
    const push = (track) => {
      const key = ids.rowKey(track);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(track);
    };
    for (const track of host) {
      const extra = extras.get(trackId(track));
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

  function resolveQueueTracks(host, nextTracks, currentId, playlistId) {
    const parsed = playableTracks(nextTracks);
    if (!hostQueueMatches(host, currentId, playlistId)) {
      return parsed;
    }
    return mergeQueueTracks(host?.tracks, parsed);
  }

  function skipIndexAfterPending(roster, playingId, pendingId, pendingUntil, now) {
    const list = roster || [];
    const pendingAt =
      pendingId && now < pendingUntil && list.includes(pendingId) ? list.indexOf(pendingId) : -1;
    const playAt = playingId && list.includes(playingId) ? list.indexOf(playingId) : -1;
    if (pendingAt >= 0 && playAt >= 0) return playAt >= pendingAt ? playAt : pendingAt;
    if (pendingAt >= 0) return pendingAt;
    return playAt;
  }

  function shouldHandleAutoAdvance(ownList) {
    return Boolean(ownList);
  }

  /**
   * Decide how the host should start a track: an endless radio, the host's own
   * queue for a concrete list, or an overlay-driven roster we advance ourselves.
   *
   * Called by the host adapter, not by the shell — the returned `listId` is a
   * host id, and building it needs host rules.
   */
  function resolvePlayContext(state, track, extras) {
    const opts = extras || {};
    const currentId = trackId(track) || track?.endpoint?.watchEndpoint?.videoId || "";
    const session = state?.session || {};
    const source = String(state?.source || "");
    const cover = opts.cover || null;
    const mixed = Boolean(opts.mixedStorefront);
    const sessionTracks = opts.sessionTracks || (track ? [track] : []);
    const watchList = listId(track?.endpoint?.watchEndpoint?.playlistId);
    const trackList = listId(track?.playlistId);
    const stateList = listId(state?.playlistId);
    const coverList = listId(
      cover?.playlistId || cover?.endpoint?.watchEndpoint?.playlistId
    );
    const sessionList = listId(session.listId);

    if (track?.suggested && currentId) {
      return {
        mode: "radio",
        listId: radioFor(currentId) || radioListId(watchList),
        tracks: [track],
        ownList: false,
      };
    }

    if (session.source === "radio" && source === "now") {
      return {
        mode: "radio",
        listId: sessionList || radioFor(currentId),
        tracks: session.tracks?.length ? session.tracks : [track],
        ownList: false,
      };
    }

    if (source === "now") {
      if (radioListId(sessionList) || radioListId(stateList) || radioListId(trackList)) {
        return {
          mode: "radio",
          listId: radioListId(sessionList) || radioListId(stateList) || radioListId(trackList),
          tracks: session.tracks?.length ? session.tracks : sessionTracks,
          ownList: false,
        };
      }
      if (session.source === "queue" || isConcreteList(sessionList) || isConcreteList(stateList)) {
        return {
          mode: "queue",
          listId: (isConcreteList(sessionList) && sessionList) || (isConcreteList(stateList) && stateList) || "",
          tracks: session.tracks?.length ? session.tracks : sessionTracks,
          ownList: false,
        };
      }
      if (session.source === "list" || sessionTracks.length > 1) {
        return {
          mode: "list",
          listId: isConcreteList(sessionList) ? sessionList : "",
          tracks: session.tracks?.length ? session.tracks : sessionTracks,
          ownList: true,
        };
      }
    }

    if (cover && (cover.tracks?.length || 0) > 1 && (isConcreteList(coverList) || radioListId(coverList))) {
      return {
        mode: radioListId(coverList) ? "radio" : "queue",
        listId: coverList,
        tracks: cover.tracks,
        ownList: false,
      };
    }

    if (source === "playlist" || source === "liked" || source === "album") {
      const list =
        radioListId(stateList) ||
        radioListId(trackList) ||
        radioListId(watchList) ||
        (isConcreteList(stateList) ? stateList : "") ||
        (isConcreteList(trackList) ? trackList : "") ||
        (isConcreteList(watchList) ? watchList : "");
      if (radioListId(list)) {
        return {
          mode: "radio",
          listId: radioListId(list),
          tracks: sessionTracks,
          ownList: false,
        };
      }
      if (isConcreteList(list)) {
        return {
          mode: "queue",
          listId: list,
          tracks: sessionTracks.length > 1 ? sessionTracks : track ? [track] : [],
          ownList: false,
        };
      }
    }

    const nativeRadio = radioListId(watchList) || radioListId(trackList) || radioListId(stateList);
    if (nativeRadio) {
      return {
        mode: "radio",
        listId: nativeRadio,
        tracks: sessionTracks,
        ownList: false,
      };
    }

    if (mixed || source === "search") {
      return {
        mode: "radio",
        listId: radioFor(currentId),
        tracks: track ? [track] : [],
        ownList: false,
      };
    }

    if (sessionTracks.length > 1) {
      return {
        mode: "list",
        listId: isConcreteList(stateList) ? stateList : "",
        tracks: sessionTracks,
        ownList: true,
      };
    }

    if (currentId) {
      return {
        mode: "radio",
        listId: radioFor(currentId),
        tracks: [track],
        ownList: false,
      };
    }

    return {
      mode: "list",
      listId: "",
      tracks: track ? [track] : [],
      ownList: true,
    };
  }

  function overlayHooksActive({ pref, dataset, hasRoot, hasLaunch } = {}) {
    if (pref === "0" || pref === "off" || pref === false) return false;
    if (dataset === "off" || dataset === "0") return false;
    if (hasLaunch && !hasRoot) return false;
    return true;
  }

  function shouldParkRestoreAutoplay({
    hooksActive = false,
    hasGesture = false,
    parked = false,
  } = {}) {
    if (hooksActive) return false;
    if (parked) return false;
    if (hasGesture) return false;
    return true;
  }

  /** True when the host's own chrome is showing a real track, not its idle state. */
  function nativeBarHasSong(info) {
    if (!info || typeof info !== "object") return false;
    if (playable(trackId(info))) return true;
    const title = String(info.title || "").trim();
    if (!title) return false;
    if (title === "yTunes") return false;
    if (ids.idleTitle(title)) return false;
    return true;
  }

  function shouldCueStoredTrack({
    overlayOn = false,
    barHasSong = false,
    storedTrackId = "",
  } = {}) {
    if (overlayOn) return false;
    if (barHasSong) return false;
    return playable(storedTrackId);
  }

  return {
    configure,
    trackId,
    playable,
    listId,
    radioListId,
    isConcreteList,
    radioFor,
    playableTracks,
    adjacentInRoster,
    hostQueueMatches,
    mergeQueueTracks,
    resolveQueueTracks,
    skipIndexAfterPending,
    shouldHandleAutoAdvance,
    resolvePlayContext,
    overlayHooksActive,
    shouldParkRestoreAutoplay,
    nativeBarHasSong,
    shouldCueStoredTrack,
  };
});
