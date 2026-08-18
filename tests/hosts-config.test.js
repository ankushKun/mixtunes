const assert = require("assert");
const fs = require("fs");
const path = require("path");

const hosts = require("../scripts/hosts-config");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
);

const sorted = (list) => [...new Set(list)].sort();

function testHostShape() {
  assert.ok(hosts.list.length > 0, "at least one host must be configured");
  for (const host of hosts.list) {
    assert.ok(host.id, "host needs an id");
    assert.ok(host.name, `${host.id} needs a name`);
    assert.ok(host.escapeParam, `${host.id} needs an escapeParam`);
    assert.strictEqual(
      host.origin,
      new URL(host.origin).origin,
      `${host.id} origin must be a bare origin`
    );
    for (const key of [
      "lcdIdle",
      "homeStatus",
      "signInLibrary",
      "signInItems",
      "overlayHint",
      "originalLabel",
      "originalTitle",
      "bootFail",
      "popupAlive",
      "popupOverlayHint",
      "popupOpen",
    ]) {
      assert.ok(host.strings?.[key], `${host.id} is missing strings.${key}`);
    }
  }
  assert.strictEqual(hosts.primary(), hosts.list[0]);
  assert.strictEqual(hosts.byId("ytm")?.id, "ytm");
  assert.strictEqual(hosts.byId("nope"), null);
}

function testForUrl() {
  const host = hosts.primary();
  assert.strictEqual(hosts.forUrl(`${host.origin}/watch?v=abc`)?.id, host.id);
  assert.strictEqual(hosts.forUrl(host.origin)?.id, host.id);
  assert.strictEqual(hosts.forUrl("https://example.com/"), null);
  assert.strictEqual(hosts.forUrl("not a url"), null);
  assert.strictEqual(hosts.forUrl(""), null);
  assert.strictEqual(hosts.forUrl(undefined), null);
  // Same host name on another origin must not match.
  assert.strictEqual(hosts.forUrl("http://music.youtube.com/"), null);
}

// MV3 needs literal match patterns in the manifest, so every origin is written
// twice. This is the guard that the two copies stay identical.
function testManifestOriginsMatch() {
  const expected = sorted(hosts.matchPatterns());

  assert.deepStrictEqual(
    sorted(manifest.host_permissions),
    expected,
    "manifest host_permissions drifted from hosts-config"
  );

  assert.ok(manifest.content_scripts.length > 0);
  manifest.content_scripts.forEach((block, index) => {
    assert.deepStrictEqual(
      sorted(block.matches),
      expected,
      `content_scripts[${index}].matches drifted from hosts-config`
    );
  });

  manifest.web_accessible_resources.forEach((block, index) => {
    assert.deepStrictEqual(
      sorted(block.matches),
      expected,
      `web_accessible_resources[${index}].matches drifted from hosts-config`
    );
  });
}

function testBackgroundOriginsMatch() {
  const background = fs.readFileSync(
    path.join(__dirname, "..", "background.js"),
    "utf8"
  );
  assert.ok(
    !/\bimportScripts\s*\(/.test(background),
    "service worker must not importScripts (Chrome NetworkError on reload)"
  );
  for (const origin of hosts.origins()) {
    assert.ok(
      background.includes(`"${origin}"`),
      `background.js is missing origin ${origin} from hosts-config`
    );
  }
  assert.ok(
    background.includes(`"${hosts.OFF_HOST_TITLE}"`),
    "background.js off-host title drifted from hosts-config"
  );
}

function testManifestReferencesRealFiles() {
  const files = new Set();
  for (const block of manifest.content_scripts) {
    for (const file of block.js || []) files.add(file);
  }
  for (const block of manifest.web_accessible_resources) {
    for (const file of block.resources || []) files.add(file);
  }
  files.add(manifest.background.service_worker);
  for (const file of files) {
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", file)),
      `manifest references a missing file: ${file}`
    );
  }
}

testHostShape();
testForUrl();
testManifestOriginsMatch();
testBackgroundOriginsMatch();
testManifestReferencesRealFiles();

console.log("hosts-config: 5 groups passed");
