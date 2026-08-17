const assert = require("assert");
const P = require("../scripts/playback-core");

const song = (id, extra = {}) => ({
  videoId: id,
  title: id,
  ...extra,
});

function testAdjacentRoster() {
  const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[0], "next", true, 0), {
    videoId: ids[1],
    index: 1,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[0], "next", true, 1), {
    videoId: ids[2],
    index: 2,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[2], "next", false, 2), {
    videoId: "",
    index: -1,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[2], "next", true, 2), {
    videoId: ids[0],
    index: 0,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[1], "previous", true, 1), {
    videoId: ids[0],
    index: 0,
  });
  assert.deepStrictEqual(P.adjacentInRoster(ids, ids[0], "previous", false, 0), {
    videoId: "",
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

function testParkRestoreAutoplay() {
  assert.strictEqual(P.shouldParkRestoreAutoplay({ hooksActive: true }), false);
  assert.strictEqual(P.shouldParkRestoreAutoplay({ hooksActive: false, hasGesture: true }), false);
  assert.strictEqual(P.shouldParkRestoreAutoplay({ hooksActive: false, parked: true }), false);
  assert.strictEqual(
    P.shouldParkRestoreAutoplay({ hooksActive: false, hasGesture: false, parked: false }),
    true
  );
}

function testNativeBarHasSong() {
  assert.strictEqual(P.nativeBarHasSong(null), false);
  assert.strictEqual(P.nativeBarHasSong({}), false);
  assert.strictEqual(P.nativeBarHasSong({ title: "YouTube Music" }), false);
  assert.strictEqual(P.nativeBarHasSong({ title: "yTunes" }), false);
  assert.strictEqual(P.nativeBarHasSong({ title: "Night Drive" }), true);
  assert.strictEqual(P.nativeBarHasSong({ videoId: "abcdefghijk" }), true);
}

function testShouldCueStoredTrack() {
  assert.strictEqual(
    P.shouldCueStoredTrack({ overlayOn: true, storedVideoId: "abcdefghijk" }),
    false
  );
  assert.strictEqual(
    P.shouldCueStoredTrack({
      overlayOn: false,
      barHasSong: true,
      storedVideoId: "abcdefghijk",
    }),
    false
  );
  assert.strictEqual(P.shouldCueStoredTrack({ overlayOn: false, storedVideoId: "" }), false);
  assert.strictEqual(
    P.shouldCueStoredTrack({ overlayOn: false, barHasSong: false, storedVideoId: "abcdefghijk" }),
    true
  );
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
  testParkRestoreAutoplay();
  testNativeBarHasSong();
  testShouldCueStoredTrack();
  console.log("playback-core: 21 tests passed");
}

run();
