const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hosts = require("../scripts/hosts-config");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// Everything the iTunes chrome, content.js, or the popup calls on MusicHost. A new
// host that misses one of these will break the shell at runtime, so the list is
// asserted against the adapter source instead of trusting a manual grep.
const REQUIRED_HOST_SURFACE = [
  "id",
  "name",
  "strings",
  "escapeParam",
  "hideSheet",
  "capabilities",
  "waitUntilReady",
  "launchSlot",
  "markReady",
  "markIdle",
  "isIdleTitle",
  "browse",
  "search",
  "suggest",
  "playlists",
  "moods",
  "collectionQuery",
  "listIdFor",
  "builtinLists",
  "isSongCover",
  "trackFromCover",
  "albumOf",
  "artistOf",
  "signedIn",
  "lyrics",
  "play",
  "resume",
  "cue",
  "radioListFor",
  "startRadio",
  "queue",
  "playerQueue",
  "invalidateQueue",
  "probe",
  "refreshStatus",
  "control",
  "seek",
  "volume",
  "setShuffle",
  "setRepeat",
  "syncSkipRoster",
  "forcedSessionMode",
  "like",
  "enqueue",
  "createPlaylist",
  "addToPlaylist",
  "removeFromPlaylist",
];

const CAPABILITY_KEYS = [
  "sources",
  "lyrics",
  "like",
  "dislike",
  "enqueue",
  "playlistEdit",
  "signedIn",
  "overlayRequiresSignIn",
  "radio",
  "automix",
  "shuffle",
  "repeat",
  "seek",
  "volume",
];

/**
 * The `key: value` / `key,` / `key() {}` names declared at one indent level of an
 * object literal. Read statically because the adapter needs a DOM to run.
 */
function assignedKeys(source, marker, indent) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `could not find ${marker}`);
  const keys = new Set();
  const pattern = new RegExp(`^ {${indent}}(?:async )?([A-Za-z_$][\\w$]*)\\s*[:(,]`, "gm");
  for (const match of source.slice(start).matchAll(pattern)) keys.add(match[1]);
  return keys;
}

function hostAdapterDirs() {
  const hostsDir = path.join(root, "scripts", "hosts");
  return fs.readdirSync(hostsDir).filter((name) =>
    fs.existsSync(path.join(hostsDir, name, "player.js"))
  );
}

function testHostSurface() {
  const dirs = hostAdapterDirs();
  assert.ok(dirs.length > 0, "at least one host adapter must exist");
  for (const dir of dirs) {
    const source = read(`scripts/hosts/${dir}/player.js`);
    const keys = assignedKeys(source, "globalThis.MusicHost = (() => {", 4);
    for (const name of REQUIRED_HOST_SURFACE) {
      assert.ok(keys.has(name), `${dir} MusicHost is missing ${name}`);
    }
    const caps = assignedKeys(source, "capabilities: {", 6);
    for (const name of CAPABILITY_KEYS) {
      assert.ok(caps.has(name), `${dir} MusicHost.capabilities is missing ${name}`);
    }
  }
}

