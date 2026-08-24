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
  const OFF_HOST_TITLE = "Mixtunes only works on a supported music site";

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
        originalTitle: "Hide the Mixtunes overlay and reload YouTube Music",
        /** Shown when the host player never appeared. */
        bootFail: "YouTube Music didn’t become ready",
        /** Section label for host-generated queue continuations (automix). */
        continuationLabel: "Automix",
        /** Toast when playback hands off to a host-generated continuation. */
        continuationToast: "Similar music will keep playing",
        /** Popup: host is up but has no track metadata yet. */
        popupAlive: "YouTube Music player is alive.",
        /** Popup: overlay toggle hint. */
        popupOverlayHint: "Off uses stock YouTube Music. Reloads the tab.",
        /** Popup: link that opens the host. */
        popupOpen: "Open YouTube Music",
      },
      /**
       * Sidebar layout: which sources exist, under which group, with which
       * icon, and whether the group starts open. `dynamic` marks the group
       * that hosts a runtime list (mood chips or user playlists). The shell
       * renders this verbatim and stays host-agnostic.
       */
      sourceGroups: [
        {
          id: "store",
          label: "Store",
          sources: [
            { source: "home", label: "Home", icon: "home" },
            { source: "explore", label: "Explore", icon: "explore" },
            { source: "charts", label: "Charts", icon: "chart" },
          ],
        },
        {
          id: "library",
          label: "Library",
          sources: [
            { source: "songs", label: "Music", icon: "note" },
            { source: "liked", label: "Liked Songs", icon: "heart" },
            { source: "albums", label: "Albums", icon: "album" },
            { source: "artists", label: "Artists", icon: "artist" },
            { source: "recents", label: "Recents", icon: "clock" },
          ],
        },
        {
          id: "media",
          label: "Media",
          open: false,
          sources: [
            { source: "videos", label: "Videos", icon: "video" },
            { source: "podcasts", label: "Podcasts", icon: "podcast" },
          ],
        },
        {
          id: "genius",
          label: "Genius",
          dynamic: "moods",
          sources: [{ source: "mixes", label: "Radio & Mixes", icon: "radio" }],
        },
        {
          id: "playlists",
          label: "Playlists",
          dynamic: "playlists",
          sources: [{ source: "now", label: "Now Playing", icon: "speaker" }],
        },
      ],
      /** Mood chips beyond this count live under Explore instead. */
      moodCap: 6,
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
