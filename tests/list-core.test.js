const assert = require("assert");
const L = require("../scripts/list-core");

function track(id, extra = {}) {
  return {
    videoId: id,
    title: extra.title || id,
    artist: extra.artist || "Artist",
    album: extra.album || "",
    artwork: extra.artwork || "",
    shelf: extra.shelf || "",
    duration: extra.duration || "3:00",
  };
}

function testVirtualWindowBasic() {
  const win = L.virtualWindow({
    count: 4000,
    rowHeight: 24,
    scrollTop: 2400,
    viewportHeight: 360,
    overscan: 8,
  });
  assert.ok(win.end - win.start <= Math.ceil(360 / 24) + 1 + 16);
  assert.ok(win.start >= 0);
  assert.ok(win.end <= 4000);
  assert.strictEqual(win.padTop, win.start * 24);
  assert.strictEqual(win.padBottom, (4000 - win.end) * 24);
  assert.ok(win.start <= Math.floor(2400 / 24));
  assert.ok(win.end >= Math.ceil((2400 + 360) / 24));
}

function testVirtualWindowClamps() {
  const top = L.virtualWindow({
    count: 10,
    rowHeight: 24,
    scrollTop: 0,
    viewportHeight: 200,
    overscan: 8,
  });
  assert.strictEqual(top.start, 0);
  assert.strictEqual(top.end, 10);
  assert.strictEqual(top.padTop, 0);
  assert.strictEqual(top.padBottom, 0);

  const empty = L.virtualWindow({
    count: 0,
    rowHeight: 24,
    scrollTop: 0,
    viewportHeight: 200,
    overscan: 8,
  });
  assert.strictEqual(empty.start, 0);
  assert.strictEqual(empty.end, 0);
  assert.strictEqual(empty.padTop, 0);
  assert.strictEqual(empty.padBottom, 0);
}

function testVirtualWindowHeader() {
  const win = L.virtualWindow({
    count: 200,
    rowHeight: 24,
    scrollTop: 100,
    viewportHeight: 400,
    overscan: 0,
    headerHeight: 26,
  });
  assert.strictEqual(win.start, Math.floor(Math.max(0, 100 - 26) / 24));
  assert.strictEqual(win.end, Math.min(200, Math.ceil((100 + 400 - 26) / 24)));
}

function testVirtualWindowPreservesScrollHeight() {
  const count = 4127;
  const rowHeight = 24;
  const win = L.virtualWindow({
    count,
    rowHeight,
    scrollTop: 18000,
    viewportHeight: 400,
    overscan: 8,
  });
  assert.strictEqual(
    win.padTop + (win.end - win.start) * rowHeight + win.padBottom,
    count * rowHeight
  );
}

function testVirtualWindowNeverMountsThousands() {
  for (const scrollTop of [0, 480, 12000, 95976]) {
    const win = L.virtualWindow({
      count: 4000,
      rowHeight: 24,
      scrollTop,
      viewportHeight: 400,
      overscan: 8,
    });
    assert.ok(
      win.end - win.start <= 40,
      `window at ${scrollTop} mounted ${win.end - win.start} rows`
    );
  }
}

function testScrollToRowIndex() {
  const rowHeight = 24;
  const viewportHeight = 240;
  const headerHeight = 26;
  const visible = L.scrollToRowIndex({
    scrollTop: 120,
    viewportHeight,
    headerHeight,
    rowIndex: 8,
    rowHeight,
  });
  assert.strictEqual(visible, 120);

  const above = L.scrollToRowIndex({
    scrollTop: 240,
    viewportHeight,
    headerHeight,
    rowIndex: 2,
    rowHeight,
  });
  assert.strictEqual(above, 2 * rowHeight);

  const below = L.scrollToRowIndex({
    scrollTop: 0,
    viewportHeight,
    headerHeight,
    rowIndex: 30,
    rowHeight,
  });
  assert.strictEqual(below, 30 * rowHeight + headerHeight + rowHeight - viewportHeight);
}

function testFlattenPlainTracks() {
  const owned = [track("aaaaaaaaaaa"), track("bbbbbbbbbbb")];
  const rows = L.flattenListRows({ owned, suggested: [], sectioned: false });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].kind, "track");
  assert.strictEqual(rows[0].index, 0);
  assert.strictEqual(rows[1].index, 1);
  assert.strictEqual(L.flattenIndexForTrack(rows, 1), 1);
}

