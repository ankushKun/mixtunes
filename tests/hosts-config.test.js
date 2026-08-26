const assert = require("assert");
const fs = require("fs");
const path = require("path");

const hosts = require("../scripts/hosts-config");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
);
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
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
  const sitePing = manifest.content_scripts.find((block) =>
    (block.js || []).includes("scripts/store-ping.js")
  );
  assert.ok(sitePing, "manifest must ping the website regardless of install source");
  assert.deepStrictEqual(
    sitePing.matches,
    ["https://ankush.one/*", "http://localhost/*", "http://127.0.0.1/*"],
    "store-ping must run on the site and local preview"
  );
  manifest.content_scripts.forEach((block, index) => {
    if ((block.js || []).includes("scripts/store-ping.js")) return;
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
  assert.strictEqual(
    manifest.description,
    "Classic iTunes theme for Spotify, YouTube Music, SoundCloud and Apple Music",
    "store description must match the product summary"
  );
  assert.strictEqual(
    pkg.description,
    manifest.description,
    "package.json description must match manifest"
  );
  assert.strictEqual(
    pkg.version,
    manifest.version,
    "package.json version must match manifest (AMO reads manifest.json)"
  );
  const docsIndex = fs.readFileSync(
    path.join(__dirname, "..", "docs", "index.html"),
    "utf8"
  );
  assert.ok(
    docsIndex.includes(`"softwareVersion": "${manifest.version}"`),
    "docs/index.html softwareVersion must match manifest"
  );
  assert.strictEqual(
    require("../package-lock.json").version,
    manifest.version,
    "package-lock.json version must match manifest"
  );
  assert.ok(
    !/itunes/i.test(manifest.name),
    "extension name must not use the iTunes trademark"
  );
  const docs = path.join(__dirname, "..", "docs");
  for (const file of ["index.html", "privacy.html", "css/mixtunes.css", "js/mixtunes.js"]) {
    assert.ok(fs.existsSync(path.join(docs, file)), `missing docs site file: ${file}`);
  }
  const chromeStore =
    "https://chromewebstore.google.com/detail/kaeebfmnanocpkfedmfgbkgjlihenjpm";
  assert.ok(
    docsIndex.includes(chromeStore),
    "docs/index.html must link to the Chrome Web Store listing"
  );
  const docsJs = fs.readFileSync(path.join(docs, "js/mixtunes.js"), "utf8");
  assert.ok(
    docsJs.includes(chromeStore + "?utm_source=website"),
    "docs installer must use the Chrome Web Store URL with utm_source=website"
  );
  const firefoxStore = "https://addons.mozilla.org/firefox/addon/mixtunes/";
  assert.ok(
    docsJs.includes(firefoxStore + "?utm_source=website"),
    "docs installer must use the Firefox Add-ons listing URL with utm_source=website"
  );
  assert.ok(
    docsIndex.includes("data-build-pill"),
    "docs/index.html must include the installed / GitHub build pill"
  );
  ["chrome", "edge", "brave", "opera", "vivaldi", "arc", "chromium"].forEach((name) => {
    assert.ok(
      new RegExp(`data-browser="${name}"[\\s\\S]*?data-store-ver="chrome"`).test(docsIndex),
      `${name} must show the Chrome Web Store version`
    );
  });
  ["firefox", "zen-browser"].forEach((name) => {
    assert.ok(
      new RegExp(`data-browser="${name}"[\\s\\S]*?data-store-ver="firefox"`).test(docsIndex),
      `${name} must show the Firefox Add-ons version`
    );
  });
  assert.ok(
    docsJs.includes('classList.toggle("is-installed"') ||
      docsJs.includes("classList.toggle('is-installed'"),
    "pill must hide the installed half until a version is detected"
  );
  assert.ok(
    !docsJs.includes("Not installed here"),
    "uninstalled visitors must not see a not-installed label"
  );
  assert.ok(
    !docsIndex.includes("data-versions"),
    "the four-cell versions board must not return"
  );
  assert.ok(
    docsJs.includes("kaeebfmnanocpkfedmfgbkgjlihenjpm"),
    "docs installer must ping the Chrome Web Store extension id"
  );
  const versionsPath = path.join(docs, "versions.json");
  assert.ok(fs.existsSync(versionsPath), "docs/versions.json missing");
  const versions = JSON.parse(fs.readFileSync(versionsPath, "utf8"));
  assert.ok(versions.chrome && "version" in versions.chrome, "versions.json needs chrome.version");
  assert.ok(versions.firefox && "status" in versions.firefox, "versions.json needs firefox.status");
  assert.ok(
    versions.firefox.url && versions.firefox.url.includes("/addon/mixtunes"),
    "versions.json firefox.url must be the AMO listing"
  );
  assert.ok(versions.github && versions.github.version, "versions.json needs github.version");
  assert.ok(versions.checkedAt, "versions.json needs checkedAt");
  assert.deepStrictEqual(
    manifest.externally_connectable.matches,
    ["https://ankush.one/*", "http://localhost/*", "http://127.0.0.1/*"],
    "externally_connectable must allow the site and local preview only"
  );
  assert.ok(
    !manifest.externally_connectable.ids,
    "omit externally_connectable.ids so other extensions cannot connect"
  );
  const background = fs.readFileSync(
    path.join(__dirname, "..", "background.js"),
    "utf8"
  );
  assert.ok(
    background.includes("onMessageExternal"),
    "background.js must answer version pings from the website"
  );
  assert.ok(
    fs.existsSync(path.join(__dirname, "..", "scripts", "store-ping.js")),
    "store-ping script missing"
  );
  assert.ok(
    docsJs.includes("version-please"),
    "site must handshake so a late-injected store-ping still reports"
  );
}

function testStoreVersionParsers() {
  const {
    parseChromeUpdateXml,
    parseGithubTag,
    compareVersions,
    shouldWrite,
    CHROME_ID,
    FIREFOX_ID,
    FIREFOX_SLUG,
    FIREFOX_STORE_URL,
    GITHUB_REPO,
  } = require("../fetch-store-versions");

  assert.strictEqual(CHROME_ID, "kaeebfmnanocpkfedmfgbkgjlihenjpm");
  assert.strictEqual(FIREFOX_ID, "mixtunes@ankush.one");
  assert.strictEqual(FIREFOX_SLUG, "mixtunes");
  assert.strictEqual(
    FIREFOX_STORE_URL,
    "https://addons.mozilla.org/firefox/addon/mixtunes/"
  );
  assert.strictEqual(GITHUB_REPO, "ankushKun/mixtunes");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><gupdate xmlns="http://www.google.com/update2/response" protocol="2.0" server="prod"><app appid="${CHROME_ID}" status="ok"><updatecheck codebase="https://example/x.crx" status="ok" version="0.1.2"/></app></gupdate>`;
  assert.strictEqual(parseChromeUpdateXml(xml), "0.1.2");
  assert.strictEqual(parseChromeUpdateXml("<gupdate></gupdate>"), null);

  assert.strictEqual(parseGithubTag("v0.1.2"), "0.1.2");
  assert.strictEqual(parseGithubTag("0.2.0"), "0.2.0");
  assert.strictEqual(parseGithubTag(""), null);

  assert.strictEqual(compareVersions("0.1.3", "0.1.2"), 1);
  assert.strictEqual(compareVersions("0.1.2", "0.1.2"), 0);
  assert.strictEqual(compareVersions("0.1.2", "v0.1.3"), -1);
  assert.strictEqual(compareVersions("0.1.10", "0.1.9"), 1);
  assert.strictEqual(
    shouldWrite(null, { chrome: { version: "0.1.2" } }),
    true
  );
  assert.strictEqual(
    shouldWrite(
      {
        chrome: { version: "0.1.2" },
        firefox: { status: "in_review" },
        github: { version: "0.1.2" },
        checkedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        chrome: { version: "0.1.2" },
        firefox: { status: "in_review" },
        github: { version: "0.1.2" },
        checkedAt: "2026-08-26T00:00:00.000Z",
      }
    ),
    false
  );
  assert.strictEqual(
    shouldWrite(
      {
        chrome: { version: "0.1.2" },
        firefox: { status: "in_review" },
        github: { version: "0.1.2" },
      },
      {
        chrome: { version: "0.1.2" },
        firefox: { status: "in_review" },
        github: { version: "0.1.3" },
      }
    ),
    true
  );
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
  assert.ok(!listing.includes("fetch-store-versions.js"));
  assert.ok(
    listing.split("\n").some((line) => line.includes("store-ping.js")),
    "Chromium zip must include store-ping.js so unpacked / GitHub loads report a version"
  );
  const cr = JSON.parse(
    execFileSync("unzip", ["-p", chromiumZip, "manifest.json"], {
      encoding: "utf8",
    })
  );
  const chromiumPing = cr.content_scripts.find((block) =>
    (block.js || []).includes("scripts/store-ping.js")
  );
  assert.ok(chromiumPing, "Chromium pack must inject store-ping.js on the website");
  assert.deepStrictEqual(
    chromiumPing.matches,
    ["https://ankush.one/*", "http://localhost/*", "http://127.0.0.1/*"]
  );
  assert.ok(
    !listing.split("\n").some((line) => /(^|\/)\.DS_Store$/.test(line) || line.includes("__MACOSX")),
    "extension zip must not include Finder junk (.DS_Store / __MACOSX)"
  );
  const ffListing = execFileSync("zipinfo", ["-1", firefoxZip], {
    encoding: "utf8",
  });
  assert.ok(
    !ffListing.split("\n").some((line) => /(^|\/)\.DS_Store$/.test(line) || line.includes("__MACOSX")),
    "firefox zip must not include Finder junk (.DS_Store / __MACOSX)"
  );
  const ff = JSON.parse(
    execFileSync("unzip", ["-p", firefoxZip, "manifest.json"], {
      encoding: "utf8",
    })
  );
  assert.deepStrictEqual(ff.background, { scripts: ["background.js"] });
  assert.ok(!ff.gecko_android && !ff.browser_specific_settings?.gecko_android);
  assert.ok(
    !ff.externally_connectable,
    "Firefox pack must drop externally_connectable (unsupported for web pages)"
  );
  const sitePing = ff.content_scripts.find((block) =>
    (block.js || []).includes("scripts/store-ping.js")
  );
  assert.ok(sitePing, "Firefox pack must inject store-ping.js on the website");
  assert.deepStrictEqual(sitePing.matches, ["https://ankush.one/*"]);
  assert.ok(
    ffListing.split("\n").some((line) => line.includes("store-ping.js")),
    "Firefox zip must include store-ping.js"
  );
}

testHostShape();
testForUrl();
testManifestOriginsMatch();
testBackgroundOriginsMatch();
testManifestReferencesRealFiles();
testManifestStoreReady();
testStoreVersionParsers();
testPackExcludesStoreAndZips();

console.log("hosts-config: 8 groups passed");
