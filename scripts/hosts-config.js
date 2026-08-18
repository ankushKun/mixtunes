/**
 * Host identity and copy, loaded everywhere a host adapter cannot run:
 * the popup and the content-script world. The service worker inlines the origin
 * list instead of importScripts (Chrome fails that load with NetworkError).
 *
 * Origins here must match manifest.json `host_permissions`,
 * `content_scripts[].matches`, and `web_accessible_resources[].matches`.
 * MV3 needs those literals in the manifest, so they are duplicated on purpose;
 * tests/hosts-config.test.js fails if the copies drift.
 *
 * Adding a host: append an entry here, add its `scripts/hosts/<id>/` folder, and
 * duplicate both content_scripts blocks plus the manifest origin arrays.
 */
(function (root, factory) {
  const api = factory();
  root.YTunesHosts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const OFF_HOST_TITLE = "yTunes only works on a supported music site";

  const HOSTS = [
    {
      id: "ytm",
      name: "YouTube Music",
      origin: "https://music.youtube.com",
      escapeParam: "newytm",
      strings: {
        /** LCD subtitle when nothing is playing. */
        lcdIdle: "YouTube Music",
        /** Status bar note for the host landing page. */
        homeStatus: "YouTube Music Home",
        /** Empty library, user is signed out. */
        signInLibrary: "Sign in on YouTube Music to see this library.",
        /** Empty list that might legitimately be empty. */
        signInItems:
          "No items. Sign in on YouTube Music if this library should have music.",
        /** Prefs hint next to the overlay toggle. */
        overlayHint: "Turning the overlay off reloads YouTube Music.",
        /** Button that drops back to the untouched site. */
        originalLabel: "Original YouTube Music",
        originalTitle: "Hide the yTunes overlay and reload YouTube Music",
        /** Shown when the host player never appeared. */
        bootFail: "YouTube Music didn’t become ready",
        /** Popup: host is up but has no track metadata yet. */
        popupAlive: "YouTube Music player is alive.",
        /** Popup: overlay toggle hint. */
        popupOverlayHint: "Off uses stock YouTube Music. Reloads the tab.",
        /** Popup: link that opens the host. */
        popupOpen: "Open YouTube Music",
      },
    },
  ];

  function originOf(url) {
    if (!url) return "";
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  }

  /** The host that owns a tab URL, or null when the tab is unsupported. */
  function forUrl(url) {
    const origin = originOf(url);
    if (!origin) return null;
    return HOSTS.find((host) => host.origin === origin) || null;
  }

  function byId(id) {
    return HOSTS.find((host) => host.id === id) || null;
  }

  /** Default host for chrome that has no tab context, e.g. the popup's open link. */
  function primary() {
    return HOSTS[0];
  }

  function origins() {
    return HOSTS.map((host) => host.origin);
  }

  /** Manifest match patterns the origins expand to. */
  function matchPatterns() {
    return HOSTS.map((host) => `${host.origin}/*`);
  }

  return {
    list: HOSTS,
    forUrl,
    byId,
    primary,
    origins,
    matchPatterns,
    OFF_HOST_TITLE,
  };
});
