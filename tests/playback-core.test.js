const assert = require("assert");
const P = require("../scripts/playback-core");
const ytmIds = require("../scripts/hosts/ytm/ids");

// The YTM adapter owns these rules at runtime; the tests below assert the
// YouTube Music behaviour, so they configure the same strategy the adapter does.
P.configure(ytmIds);

const song = (id, extra = {}) => ({
  videoId: id,
  id,
  title: id,
  ...extra,
});

function testAdjacentRoster() {
  const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[0], "next", true, 0), {
    id: ids[1],
    index: 1,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[0], "next", true, 1), {
    id: ids[2],
    index: 2,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[2], "next", false, 2), {
    id: "",
    index: -1,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[2], "next", true, 2), {
    id: ids[0],
    index: 0,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[1], "previous", true, 1), {
    id: ids[0],
    index: 0,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[0], "previous", false, 0), {
    id: "",
    index: -1,
  });
}

function testPendingSkipIndex() {
  const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  assert.strictEqual(P.skipIndexAfterPending(ids, ids[0], ids[1], 100, 50), 1);
  assert.strictEqual(P.skipIndexAfterPending(ids, ids[0], ids[1], 10, 50), 0);
  assert.strictEqual(P.skipIndexAfterPending(ids, ids[1], ids[1], 100, 50), 1);
  assert.strictEqual(P.skipIndexAfterPending(ids, ids[2], ids[1], 100, 50), 2);
  assert.strictEqual(P.skipIndexAfterPending(ids, "", "", 0, 50), -1);
}

function testHostQueueMatch() {
  const host = {
    playlistId: "PLold",
    tracks: [song("aaaaaaaaaaa"), song("bbbbbbbbbbb")],
  };
  assert.strictEqual(P.hostQueueMatches(host, "aaaaaaaaaaa", "PLold"), true);
  assert.strictEqual(P.hostQueueMatches(host, "aaaaaaaaaaa", "PLnew"), false);
  assert.strictEqual(P.hostQueueMatches(host, "zzzzzzzzzzz", "PLold"), false);
  assert.strictEqual(P.hostQueueMatches({ tracks: [] }, "aaaaaaaaaaa", ""), false);
}

function testResolveQueueTracks() {
  const oldHost = {
    playlistId: "PLold",
    tracks: [song("aaaaaaaaaaa"), song("bbbbbbbbbbb")],
  };
  const fresh = [song("ccccccccccc"), song("ddddddddddd")];
  const replaced = P.resolveQueueTracks(oldHost, fresh, "ccccccccccc", "PLnew");
  assert.deepStrictEqual(
    replaced.map((track) => track.videoId),
    ["ccccccccccc", "ddddddddddd"]
  );

  const same = P.resolveQueueTracks(
    { playlistId: "PLold", tracks: [song("aaaaaaaaaaa")] },
    [song("aaaaaaaaaaa"), song("bbbbbbbbbbb")],
    "aaaaaaaaaaa",
    "PLold"
  );
  assert.deepStrictEqual(
    same.map((track) => track.videoId),
    ["aaaaaaaaaaa", "bbbbbbbbbbb"]
  );
}

function testPlayHomeSongStartsRadio() {
  const track = song("abcdefghijk", {
    endpoint: { watchEndpoint: { videoId: "abcdefghijk" } },
  });
  const ctx = P.resolvePlayContext({ source: "home", playlistId: "" }, track, {
    mixedStorefront: true,
    sessionTracks: [track],
  });
  assert.strictEqual(ctx.mode, "radio");
  assert.strictEqual(ctx.ownList, false);
  assert.strictEqual(ctx.listId, "RDAMVMabcdefghijk");
}

function testPlayPlaylistUsesNativeQueue() {
  const tracks = [song("abcdefghijk"), song("lmnopqrstuv")];
  const ctx = P.resolvePlayContext(
    { source: "playlist", playlistId: "PLreal", session: {} },
    tracks[1],
    { sessionTracks: tracks }
  );
  assert.strictEqual(ctx.mode, "queue");
  assert.strictEqual(ctx.ownList, false);
  assert.strictEqual(ctx.listId, "PLreal");
  assert.strictEqual(ctx.tracks.length, 2);
}

