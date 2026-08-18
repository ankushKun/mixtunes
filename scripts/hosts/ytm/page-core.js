/**
 * The MAIN-world half of the YTM adapter's shared rules.
 *
 * Chrome refuses to inject one file into two `content_scripts` worlds: a path
 * listed in both a MAIN and an ISOLATED entry lands in one world only
 * (crbug.com/324096753), so the other world silently boots without it. That
 * makes a per-world copy the price of running in MAIN at all — the isolated
 * world keeps `scripts/playback-core.js` plus `ids.js`, and page.js gets the
 * slice of those two it actually needs from here.
 *
 * Every rule below is pinned against its shared original by
 * tests/host-contract.test.js, so the two copies cannot drift.
 */
(function (root, factory) {
  const api = factory();
  root.YTunesPageCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VIDEO_ID = /^[\w-]{11}$/;
  const RADIO_PREFIX = "RD";
  const SONG_RADIO_PREFIX = "RDAMVM";

  function text(value) {
    return String(value ?? "").trim();
  }

  function playable(id) {
    return VIDEO_ID.test(text(id));
  }

  function listId(raw) {
    return text(raw).replace(/^VL/, "");
  }

  function isConcreteList(raw) {
    const list = listId(raw);
    return Boolean(list) && !list.startsWith(RADIO_PREFIX);
  }

  function radioFor(id) {
    return playable(id) ? `${SONG_RADIO_PREFIX}${text(id)}` : "";
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

  /**
   * True when the overlay is off and the stock site must run untouched: no
   * pausing, no cueing, no media-key interception. Every MAIN-world side effect
   * that could touch host playback checks this first.
   */
  function stockSiteUntouched(hookState) {
    return !overlayHooksActive(hookState);
  }

  /** Row identity inside a playlist; distinguishes duplicate videos. */
  function rowKey(track) {
    return text(track?.setVideoId) || text(track?.id) || text(track?.videoId);
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
  };
});