function testFlattenSectionsAndSuggestions() {
  const owned = [
    track("aaaaaaaaaaa", { shelf: "Quick picks" }),
    track("bbbbbbbbbbb", { shelf: "Quick picks" }),
    track("ccccccccccc", { shelf: "Forgotten favorites" }),
  ];
  const suggested = [track("ddddddddddd")];
  const rows = L.flattenListRows({
    owned,
    suggested,
    sectioned: true,
    emptyOwnedMessage: "",
  });
  const kinds = rows.map((row) => `${row.kind}:${row.title || row.index}`);
  assert.deepStrictEqual(kinds, [
    "section:Quick picks",
    "track:0",
    "track:1",
    "section:Forgotten favorites",
    "track:2",
    "section:Suggestions",
    "track:3",
  ]);
  assert.strictEqual(L.flattenIndexForTrack(rows, 2), 4);
  assert.strictEqual(L.flattenIndexForTrack(rows, 3), 6);
  assert.strictEqual(L.flattenIndexForTrack(rows, 99), -1);
}

function testFlattenEmptyOwnedNotice() {
  const rows = L.flattenListRows({
    owned: [],
    suggested: [track("aaaaaaaaaaa")],
    emptyOwnedMessage: "This playlist is empty.",
  });
  assert.strictEqual(rows[0].kind, "empty");
  assert.strictEqual(rows[1].kind, "section");
  assert.strictEqual(rows[2].kind, "track");
  assert.strictEqual(rows[2].index, 0);
}

/** Automix tracks render as a separated section below the plain queue rows. */
function testFlattenAutomixSection() {
  const owned = [
    track("aaaaaaaaaaa"),
    track("bbbbbbbbbbb"),
    track("ccccccccccc", { shelf: "Automix", automix: true }),
    track("ddddddddddd", { shelf: "Automix", automix: true }),
  ];
  const rows = L.flattenListRows({ owned, suggested: [], sectioned: true });
  const kinds = rows.map((row) => `${row.kind}:${row.title || row.index}`);
  assert.deepStrictEqual(kinds, [
    "track:0",
    "track:1",
    "section:Automix",
    "track:2",
    "track:3",
  ]);
  assert.strictEqual(L.flattenIndexForTrack(rows, 2), 3);
}

function testCoversFromTracksGroupsAlbums() {
  const tracks = [
    track("aaaaaaaaaaa", { album: "Blue", artist: "Joni", title: "River" }),
    track("bbbbbbbbbbb", { album: "Blue", artist: "Joni", title: "Carey" }),
    track("ccccccccccc", { album: "", artist: "Solo", title: "Single" }),
  ];
  const covers = L.coversFromTracks(tracks);
  assert.strictEqual(covers.length, 2);
  assert.strictEqual(covers[0].id, "album:Blue:Joni");
  assert.strictEqual(covers[0].kind, "album");
  assert.strictEqual(covers[0].tracks.length, 2);
  assert.strictEqual(covers[0].videoId, "");
  assert.strictEqual(covers[1].kind, "song");
  assert.strictEqual(covers[1].videoId, "ccccccccccc");
  assert.strictEqual(covers[1].trackId, "ccccccccccc");
  assert.strictEqual(covers[1].tracks.length, 1);
}

// A second host names its ids `id` with no `videoId` alias. Grouping and matching
// must key off the canonical id either way.
function testCoversWorkWithoutVideoIdAlias() {
  const tracks = [
    { id: "spotify:track:1", title: "River", artist: "Joni", album: "Blue" },
    { id: "spotify:track:2", title: "Carey", artist: "Joni", album: "Blue" },
    { id: "spotify:track:3", title: "Single", artist: "Solo", album: "" },
  ];
  const covers = L.coversFromTracks(tracks);
  assert.strictEqual(covers.length, 2);
  assert.strictEqual(covers[1].id, "spotify:track:3");
  assert.strictEqual(covers[1].trackId, "spotify:track:3");
  assert.strictEqual(L.trackMatchesCover(tracks[0], covers[0]), true);
  assert.strictEqual(L.trackMatchesCover(tracks[2], covers[0]), false);
  assert.strictEqual(L.trackMatchesCover(tracks[2], covers[1]), true);
  assert.strictEqual(L.trackId(tracks[0]), "spotify:track:1");
  assert.strictEqual(L.trackId({ videoId: "aaaaaaaaaaa" }), "aaaaaaaaaaa");
  assert.strictEqual(L.trackId(null), "");
}

function testCoversFromTracksIsLinear() {
  const tracks = [];
  for (let i = 0; i < 4000; i += 1) {
    const album = `Album ${i % 400}`;
    tracks.push(
      track(`id${String(i).padStart(8, "0")}`.slice(0, 11), {
        album,
        artist: "A",
        title: `Song ${i}`,
      })
    );
  }
  const start = process.hrtime.bigint();
  const covers = L.coversFromTracks(tracks);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.strictEqual(covers.length, 400);
  assert.strictEqual(covers[0].tracks.length, 10);
  assert.ok(ms < 80, `coversFromTracks(4000) took ${ms.toFixed(1)}ms`);
}

