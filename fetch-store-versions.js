#!/usr/bin/env node
/**
 * Snapshot Chrome Web Store, Firefox Add-ons, and GitHub release versions
 * into docs/versions.json for the marketing site.
 *
 * Chrome has no public CORS-open version API; this uses the same update
 * check Chrome itself does. AMO and GitHub have public JSON APIs.
 */
const fs = require("fs");
const path = require("path");

const CHROME_ID = "kaeebfmnanocpkfedmfgbkgjlihenjpm";
const FIREFOX_ID = "mixtunes@ankush.one";
const FIREFOX_SLUG = "mixtunes";
const GITHUB_REPO = "ankushKun/mixtunes";
const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/" + CHROME_ID;
const FIREFOX_STORE_URL =
  "https://addons.mozilla.org/firefox/addon/" + FIREFOX_SLUG + "/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 MixtunesVersionCheck/1";

function parseChromeUpdateXml(xml) {
  if (!xml) return null;
  const match = String(xml).match(
    /<updatecheck\b[^>]*\bversion="([0-9]+(?:\.[0-9]+){1,3})"/i
  );
  return match ? match[1] : null;
}

function parseGithubTag(tag) {
  if (!tag) return null;
  const match = String(tag).trim().match(/^v?([0-9]+(?:\.[0-9]+){1,3})$/i);
  return match ? match[1] : null;
}

function compareVersions(a, b) {
  const parts = (value) =>
    String(value || "")
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const x = left[i] || 0;
    const y = right[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function fetchText(url, headers) {
  const res = await fetch(url, {
    headers: Object.assign({ "User-Agent": UA }, headers || {}),
    redirect: "follow",
  });
  return res;
}

async function fetchChromeVersion() {
  const url =
    "https://clients2.google.com/service/update2/crx?os=mac&arch=x64" +
    "&os_arch=x86_64&nacl_arch=x86-64&prod=chromecrx&prodchannel=" +
    "&prodversion=131.0.6778.0&lang=en&acceptformat=crx3" +
    "&x=id%3D" +
    CHROME_ID +
    "%26v%3D0.0.0.0%26uc";
  const res = await fetchText(url);
  if (!res.ok) {
    throw new Error("Chrome update check HTTP " + res.status);
  }
  const version = parseChromeUpdateXml(await res.text());
  if (!version) throw new Error("Chrome update check missing version");
  return version;
}

async function fetchFirefoxListing() {
  const url =
    "https://addons.mozilla.org/api/v5/addons/addon/" +
    encodeURIComponent(FIREFOX_SLUG) +
    "/";
  const res = await fetchText(url);
  // Unlisted / in-review listings are 401 until AMO publishes the page.
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    return { version: null, url: FIREFOX_STORE_URL, status: "in_review" };
  }
  if (!res.ok) {
    throw new Error("AMO lookup HTTP " + res.status);
  }
  const data = await res.json();
  const version =
    (data.current_version && data.current_version.version) || null;
  const listingUrl = data.url || FIREFOX_STORE_URL;
  if (!version) {
    return { version: null, url: listingUrl, status: "in_review" };
  }
  return { version: version, url: listingUrl, status: "listed" };
}

async function fetchGithubLatest() {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  }
  const res = await fetchText(
    "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest",
    headers
  );
  if (!res.ok) {
    throw new Error("GitHub latest release HTTP " + res.status);
  }
  const data = await res.json();
  const version = parseGithubTag(data.tag_name);
  if (!version) {
    throw new Error("GitHub latest release has no semver tag");
  }
  return {
    version: version,
    tag: data.tag_name,
    url: data.html_url || "https://github.com/" + GITHUB_REPO + "/releases/latest",
  };
}

function meaningfulPayload(snapshot) {
  return {
    chrome: snapshot && snapshot.chrome,
    firefox: snapshot && snapshot.firefox,
    github: snapshot && snapshot.github,
  };
}

function shouldWrite(previous, next) {
  if (!previous) return true;
  return (
    JSON.stringify(meaningfulPayload(previous)) !==
    JSON.stringify(meaningfulPayload(next))
  );
}

async function collect() {
  const [chromeVersion, firefox, github] = await Promise.all([
    fetchChromeVersion(),
    fetchFirefoxListing(),
    fetchGithubLatest(),
  ]);
  return {
    chrome: {
      version: chromeVersion,
      url: CHROME_STORE_URL,
    },
    firefox: firefox,
    github: github,
    checkedAt: new Date().toISOString(),
  };
}

async function main() {
  const snapshot = await collect();
  const out = path.join(__dirname, "docs", "versions.json");
  let previous = null;
  if (fs.existsSync(out)) {
    previous = JSON.parse(fs.readFileSync(out, "utf8"));
  }
  if (!shouldWrite(previous, snapshot)) {
    console.log("unchanged", path.relative(__dirname, out));
    return;
  }
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log("wrote", path.relative(__dirname, out));
  console.log("  chrome ", snapshot.chrome.version);
  console.log(
    "  firefox",
    snapshot.firefox.version || snapshot.firefox.status
  );
  console.log("  github ", snapshot.github.version);
}

module.exports = {
  CHROME_ID,
  FIREFOX_ID,
  FIREFOX_SLUG,
  FIREFOX_STORE_URL,
  GITHUB_REPO,
  parseChromeUpdateXml,
  parseGithubTag,
  compareVersions,
  shouldWrite,
  collect,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
