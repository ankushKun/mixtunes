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
  "pack.js",
  "package.json",
  "package-lock.json",
  "jsconfig.json",
  "skills-lock.json",
  ".gitignore",
  ".gitmodules",
]);

function copyExtension(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(ROOT)) {
    if (IGNORE_TOP.has(name)) continue;
    fs.cpSync(path.join(ROOT, name), path.join(dest, name), {
      recursive: true,
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

console.log("Packed:");
console.log(`  Chromium  ${path.relative(ROOT, CHROMIUM_DIR)}`);
console.log(`  Firefox   ${path.relative(ROOT, FIREFOX_DIR)}`);