function testPlayLikedUsesLm() {
  const tracks = [song("abcdefghijk"), song("lmnopqrstuv")];
  const ctx = P.resolvePlayContext(
    { source: "liked", playlistId: "LM", session: {} },
    tracks[0],
    { sessionTracks: tracks }
  );
  assert.strictEqual(ctx.mode, "queue");
  assert.strictEqual(ctx.ownList, false);
  assert.strictEqual(ctx.listId, "LM");
}

function testPlayAlbumCoverUsesPlaylist() {
  const tracks = [song("abcdefghijk"), song("lmnopqrstuv")];
  const cover = { playlistId: "OLAKalbum01", tracks };
  const ctx = P.resolvePlayContext({ source: "home", session: {} }, tracks[0], {
    mixedStorefront: true,
    cover,
    sessionTracks: [tracks[0]],
  });
  assert.strictEqual(ctx.mode, "queue");
  assert.strictEqual(ctx.listId, "OLAKalbum01");
  assert.strictEqual(ctx.ownList, false);
  assert.strictEqual(ctx.tracks.length, 2);
}

function testLibraryListIsOwned() {
  const tracks = [song("abcdefghijk"), song("lmnopqrstuv"), song("wxyzaaaaaaa")];
  const ctx = P.resolvePlayContext({ source: "songs", session: {} }, tracks[1], {
    sessionTracks: tracks,
  });
  assert.strictEqual(ctx.mode, "list");
  assert.strictEqual(ctx.ownList, true);
  assert.strictEqual(ctx.tracks.length, 3);
}

function testSuggestedStartsRadio() {
  const track = song("abcdefghijk", { suggested: true });
  const ctx = P.resolvePlayContext(
    { source: "playlist", playlistId: "PLreal", session: {} },
    track,
    { sessionTracks: [song("lmnopqrstuv")] }
  );
  assert.strictEqual(ctx.mode, "radio");
  assert.strictEqual(ctx.ownList, false);
  assert.strictEqual(ctx.listId, "RDAMVMabcdefghijk");
}

function testMixUsesRadio() {
  const track = song("abcdefghijk", { playlistId: "RDCLAK5uykmix" });
  const ctx = P.resolvePlayContext({ source: "mixes", session: {} }, track, {
    mixedStorefront: true,
    sessionTracks: [track],
  });
  assert.strictEqual(ctx.mode, "radio");
  assert.strictEqual(ctx.listId, "RDCLAK5uykmix");
  assert.strictEqual(ctx.ownList, false);
}

function testAutoAdvanceOnlyWhenOwned() {
  assert.strictEqual(P.shouldHandleAutoAdvance(true), true);
  assert.strictEqual(P.shouldHandleAutoAdvance(false), false);
}

function testPlayOpenedAlbumUsesQueue() {
  const tracks = [song("abcdefghijk"), song("lmnopqrstuv")];
  const ctx = P.resolvePlayContext(
    { source: "album", playlistId: "OLAKalbum01", session: {} },
    tracks[1],
    { sessionTracks: tracks }
  );
  assert.strictEqual(ctx.mode, "queue");
  assert.strictEqual(ctx.listId, "OLAKalbum01");
  assert.strictEqual(ctx.ownList, false);
}

function testNowPlayingKeepsQueue() {
  const tracks = [song("abcdefghijk"), song("lmnopqrstuv")];
  const ctx = P.resolvePlayContext(
    {
      source: "now",
      playlistId: "PLreal",
      session: { source: "queue", listId: "PLreal", tracks },
    },
    tracks[1],
    { sessionTracks: tracks }
  );
  assert.strictEqual(ctx.mode, "queue");
  assert.strictEqual(ctx.ownList, false);
  assert.strictEqual(ctx.listId, "PLreal");
}

function testRadioSessionDoesNotHijackHome() {
  const track = song("lmnopqrstuv");
  const ctx = P.resolvePlayContext(
    {
      source: "home",
      session: { source: "radio", listId: "RDAMVMabcdefghijk", tracks: [song("abcdefghijk")] },
    },
    track,
    { mixedStorefront: true, sessionTracks: [track] }
  );
  assert.strictEqual(ctx.mode, "radio");
  assert.strictEqual(ctx.listId, "RDAMVMlmnopqrstuv");
}

