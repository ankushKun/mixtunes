(function (root, factory) {
  const api = factory();
  root.YTunesPlayback = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function watchListId(id) {
    return String(id || "").replace(/^VL/, "");
  }

  function isPlayableVideoId(id) {
    return /^[\w-]{11}$/.test(String(id || ""));
  }

  function isConcretePlaylist(id) {
    const value = watchListId(id);
    return Boolean(value) && !value.startsWith("RD");
  }

  function radioListId(id) {
    const list = watchListId(id);
    return list.startsWith("RD") ? list : "";
  }

  function radioId(videoId) {
    return isPlayableVideoId(videoId) ? `RDAMVM${videoId}` : "";
  }

  function playableTracks(tracks) {
    return (tracks || []).filter((track) => isPlayableVideoId(track?.videoId));
  }

  function adjacentInRoster(ids, currentId, kind, wrap, hintIndex) {
    const list = ids || [];
    if (!list.length) return { videoId: "", index: -1 };
    const hinted = hintIndex >= 0 && hintIndex < list.length ? hintIndex : -1;
    const index = hinted >= 0 ? hinted : currentId ? list.indexOf(currentId) : -1;
    if (kind === "next") {
      if (index < 0) return { videoId: list[0], index: 0 };
      if (index + 1 < list.length) return { videoId: list[index + 1], index: index + 1 };
      if (wrap) return { videoId: list[0], index: 0 };
      return { videoId: "", index: -1 };
    }
    if (index < 0) return { videoId: list[list.length - 1], index: list.length - 1 };
    if (index > 0) return { videoId: list[index - 1], index: index - 1 };
    if (wrap) return { videoId: list[list.length - 1], index: list.length - 1 };
    return { videoId: "", index: -1 };
  }

  function hostQueueMatches(host, videoId, playlistId) {
    const hostList = watchListId(host?.playlistId);
    const wantList = watchListId(playlistId);
    const tracks = playableTracks(host?.tracks);
    if (wantList && hostList && hostList !== wantList) return false;
    if (wantList && !hostList) return false;
    if (videoId && tracks.length && !tracks.some((track) => track.videoId === videoId)) {
      return false;
    }
    if (!wantList && videoId && tracks.length && !tracks.some((track) => track.videoId === videoId)) {
      return false;
    }
    return Boolean(tracks.length || hostList);
  }

  function mergeQueueTracks(hostTracks, nextTracks) {
    const host = playableTracks(hostTracks);
    const next = playableTracks(nextTracks);
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

  function resolveQueueTracks(host, nextTracks, videoId, playlistId) {
    const parsed = playableTracks(nextTracks);
    if (!hostQueueMatches(host, videoId, playlistId)) {
      return parsed;
    }
    return mergeQueueTracks(host?.tracks, parsed);
  }

  function skipIndexAfterPending(ids, playingId, pendingId, pendingUntil, now) {
    const list = ids || [];
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

  function resolvePlayContext(state, track, extras) {
    const opts = extras || {};
    const videoId = track?.videoId || track?.endpoint?.watchEndpoint?.videoId || "";
    const session = state?.session || {};
    const source = String(state?.source || "");
    const cover = opts.cover || null;
    const mixed = Boolean(opts.mixedStorefront);
    const sessionTracks = opts.sessionTracks || (track ? [track] : []);
    const watchList = watchListId(track?.endpoint?.watchEndpoint?.playlistId);
    const trackList = watchListId(track?.playlistId);
    const stateList = watchListId(state?.playlistId);
    const coverList = watchListId(
      cover?.playlistId || cover?.endpoint?.watchEndpoint?.playlistId
    );
    const sessionList = watchListId(session.listId);

    if (track?.suggested && videoId) {
      return {
        mode: "radio",
        listId: radioId(videoId) || radioListId(watchList),
        tracks: [track],
        ownList: false,
      };
    }

    if (session.source === "radio" && source === "now") {
      return {
        mode: "radio",
        listId: sessionList || radioId(videoId),
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
      if (session.source === "queue" || isConcretePlaylist(sessionList) || isConcretePlaylist(stateList)) {
        return {
          mode: "queue",
          listId: (isConcretePlaylist(sessionList) && sessionList) || (isConcretePlaylist(stateList) && stateList) || "",
          tracks: session.tracks?.length ? session.tracks : sessionTracks,
          ownList: false,
        };
      }
      if (session.source === "list" || sessionTracks.length > 1) {
        return {
          mode: "list",
          listId: isConcretePlaylist(sessionList) ? sessionList : "",
          tracks: session.tracks?.length ? session.tracks : sessionTracks,
          ownList: true,
        };
      }
    }

    if (cover && (cover.tracks?.length || 0) > 1 && (isConcretePlaylist(coverList) || radioListId(coverList))) {
      return {
        mode: radioListId(coverList) ? "radio" : "queue",
        listId: coverList,
        tracks: cover.tracks,
        ownList: false,
      };
    }

    if (source === "playlist" || source === "liked" || source === "album") {
      const listId =
        radioListId(stateList) ||
        radioListId(trackList) ||
        radioListId(watchList) ||
        (isConcretePlaylist(stateList) ? stateList : "") ||
        (isConcretePlaylist(trackList) ? trackList : "") ||
        (isConcretePlaylist(watchList) ? watchList : "");
      if (radioListId(listId)) {
        return {
          mode: "radio",
          listId: radioListId(listId),
          tracks: sessionTracks,
          ownList: false,
        };
      }
      if (isConcretePlaylist(listId)) {
        return {
          mode: "queue",
          listId,
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
        listId: radioId(videoId),
        tracks: track ? [track] : [],
        ownList: false,
      };
    }

    if (sessionTracks.length > 1) {
      return {
        mode: "list",
        listId: isConcretePlaylist(stateList) ? stateList : "",
        tracks: sessionTracks,
        ownList: true,
      };
    }

    if (videoId) {
      return {
        mode: "radio",
        listId: radioId(videoId),
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

  function nativeBarHasSong(info) {
    if (!info || typeof info !== "object") return false;
    if (isPlayableVideoId(info.videoId)) return true;
    const title = String(info.title || "").trim();
    if (!title) return false;
    if (title === "yTunes" || /^youtube music$/i.test(title)) return false;
    return true;
  }

  function shouldCueStoredTrack({
    overlayOn = false,
    barHasSong = false,
    storedVideoId = "",
  } = {}) {
    if (overlayOn) return false;
    if (barHasSong) return false;
    return isPlayableVideoId(storedVideoId);
  }

  return {
    watchListId,
    isPlayableVideoId,
    isConcretePlaylist,
    radioListId,
    radioId,
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