function testTrackMatchesCover() {
  const song = track("aaaaaaaaaaa", { album: "Blue", artist: "Joni" });
  const covers = L.coversFromTracks([song, track("bbbbbbbbbbb", { album: "Blue", artist: "Joni" })]);
  assert.strictEqual(L.trackMatchesCover(song, covers[0]), true);
  assert.strictEqual(L.trackMatchesCover(track("zzzzzzzzzzz", { album: "Other" }), covers[0]), false);
  assert.strictEqual(L.trackMatchesCover(null, covers[0]), false);
}

/** Browse tint must not apply when the cover owns the entire visible list. */
function testBrowseHighlightOnlyForSubset() {
  const blue = [
    track("aaaaaaaaaaa", { album: "Blue", artist: "Joni" }),
    track("bbbbbbbbbbb", { album: "Blue", artist: "Joni" }),
  ];
  const mixed = [
    ...blue,
    track("ccccccccccc", { album: "Court", artist: "Joni" }),
  ];
  const cover = L.coversFromTracks(blue)[0];
  assert.strictEqual(
    L.browseHighlightActive(mixed, cover),
    true,
    "subset of a mixed list should highlight"
  );
  assert.strictEqual(
    L.browseHighlightActive(blue, cover),
    false,
    "full-list match (opened album) must keep zebra"
  );
  assert.strictEqual(L.browseHighlightActive(blue, null), false);
  assert.strictEqual(L.browseHighlightActive([], cover), false);
  assert.strictEqual(
    L.browseHighlightActive([blue[0]], cover),
    false,
    "single-row lists never need browse tint"
  );
}

function testBrowsePageCount() {
  assert.strictEqual(L.browsePageCount(), 2);
  assert.strictEqual(L.browsePageCount(2), 2);
  assert.strictEqual(L.browsePageCount("all"), 500);
  assert.strictEqual(L.browsePageCount(Infinity), 500);
  assert.strictEqual(L.browsePageCount(0), 2);
  assert.strictEqual(L.browsePageCount(4), 4);
}

function testLibraryUpdatePlan() {
  assert.strictEqual(L.libraryUpdatePlan({ paintedCount: 0, nextCount: 100, isFinal: false }), "paint");
  assert.strictEqual(L.libraryUpdatePlan({ paintedCount: 100, nextCount: 200, isFinal: false }), "status");
  assert.strictEqual(L.libraryUpdatePlan({ paintedCount: 100, nextCount: 4127, isFinal: true }), "paint");
  assert.strictEqual(L.libraryUpdatePlan({ paintedCount: 100, nextCount: 100, isFinal: true }), "skip");
  assert.strictEqual(L.libraryUpdatePlan({ paintedCount: 0, nextCount: 0, isFinal: true }), "paint");
  assert.strictEqual(L.libraryUpdatePlan({ paintedCount: 0, nextCount: 0, isFinal: false }), "status");
}

function testLibraryBrowsePages() {
  assert.strictEqual(L.libraryBrowsePages("liked"), "all");
  assert.strictEqual(L.libraryBrowsePages("songs"), "all");
  assert.strictEqual(L.libraryBrowsePages("playlist"), "all");
  assert.strictEqual(L.libraryBrowsePages("recents"), "all");
  assert.strictEqual(L.libraryBrowsePages("home"), 4);
  assert.strictEqual(L.libraryBrowsePages("explore"), 2);
}

function testResolveFollowOpts() {
  assert.deepStrictEqual(
    { pages: L.resolveFollowOpts(2).pages, hasProgress: Boolean(L.resolveFollowOpts(2).onProgress) },
    { pages: 2, hasProgress: false }
  );
  const streamed = L.resolveFollowOpts({
    pages: "all",
    onProgress() {},
    shouldStop() {
      return false;
    },
  });
  assert.strictEqual(streamed.pages, 500);
  assert.strictEqual(typeof streamed.onProgress, "function");
  assert.strictEqual(typeof streamed.shouldStop, "function");
}

function testSpacerRowHtml() {
  assert.strictEqual(L.spacerRowHtml(0), "");
  assert.ok(L.spacerRowHtml(96).includes("96px"));
  assert.ok(L.spacerRowHtml(96).includes("ytunes-virt-pad"));
}

const tests = [
  testVirtualWindowBasic,
  testVirtualWindowClamps,
  testVirtualWindowHeader,
  testVirtualWindowPreservesScrollHeight,
  testVirtualWindowNeverMountsThousands,
  testScrollToRowIndex,
  testFlattenPlainTracks,
  testFlattenSectionsAndSuggestions,
  testFlattenEmptyOwnedNotice,
  testFlattenAutomixSection,
  testCoversFromTracksGroupsAlbums,
  testCoversFromTracksIsLinear,
  testCoversWorkWithoutVideoIdAlias,
  testTrackMatchesCover,
  testBrowseHighlightOnlyForSubset,
  testBrowsePageCount,
  testLibraryUpdatePlan,
  testLibraryBrowsePages,
  testResolveFollowOpts,
  testSpacerRowHtml,
];

for (const test of tests) test();
console.log(`list-core: ${tests.length} tests passed`);