/** The chrome must not reach past MusicHost into a specific host's vocabulary. */
function testShellHasNoHostKnowledge() {
  const banned = [
    /FEmusic_/,
    /RDAMVM/,
    /watchEndpoint/,
    /ytmusic-/,
    // The adapter's own catalog/player globals stay private to the adapter.
    /\bYTM\b/,
    /\bYtmCatalog\b/,
    /\bYTunesYtmIds\b/,
    /\bVL[A-Z"'`]/,
    /"LM"/,
    /MPRE/,
    /OLAK/,
    /MPSP/,
    /\bclickControl\(/,
    /\bskipIds\b/,
  ];
  for (const file of [
    "layouts/shell/script.js",
    "layouts/shell/coverflow.js",
    "layouts/shell/prefs.js",
    "scripts/content.js",
    "popup.js",
  ]) {
    const lines = read(file)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
    for (const pattern of banned) {
      const hit = lines.find((line) => pattern.test(line));
      assert.ok(!hit, `${file} still knows a host detail (${pattern}): ${hit}`);
    }
  }
}

/**
 * Chrome injects a path listed in two `content_scripts` worlds into one world only
 * (crbug.com/324096753), leaving the other world booting without it — which reads
 * as a `ReferenceError` from whichever file expected the global. Each world must
 * therefore load its own files.
 */
function testWorldsDoNotShareFiles() {
  const manifest = JSON.parse(read("manifest.json"));
  const worldsByFile = new Map();
  manifest.content_scripts.forEach((entry, index) => {
    const world = entry.world || "ISOLATED";
    for (const file of entry.js || []) {
      assert.ok(fs.existsSync(path.join(root, file)), `${file} is listed but missing`);
      const worlds = worldsByFile.get(file) || new Set();
      for (const prior of worlds) {
        assert.ok(
          prior === world,
          `${file} is listed in both ${prior} and ${world} worlds ` +
            `(content_scripts[${index}]); Chrome would inject it into one world only`
        );
      }
      worlds.add(world);
      worldsByFile.set(file, worlds);
    }
  });
}

/** The MAIN-world copy of the shared rules must behave like the originals. */
function testPageCoreMatchesSharedRules() {
  const generic = [
    ["shouldHandleAutoAdvance", [true], [false], [undefined]],
    [
      "shouldTakeOverAutoAdvance",
      [{ playerState: 0, playing: false, videoId: "a", fromId: "a" }],
      [{ playerState: 2, playing: false, videoId: "a", fromId: "a" }],
      [{ playerState: 1, playing: true, videoId: "b", fromId: "a" }],
      [{ playerState: NaN, playing: false, videoId: "a", fromId: "a" }],
      [{ playerState: 0, playing: false, videoId: "", fromId: "a" }],
      [undefined],
    ],
    [
      "adjacentInRoster",
      [["a", "b", "c"], "b", "next", true, -1],
      [["a", "b", "c"], "c", "next", false, -1],
      [["a", "b", "c"], "a", "previous", true, -1],
      [["a", "b", "c"], "", "next", true, 2],
      [[], "a", "next", true, -1],
    ],
    [
      "overlayHooksActive",
      [{ pref: "0" }],
      [{ pref: "1", dataset: "off" }],
      [{ pref: "1", hasLaunch: true, hasRoot: false }],
      [{ pref: "1", hasLaunch: true, hasRoot: true }],
      [undefined],
    ],
    [
      "stockSiteUntouched",
      [{ pref: "1", hasRoot: true }],
      [{ pref: "0" }],
      [{ dataset: "off" }],
      [{ pref: "1", hasLaunch: true, hasRoot: false }],
      [undefined],
    ],
  ];

  const hostIdCases = {
    ytm: [
      ["playable", ["dQw4w9WgXcQ"], ["short"], [""], [null], ["  dQw4w9WgXcQ  "]],
      ["listId", ["VLPL123"], ["PL123"], [""], [null]],
      ["isConcreteList", ["VLPL123"], ["RDAMVMdQw4w9WgXcQ"], ["RDCLAK5"], [""]],
      ["radioFor", ["dQw4w9WgXcQ"], ["nope"], [""]],
      [
        "rowKey",
        [{ setVideoId: "row1", id: "dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ" }],
        [{ id: "dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ" }],
        [{ videoId: "dQw4w9WgXcQ" }],
        [{}],
        [null],
      ],
    ],
    spotify: [
      [
        "playable",
        ["4cOdK2wGLETKBW3PvgPWqT"],
        ["spotify:track:4cOdK2wGLETKBW3PvgPWqT"],
        ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"],
        ["/track/4cOdK2wGLETKBW3PvgPWqT"],
        ["short"],
        [""],
        [null],
      ],
      [
        "listId",
        ["spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"],
        ["37i9dQZF1DXcBWIGoYBM5M"],
        ["collection"],
        [""],
        [null],
      ],
      [
        "isConcreteList",
        ["spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"],
        ["collection"],
        ["spotify:station:track:abc"],
        [""],
      ],
      ["radioFor", ["4cOdK2wGLETKBW3PvgPWqT"], ["nope"], [""]],
      [
        "rowKey",
        [{ id: "4cOdK2wGLETKBW3PvgPWqT", videoId: "4cOdK2wGLETKBW3PvgPWqT" }],
        [{ videoId: "4cOdK2wGLETKBW3PvgPWqT" }],
        [{}],
        [null],
      ],
      [
        "sessionHint",
        ["/collection/tracks"],
        ["/collection"],
        ["/user/abc"],
        ["/"],
        ["/search"],
        ["/playlist/37i9dQZF1DXcBWIGoYBM5M"],
        [""],
        [null],
      ],
    ],
  };

  for (const dir of hostAdapterDirs()) {
    const pageCore = require(`../scripts/hosts/${dir}/page-core`);
    const ids = require(`../scripts/hosts/${dir}/ids`);
    const playback = require("../scripts/playback-core");
    playback.configure(ids);
    const cases = generic.concat(hostIdCases[dir] || []);
    for (const [name, ...argSets] of cases) {
      const shared = typeof playback[name] === "function" ? playback : ids;
      assert.ok(
        typeof pageCore[name] === "function",
        `${dir} page-core is missing ${name}`
      );
      for (const args of argSets) {
        assert.deepStrictEqual(
          pageCore[name](...args),
          shared[name](...args),
          `${dir} page-core.${name} drifted from the shared rule for ${JSON.stringify(args)}`
        );
      }
    }
  }
}

function loadPrefsModule(stored = null) {
  const store = { ytunesPrefs: stored };
  const context = {
    YTunesHosts: hosts,
    console,
    chrome: {
      storage: {
        local: {
          get: async (defaults) => ({
            ytunesPrefs: store.ytunesPrefs ?? defaults.ytunesPrefs,
          }),
          set: async (patch) => Object.assign(store, patch),
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(read("layouts/shell/prefs.js"), context);
  return context;
}

/**
 * Play counts and the last-played track are keyed by host ids, so they must live in
 * per-host slices. Existing YouTube Music keys have to survive the move untouched.
 */
async function testPrefsAreNamespacedByHost() {
  const legacy = {
    version: 3,
    view: "grid",
    playCounts: { dQw4w9WgXcQ: { count: 4, lastPlayed: 1700000000000 } },
    nowPlaying: { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up" },
  };
  const prefs = loadPrefsModule(legacy);

  const migrated = prefs.migratePrefs(legacy);
  assert.strictEqual(migrated.version, 4);
  assert.strictEqual(migrated.view, "grid", "shared prefs must survive");
  // Compared as JSON: the sandbox builds objects in its own realm.
  assert.strictEqual(
    JSON.stringify(migrated.hosts.ytm.playCounts),
    JSON.stringify(legacy.playCounts),
    "YouTube Music play-count keys must not be renamed"
  );
  assert.strictEqual(migrated.hosts.ytm.nowPlaying.videoId, "dQw4w9WgXcQ");
  assert.strictEqual(
    prefs.playStat(migrated, "dQw4w9WgXcQ").count,
    "4",
    "counts must still be readable for the active host"
  );

  // A second host reads its own empty slice rather than YouTube Music's counts.
  prefs.configurePrefs("other");
  const forOther = prefs.migratePrefs(migrated);
  assert.strictEqual(prefs.playStat(forOther, "dQw4w9WgXcQ").count, "");
  assert.strictEqual(forOther.hosts.ytm.playCounts.dQw4w9WgXcQ.count, 4);
  assert.strictEqual(forOther.nowPlaying, null);
  assert.strictEqual(forOther.hosts.other.nowPlaying, null);

  // Saving under the second host must not disturb YouTube Music's slice.
  const written = await prefs.savePrefs({
    nowPlaying: { id: "otherTrack", title: "Elsewhere" },
    playCounts: { otherTrack: { count: 1, lastPlayed: 1 } },
  });
  assert.strictEqual(written.hosts.other.nowPlaying.videoId, "otherTrack");
  assert.strictEqual(written.hosts.ytm.nowPlaying.videoId, "dQw4w9WgXcQ");
  assert.strictEqual(written.hosts.ytm.playCounts.dQw4w9WgXcQ.count, 4);
  assert.strictEqual(written.hosts.other.playCounts.otherTrack.count, 1);

  prefs.configurePrefs("ytm");
  const back = await prefs.loadPrefs();
  assert.strictEqual(back.nowPlaying.videoId, "dQw4w9WgXcQ");
  assert.strictEqual(prefs.playStat(back, "dQw4w9WgXcQ").count, "4");
}

/** `id` is canonical; `videoId` is only YouTube Music's alias for it. */
function testNowPlayingAcceptsCanonicalId() {
  const prefs = loadPrefsModule();
  assert.strictEqual(
    prefs.sanitizeNowPlaying({ id: "abc", title: "Song" }).videoId,
    "abc"
  );
  assert.strictEqual(prefs.sanitizeNowPlaying({ title: "Mixtunes" }), null);
  assert.strictEqual(prefs.sanitizeNowPlaying(null), null);
}

/**
 * The shell script is a pure function module (no top-level side effects), so
 * its roster logic can be exercised in a sandbox with stubbed host globals.
 */
function loadShellModule() {
  const playback = require("../scripts/playback-core");
  playback.configure(require("../scripts/hosts/ytm/ids"));
  const context = {
    YTunesPlayback: playback,
    MusicHost: { forcedSessionMode: () => "", strings: {}, probe: () => null },
    console,
  };
  vm.createContext(context);
  vm.runInContext(read("layouts/shell/script.js"), context);
  return context;
}

/** Browsing must never republish the roster: only the session or live queue. */
function testSkipRosterIgnoresBrowsedSource() {
  const shell = loadShellModule();
  const state = {
    session: null,
    tracks: [{ id: "browsed1" }, { id: "browsed2" }],
    visibleTracks: [{ id: "browsed1" }, { id: "browsed2" }],
    nowTracks: [{ id: "queue1" }, { id: "queue2" }],
  };
  const roster = shell.skipRoster(state, { trackId: "queue1", playlistId: "" });
  // The sandbox builds objects in its own realm, so compare as JSON.
  assert.strictEqual(
    JSON.stringify(roster.tracks.map((track) => track.id)),
    JSON.stringify(["queue1", "queue2"]),
    "roster must be the live queue, not the browsed source"
  );

  state.nowTracks = [];
  const empty = shell.skipRoster(state, { trackId: "", playlistId: "" });
  assert.strictEqual(
    empty.tracks.length,
    0,
    "no session and no live queue must yield an empty roster"
  );
}

/** A radio handoff replaces the list session and keeps a skip fallback roster. */
function testRadioHandoffReplacesListSession() {
  const shell = loadShellModule();
  const state = {
    session: {
      source: "list",
      listId: "",
      tracks: [{ id: "a" }, { id: "b" }],
      shuffle: false,
      order: null,
    },
    nowTracks: [{ id: "zz" }, { id: "yy" }, { id: "xx" }],
  };
  const roster = shell.skipRoster(state, {
    trackId: "zz",
    playlistId: "RDAMVMzz",
  });
  assert.strictEqual(roster.handedOff, true, "handoff must be signalled");
  assert.strictEqual(state.session.source, "radio");
  assert.strictEqual(roster.ownList, false, "host still drives radio transport");
  assert.strictEqual(
    JSON.stringify(roster.tracks.map((track) => track.id)),
    JSON.stringify(["zz", "yy", "xx"]),
    "radio must publish the live queue so next/prev have a fallback"
  );
}

/** Home/radio with only a seed session still prefers the live nowTracks roster. */
function testRadioSkipRosterPrefersLiveQueue() {
  const shell = loadShellModule();
  const state = {
    session: {
      source: "radio",
      listId: "RDAMVMaa",
      tracks: [{ id: "aaaaaaaaaaa" }],
      shuffle: false,
      order: null,
    },
    nowTracks: [
      { id: "aaaaaaaaaaa" },
      { id: "bbbbbbbbbbb" },
      { id: "ccccccccccc" },
    ],
  };
  const roster = shell.skipRoster(state, {
    trackId: "aaaaaaaaaaa",
    playlistId: "RDAMVMaa",
  });
  assert.strictEqual(roster.ownList, false);
  assert.strictEqual(
    JSON.stringify(roster.tracks.map((track) => track.id)),
    JSON.stringify(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"])
  );
}

/** A stale shuffle order falls back to roster order; it is never re-rolled. */
function testOrderedSessionTracksNeverRerolls() {
  const shell = loadShellModule();
  const tracks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const stale = { shuffle: true, order: [1, 0], tracks };
  assert.strictEqual(
    JSON.stringify(shell.orderedSessionTracks(stale).map((track) => track.id)),
    JSON.stringify(["a", "b", "c"])
  );
  const valid = { shuffle: true, order: [2, 0, 1], tracks };
  assert.strictEqual(
    JSON.stringify(shell.orderedSessionTracks(valid).map((track) => track.id)),
    JSON.stringify(["c", "a", "b"])
  );
}

function testSpotifyExtractTracks() {
  require("../scripts/hosts/spotify/ids");
  const { extractTracksFromPayload } = require("../scripts/hosts/spotify/catalog");
  const graphql = {
    data: {
      fetchLibraryTracks: {
        items: [
          {
            item: {
              data: {
                __typename: "Track",
                uri: "spotify:track:4cOdK2wGLETKBW3PvgPWqT",
                name: "Never Gonna Give You Up",
                artists: { items: [{ profile: { name: "Rick Astley" } }] },
                albumOfTrack: {
                  name: "Whenever You Need Somebody",
                  uri: "spotify:album:6N9PS4QXF1D3b7a0EpVT8l",
                  coverArt: { sources: [{ url: "https://i.scdn.co/image/ab" }] },
                  date: { year: 1987 },
                },
                duration: { totalMilliseconds: 213000 },
              },
            },
          },
        ],
      },
    },
  };
  const tracks = extractTracksFromPayload(graphql, { likeStatus: "like", playlistId: "collection" });
  assert.strictEqual(tracks.length, 1);
  assert.strictEqual(tracks[0].id, "4cOdK2wGLETKBW3PvgPWqT");
  assert.strictEqual(tracks[0].title, "Never Gonna Give You Up");
  assert.strictEqual(tracks[0].artist, "Rick Astley");
  assert.strictEqual(tracks[0].album, "Whenever You Need Somebody");
  assert.strictEqual(tracks[0].likeStatus, "like");
  const rest = extractTracksFromPayload({
    items: [
      {
        track: {
          id: "4cOdK2wGLETKBW3PvgPWqT",
          type: "track",
          name: "Never Gonna Give You Up",
          artists: [{ name: "Rick Astley" }],
          album: { name: "Whenever You Need Somebody", images: [{ url: "https://i.scdn.co/image/ab" }] },
          duration_ms: 213000,
        },
      },
    ],
  });
  assert.strictEqual(rest[0].id, "4cOdK2wGLETKBW3PvgPWqT");
  const ignored = extractTracksFromPayload({
    uri: "spotify:album:6N9PS4QXF1D3b7a0EpVT8l",
    name: "Whenever You Need Somebody",
  });
  assert.strictEqual(ignored.length, 0);
}

function testSpotifySessionHint() {
  const ids = require("../scripts/hosts/spotify/ids");
  assert.strictEqual(ids.sessionHint("/collection/tracks"), "in");
  assert.strictEqual(ids.sessionHint("/collection"), "in");
  assert.strictEqual(ids.sessionHint("/user/abc"), "in");
  assert.strictEqual(ids.sessionHint("/"), "");
  assert.strictEqual(ids.sessionHint("/search"), "");
  assert.strictEqual(ids.sessionHint("/playlist/37i9dQZF1DXcBWIGoYBM5M"), "");
}

function testSpotifyFirstSliceTrimmed() {
  const source = read("scripts/hosts/spotify/player.js");
  assert.ok(/lyrics:\s*false/.test(source), "Spotify lyrics stay off for the first slice");
  assert.ok(/enqueue:\s*false/.test(source), "Spotify enqueue stays off for the first slice");
  assert.ok(/playlistEdit:\s*false/.test(source), "Spotify playlistEdit stays off");
  assert.ok(/radio:\s*false/.test(source), "Spotify radio stays off");
  assert.ok(/dislike:\s*false/.test(source), "Spotify dislike stays off");
  assert.ok(/overlayRequiresSignIn:\s*true/.test(source), "Spotify must not trap signed-out login");
  assert.ok(
    /sessionHint\(location\.pathname\)/.test(source),
    "Spotify signed-in overlay must trust /collection before tokens exist"
  );
  assert.ok(
    /sources:\s*\[\s*"liked"/.test(source),
    "Spotify first slice starts at Liked Songs"
  );
  assert.ok(
    !/"videos"/.test(source.slice(source.indexOf("sources:"))),
    "Spotify first slice must not enable Videos"
  );
}

/**
 * The shell runs in the same isolated world as whichever adapter loaded before
 * it, so a bare call to an adapter's top-level function resolves on the host
 * that happens to define it and throws a ReferenceError on every other host.
 * That is how `parseClock`, `formatClock`, `seekToRatio`, and `setVolumeRatio`
 * silently worked on YouTube Music while breaking Spotify. Shared helpers
 * belong in scripts/*-core.js; host behavior belongs behind MusicHost.
 */
function testShellCallsNoAdapterGlobal() {
  const declared = (source) =>
    [...source.matchAll(/^\s*(?:async\s+)?function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(
      (match) => match[1]
    );

  const adapterNames = new Set();
  for (const dir of hostAdapterDirs()) {
    const base = path.join(root, "scripts", "hosts", dir);
    for (const file of fs.readdirSync(base)) {
      if (!file.endsWith(".js")) continue;
      for (const name of declared(read(`scripts/hosts/${dir}/${file}`))) {
        adapterNames.add(name);
      }
    }
  }

  const sharedNames = new Set(
    [
      "scripts/list-core.js",
      "scripts/playback-core.js",
      "scripts/hosts-config.js",
      "scripts/dom-html.js",
    ].flatMap((file) => declared(read(file)))
  );

  for (const file of [
    "layouts/shell/script.js",
    "layouts/shell/coverflow.js",
    "layouts/shell/prefs.js",
    "layouts/shell/marquee.js",
    "layouts/shell/dialog.js",
    "layouts/shell/toast.js",
    "scripts/content.js",
    "popup.js",
  ]) {
    const source = read(file);
    const own = new Set(declared(source));
    const lines = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
    for (const name of adapterNames) {
      if (own.has(name) || sharedNames.has(name)) continue;
      const call = new RegExp(`(?<![.\\w])${name}\\s*\\(`);
      const hit = lines.find((line) => call.test(line));
      assert.ok(
        !hit,
        `${file} calls adapter-private ${name}(): ${String(hit).trim()}`
      );
    }
  }
}

function testShellGatesContextMenu() {
  const source = read("layouts/shell/script.js");
  assert.ok(/caps\.enqueue/.test(source), "Play Next / Queue must follow capabilities.enqueue");
  assert.ok(/caps\.radio/.test(source), "Start Radio must follow capabilities.radio");
  assert.ok(/caps\.dislike/.test(source), "Dislike must follow capabilities.dislike");
  assert.ok(/caps\.playlistEdit/.test(source), "Add to Playlist must follow capabilities.playlistEdit");
}

testHostSurface();
testShellHasNoHostKnowledge();
testWorldsDoNotShareFiles();
testPageCoreMatchesSharedRules();
testNowPlayingAcceptsCanonicalId();
testSkipRosterIgnoresBrowsedSource();
testRadioHandoffReplacesListSession();
testRadioSkipRosterPrefersLiveQueue();
testOrderedSessionTracksNeverRerolls();
testSpotifyExtractTracks();
testSpotifySessionHint();
testSpotifyFirstSliceTrimmed();
testShellCallsNoAdapterGlobal();
testShellGatesContextMenu();
testPrefsAreNamespacedByHost().then(() => {
  console.log("host-contract: 15 groups passed");
});
