/**
 * Spotify identifier policy — pure string rules, no DOM and no network.
 *
 * - A playable track id is a 22-character Spotify id, optionally as a track URI.
 * - Playlist / album / collection ids stay opaque strings (URI or sentinel).
 * - Radio/station contexts are not playable lists in the first slice.
 */
(function (root, factory) {
  const api = factory();
  root.YTunesSpotifyIds = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TRACK_ID = /^[A-Za-z0-9]{22}$/;
  const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/i;
  const TRACK_HREF = /\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/i;
  const IDLE_TITLE = /^spotify$/i;

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

  function rowKey(track) {
    return text(track?.id) || text(track?.videoId) || trackIdOf(track?.uri);
  }

  function idleTitle(title) {
    return IDLE_TITLE.test(text(title));
  }

  /** Library routes that only exist for a signed-in Spotify session. */
  function sessionHint(pathname) {
    const path = text(pathname);
    if (/^\/collection(\/|$)/i.test(path)) return "in";
    if (/^\/user\//i.test(path)) return "in";
    return "";
  }

  function trackUri(id) {
    const bare = trackIdOf(id);
    return bare ? `spotify:track:${bare}` : "";
  }

  return {
    id: "spotify",
    playable,
    listId,
    radioListId,
    isConcreteList,
    radioFor,
    rowKey,
    idleTitle,
    sessionHint,
    trackIdOf,
    trackUri,
  };
});