function testSearchSongWithAlbumIdStillRadio() {
  const track = song("abcdefghijk", {
    endpoint: { watchEndpoint: { videoId: "abcdefghijk", playlistId: "OLAKalbum01" } },
  });
  const others = [track, song("lmnopqrstuv"), song("wxyzaaaaaaa")];
  const ctx = P.resolvePlayContext({ source: "search", session: {} }, track, {
    sessionTracks: others,
  });
  assert.strictEqual(ctx.mode, "radio");
  assert.strictEqual(ctx.listId, "RDAMVMabcdefghijk");
}

function testStockSiteUntouched() {
  // Overlay on: hooks may act. Overlay off in any spelling: hands off.
  assert.strictEqual(P.stockSiteUntouched({ pref: "1", hasRoot: true }), false);
  assert.strictEqual(P.stockSiteUntouched({ pref: null, hasRoot: false, hasLaunch: false }), false);
  assert.strictEqual(P.stockSiteUntouched({ pref: "0" }), true);
  assert.strictEqual(P.stockSiteUntouched({ dataset: "off" }), true);
  assert.strictEqual(P.stockSiteUntouched({ pref: "1", hasLaunch: true, hasRoot: false }), true);
}

function testOverlayHooksStayOffWhenDisabled() {
  assert.strictEqual(P.overlayHooksActive({ pref: "0" }), false);
  assert.strictEqual(P.overlayHooksActive({ dataset: "off" }), false);
  assert.strictEqual(
    P.overlayHooksActive({ pref: "1", hasLaunch: true, hasRoot: false }),
    false
  );
  assert.strictEqual(P.overlayHooksActive({ pref: null, hasRoot: false, hasLaunch: false }), true);
  assert.strictEqual(P.overlayHooksActive({ pref: "1", hasRoot: true, hasLaunch: false }), true);
}

function testSearchSongStartsRadio() {
  const track = song("abcdefghijk");
  const ctx = P.resolvePlayContext({ source: "search", session: {} }, track, {
    sessionTracks: [track],
  });
  assert.strictEqual(ctx.mode, "radio");
  assert.strictEqual(ctx.listId, "RDAMVMabcdefghijk");
}

// A second host will have longer, non-11-character ids and may have no radio at
// all. playback-core must survive that; only the injected strategy changes.
function testOpaqueIdsHost() {
  P.configure({});
  try {
    const uris = [
      "spotify:track:4cOdK2wGLETKBW3PvgPWqT",
      "spotify:track:1301WleyT98MSxVHPZCA6M",
    ];
    const tracks = uris.map((uri) => ({ id: uri, title: uri }));

    assert.deepStrictEqual(P.adjacentInRoster(uris, uris[0], "next", true, -1), {
      id: uris[1],
      index: 1,
    });
    assert.deepStrictEqual(
      P.playableTracks(tracks).map((track) => track.id),
      uris,
      "opaque ids must not be filtered out as unplayable"
    );
    assert.strictEqual(P.trackId(tracks[0]), uris[0]);

    // No radio support: a host without autogenerated stations plays its own list.
    assert.strictEqual(P.radioFor(uris[0]), "");
    const ctx = P.resolvePlayContext({ source: "search", session: {} }, tracks[0], {
      sessionTracks: [tracks[0]],
    });
    assert.strictEqual(ctx.listId, "");

    // Concrete lists are not detected by a "RD" prefix.
    assert.strictEqual(P.isConcreteList("RDpretendRadio"), true);
    assert.strictEqual(P.listId("VLsomething"), "VLsomething");

    const owned = P.resolvePlayContext({ source: "songs", session: {} }, tracks[0], {
      sessionTracks: tracks,
    });
    assert.strictEqual(owned.mode, "list");
    assert.strictEqual(owned.ownList, true);
  } finally {
    P.configure(ytmIds);
  }
}

function testTrackIdPrefersCanonicalId() {
  assert.strictEqual(P.trackId({ id: "abc", videoId: "xyz" }), "abc");
  assert.strictEqual(P.trackId({ videoId: "xyz" }), "xyz");
  assert.strictEqual(P.trackId({}), "");
  assert.strictEqual(P.trackId(null), "");
  // A parser fallback id that is not playable must still be rejected on YTM.
  assert.strictEqual(P.playable(P.trackId({ id: "t:Some Song:3" })), false);
  assert.deepStrictEqual(P.playableTracks([{ id: "t:Some Song:3" }]), []);
}

