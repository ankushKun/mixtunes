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
      "continuationLabel",
      "continuationToast",
      "popupAlive",
      "popupOverlayHint",
      "popupOpen",
    ]) {
      assert.ok(host.strings?.[key], `${host.id} is missing strings.${key}`);
    }
    assert.ok(
      Array.isArray(host.sourceGroups) && host.sourceGroups.length > 0,
      `${host.id} needs a sourceGroups sidebar descriptor`
    );
    for (const group of host.sourceGroups) {
      assert.ok(group.id && group.label, `${host.id} sourceGroup needs id and label`);
      assert.ok(
        Array.isArray(group.sources),
        `${host.id} sourceGroup ${group.id} needs a sources array`
      );
      for (const item of group.sources) {
        assert.ok(
          item.source && item.label && item.icon,
          `${host.id} sourceGroup ${group.id} entry needs source, label, and icon`
        );
      }
    }
    if (host.moodCap != null) {
      assert.ok(
        Number.isInteger(host.moodCap) && host.moodCap > 0,
        `${host.id} moodCap must be a positive integer`
      );
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

function testManifestStoreReady() {
  assert.ok(
    !manifest.browser_specific_settings.gecko_android,
    "omit gecko_android until Firefox for Android is tested"
  );
  const geckoId = manifest.browser_specific_settings.gecko.id;
  assert.ok(
    /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(geckoId),
    `gecko id must be a durable email-like id, got ${geckoId}`
  );
  assert.ok(
    !/@local$/.test(geckoId),
    "gecko id @local cannot be used for AMO"
  );
  assert.ok(
    manifest.description.length > 0 && manifest.description.length <= 132,
    "Chrome short description must be 1–132 characters"
  );
  assert.ok(
    !/itunes/i.test(manifest.description),
    "store-facing description must not use the iTunes trademark"
  );
  assert.ok(
    !/itunes/i.test(manifest.name),
    "extension name must not use the iTunes trademark"
  );
  const docs = path.join(__dirname, "..", "docs");
  for (const file of ["index.html", "privacy.html", "css/mixtunes.css", "js/mixtunes.js"]) {
    assert.ok(fs.existsSync(path.join(docs, file)), `missing docs site file: ${file}`);
  }
}

function testPackExcludesStoreAndZips() {
  const { execFileSync } = require("child_process");
  const root = path.join(__dirname, "..");
  execFileSync("node", [path.join(root, "pack.js")], { cwd: root });
  const chromiumZip = path.join(root, "build", "chromium.zip");
  const firefoxZip = path.join(root, "build", "firefox.zip");
  assert.ok(fs.existsSync(chromiumZip), "chromium.zip missing");
  assert.ok(fs.existsSync(firefoxZip), "firefox.zip missing");
  const listing = execFileSync("zipinfo", ["-1", chromiumZip], {
    encoding: "utf8",
  });
  assert.ok(listing.includes("manifest.json"));
  assert.ok(!listing.split("\n").some((line) => line.startsWith("store/")));
  assert.ok(!listing.split("\n").some((line) => line.startsWith("docs/")));
  assert.ok(!listing.includes("pack.js"));
  const ff = JSON.parse(
    execFileSync("unzip", ["-p", firefoxZip, "manifest.json"], {
      encoding: "utf8",
    })
  );
  assert.deepStrictEqual(ff.background, { scripts: ["background.js"] });
  assert.ok(!ff.gecko_android && !ff.browser_specific_settings?.gecko_android);
}

testHostShape();
testForUrl();
testManifestOriginsMatch();
testBackgroundOriginsMatch();
testManifestReferencesRealFiles();
testManifestStoreReady();
testPackExcludesStoreAndZips();

console.log("hosts-config: 7 groups passed");
