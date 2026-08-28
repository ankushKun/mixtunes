/**
 * The MAIN-world half of the Spotify adapter's shared rules.
 * Isolated world keeps playback-core.js plus ids.js; this file is the copy
 * Chrome forces because worlds cannot share a path (crbug.com/324096753).
 */
(function (root, factory) {
  const api = factory();
  root.YTunesPageCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TRACK_ID = /^[A-Za-z0-9]{22}$/;
  const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/i;
  const TRACK_HREF = /\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/i;

  function text(value) {
    return String(value ?? "").trim();
  }

  function trackIdOf(raw) {
    const value = text(raw);
    const uri = value.match(TRACK_URI);
    if (uri) return uri[1];
    const href = value.match(TRACK_HREF);
    if (href) return href[1];
    if (TRACK_ID.test(value)) return value;
    return "";
  }

  function playable(id) {
    return Boolean(trackIdOf(id));
  }

  function listId(raw) {
    return text(raw);
  }

  function radioListId(raw) {
    const list = listId(raw);
    return /(^|:)(station|radio)(:|$)/i.test(list) ? list : "";
  }

  function isConcreteList(raw) {
    const list = listId(raw);
    return Boolean(list) && !radioListId(list);
  }

  function radioFor() {
    return "";
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

  function shouldHandleAutoAdvance(ownList) {
    return Boolean(ownList);
  }

  function shouldTakeOverAutoAdvance({ playerState, playing, videoId, fromId } = {}) {
    if (!fromId || !videoId || videoId !== fromId) return false;
    const state = Number(playerState);
    if (Number.isFinite(state)) return state === 0;
    return !playing;
  }

  function overlayHooksActive({ pref, dataset, hasRoot, hasLaunch } = {}) {
    if (pref === "0" || pref === "off" || pref === false) return false;
    if (dataset === "off" || dataset === "0") return false;
    if (hasLaunch && !hasRoot) return false;
    return true;
  }

  function stockSiteUntouched(hookState) {
    return !overlayHooksActive(hookState);
  }

  function rowKey(track) {
    return text(track?.id) || text(track?.videoId) || trackIdOf(track?.uri);
  }

  function sessionHint(pathname) {
    const path = text(pathname);
    if (/^\/collection(\/|$)/i.test(path)) return "in";
    if (/^\/user\//i.test(path)) return "in";
    return "";
  }

  return {
    playable,
    listId,
    isConcreteList,
    radioFor,
    rowKey,
    adjacentInRoster,
    shouldHandleAutoAdvance,
    shouldTakeOverAutoAdvance,
    overlayHooksActive,
    stockSiteUntouched,
    sessionHint,
    trackIdOf,
  };
});