function testRowKeyDedupesDuplicatePlaylistRows() {
  // Same video twice in one playlist: distinct setVideoIds must both survive.
  const host = {
    playlistId: "PLdupes",
    tracks: [
      song("abcdefghijk", { setVideoId: "row1" }),
      song("abcdefghijk", { setVideoId: "row2" }),
    ],
  };
  const merged = P.mergeQueueTracks(host.tracks, []);
  assert.strictEqual(merged.length, 2);
  assert.deepStrictEqual(
    merged.map((track) => track.setVideoId),
    ["row1", "row2"]
  );
}

function testShuffleOrderStable() {
  const prev = [song("aaaaaaaaaaa"), song("bbbbbbbbbbb"), song("ccccccccccc"), song("ddddddddddd")];
  // Shuffled: d, a, c, b
  const prevOrder = [3, 0, 2, 1];

  // Refresh drops b and appends e: surviving relative order must hold.
  const next = [song("aaaaaaaaaaa"), song("ccccccccccc"), song("ddddddddddd"), song("eeeeeeeeeee")];
  const order = P.shuffleOrderStable(prevOrder, prev, next);
  assert.deepStrictEqual(
    order.map((index) => next[index].videoId),
    ["ddddddddddd", "aaaaaaaaaaa", "ccccccccccc", "eeeeeeeeeee"],
    "survivors keep shuffled order, new tracks append"
  );

  // Identical roster: order passes through untouched.
  assert.deepStrictEqual(
    P.shuffleOrderStable(prevOrder, prev, prev),
    prevOrder,
    "unchanged roster keeps the exact order"
  );

  // No prior order: identity order.
  assert.deepStrictEqual(P.shuffleOrderStable(null, prev, next), [0, 1, 2, 3]);
}

function testShouldTakeOverAutoAdvance() {
  // Host advanced on its own: hands off.
  assert.strictEqual(
    P.shouldTakeOverAutoAdvance({ playerState: 1, playing: true, videoId: "b", fromId: "a" }),
    false
  );
  // Same video still loaded and player ENDED (state 0): take over.
  assert.strictEqual(
    P.shouldTakeOverAutoAdvance({ playerState: 0, playing: false, videoId: "a", fromId: "a" }),
    true
  );
  // Same video but user-PAUSED (state 2): never take over a user's pause.
  assert.strictEqual(
    P.shouldTakeOverAutoAdvance({ playerState: 2, playing: false, videoId: "a", fromId: "a" }),
    false
  );
  // No player state available: fall back to the playing flag.
  assert.strictEqual(
    P.shouldTakeOverAutoAdvance({ playerState: NaN, playing: false, videoId: "a", fromId: "a" }),
    true
  );
  assert.strictEqual(
    P.shouldTakeOverAutoAdvance({ playerState: NaN, playing: true, videoId: "a", fromId: "a" }),
    false
  );
  // Missing ids: no opinion.
  assert.strictEqual(P.shouldTakeOverAutoAdvance({ playerState: 0, videoId: "", fromId: "a" }), false);
  assert.strictEqual(P.shouldTakeOverAutoAdvance({ playerState: 0, videoId: "a", fromId: "" }), false);
  assert.strictEqual(P.shouldTakeOverAutoAdvance(), false);
}

function run() {
  testAdjacentRoster();
  testPendingSkipIndex();
  testHostQueueMatch();
  testResolveQueueTracks();
  testPlayHomeSongStartsRadio();
  testPlayPlaylistUsesNativeQueue();
  testPlayLikedUsesLm();
  testPlayAlbumCoverUsesPlaylist();
  testLibraryListIsOwned();
  testSuggestedStartsRadio();
  testMixUsesRadio();
  testAutoAdvanceOnlyWhenOwned();
  testPlayOpenedAlbumUsesQueue();
  testNowPlayingKeepsQueue();
  testRadioSessionDoesNotHijackHome();
  testSearchSongWithAlbumIdStillRadio();
  testSearchSongStartsRadio();
  testOverlayHooksStayOffWhenDisabled();
  testStockSiteUntouched();
  testOpaqueIdsHost();
  testTrackIdPrefersCanonicalId();
  testRowKeyDedupesDuplicatePlaylistRows();
  testShuffleOrderStable();
  testShouldTakeOverAutoAdvance();
  console.log("playback-core: 24 tests passed");
}

run();
