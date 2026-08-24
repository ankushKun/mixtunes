#!/usr/bin/env node
/**
 * Copies the extension into Chromium and Firefox loadable folders.
 * Source manifest.json is Chromium MV3 (service_worker).
 * Packed Firefox swaps that for background.scripts (event page).
 *
 * Pattern from references/OldTwitter/pack.js, updated for MV3 on both browsers.
 * Background dual-key: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const BUILD = path.join(ROOT, "build");
const CHROMIUM_DIR = path.join(BUILD, "chromium");
const FIREFOX_DIR = path.join(BUILD, "firefox");

const IGNORE_TOP = new Set([
  ".git",
  ".github",
  ".agents",
  ".DS_Store",
  "node_modules",
  "build",
  "references",
  "tasks",
  "tests",
  "pack.js",
  "package.json",
  "package-lock.json",
  "jsconfig.json",
  "skills-lock.json",
  ".gitignore",
  ".gitmodules",
  "store",
  "docs",
  "README.md",
  "LICENSE",
]);

/** Skip Finder junk that AMO's linter flags (nested .DS_Store, AppleDouble, etc.). */
function shouldCopy(src) {
  const base = path.basename(src);
  if (base === ".DS_Store" || base === "__MACOSX" || base.startsWith("._")) {
    return false;
  }
  if (src.includes(`${path.sep}icons${path.sep}src`)) return false;
  return true;
}

function copyExtension(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(ROOT)) {
    if (IGNORE_TOP.has(name)) continue;
    fs.cpSync(path.join(ROOT, name), path.join(dest, name), {
      recursive: true,
      filter: shouldCopy,
    });
  }
}

function readManifest(dir) {
  const file = path.join(dir, "manifest.json");
  return {
    file,
    manifest: JSON.parse(fs.readFileSync(file, "utf8")),
  };
}

function writeManifest(file, manifest) {
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function patchFirefox(dir) {
  const { file, manifest } = readManifest(dir);
  manifest.background = { scripts: ["background.js"] };
  delete manifest.minimum_chrome_version;
  writeManifest(file, manifest);
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

resetDir(BUILD);
fs.mkdirSync(BUILD, { recursive: true });

copyExtension(CHROMIUM_DIR);
copyExtension(FIREFOX_DIR);
patchFirefox(FIREFOX_DIR);

function zipDir(dir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  // -X drops macOS extra fields; -x keeps Finder junk out even if it sneaks in.
  execFileSync(
    "zip",
    ["-r", "-X", "-q", zipPath, ".", "-x", "*.DS_Store", "-x", "**/.DS_Store", "-x", "__MACOSX/*", "-x", "*/__MACOSX/*", "-x", "*/._*"],
    { cwd: dir }
  );
}

const chromiumZip = path.join(BUILD, "chromium.zip");
const firefoxZip = path.join(BUILD, "firefox.zip");
zipDir(CHROMIUM_DIR, chromiumZip);
zipDir(FIREFOX_DIR, firefoxZip);

console.log("Packed:");
console.log(`  Chromium  ${path.relative(ROOT, CHROMIUM_DIR)}`);
console.log(`  Firefox   ${path.relative(ROOT, FIREFOX_DIR)}`);
console.log(`  Chromium zip  ${path.relative(ROOT, chromiumZip)}`);
console.log(`  Firefox zip   ${path.relative(ROOT, firefoxZip)}`);
