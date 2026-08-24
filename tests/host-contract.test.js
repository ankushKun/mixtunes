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
  "enqueue",
  "playlistEdit",
  "signedIn",
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

function testHostSurface() {
  const source = read("scripts/hosts/ytm/player.js");
  const keys = assignedKeys(source, "globalThis.MusicHost = (() => {", 4);
  for (const name of REQUIRED_HOST_SURFACE) {
    assert.ok(keys.has(name), `MusicHost is missing ${name}`);
  }
  const caps = assignedKeys(source, "capabilities: {", 6);
  for (const name of CAPABILITY_KEYS) {
    assert.ok(caps.has(name), `MusicHost.capabilities is missing ${name}`);
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
  const seen = new Map();
  manifest.content_scripts.forEach((entry, index) => {
    const world = entry.world || "ISOLATED";
    for (const file of entry.js || []) {
      assert.ok(fs.existsSync(path.join(root, file)), `${file} is listed but missing`);
      const prior = seen.get(file);
      assert.ok(
        prior === undefined,
        `${file} is listed in content_scripts[${prior}] and [${index}]; ` +
          `worlds cannot share a file, so ${world} needs its own copy`
      );
      seen.set(file, index);
    }
  });
}

/** The MAIN-world copy of the shared rules must behave like the originals. */
function testPageCoreMatchesSharedRules() {
  const pageCore = require("../scripts/hosts/ytm/page-core");
  const ids = require("../scripts/hosts/ytm/ids");
  const playback = require("../scripts/playback-core");
  playback.configure(ids);

  const cases = [
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

  for (const [name, ...argSets] of cases) {
    const shared = typeof playback[name] === "function" ? playback : ids;
    for (const args of argSets) {
      assert.deepStrictEqual(
        pageCore[name](...args),
        shared[name](...args),
        `page-core.${name} drifted from the shared rule for ${JSON.stringify(args)}`
      );
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

testHostSurface();
testShellHasNoHostKnowledge();
testWorldsDoNotShareFiles();
testPageCoreMatchesSharedRules();
testNowPlayingAcceptsCanonicalId();
testSkipRosterIgnoresBrowsedSource();
testRadioHandoffReplacesListSession();
testRadioSkipRosterPrefersLiveQueue();
testOrderedSessionTracksNeverRerolls();
testPrefsAreNamespacedByHost().then(() => {
  console.log("host-contract: 10 groups passed");
});
