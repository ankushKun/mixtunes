#!/usr/bin/env node
/**
 * Keep product version strings aligned.
 *
 * Source of truth: package.json "version"
 * Also writes: package-lock.json (root), manifest.json, docs/index.html softwareVersion
 *
 * Usage:
 *   node sync-version.js           # sync from package.json
 *   node sync-version.js 0.1.2     # set package.json then sync
 *   npm version patch --no-git-tag-version # bumps package + lock, runs "version" script
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SEMVER = /^[0-9]+(\.[0-9]+){1,3}([+-][0-9A-Za-z.-]+)?$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function sync(version) {
  if (!SEMVER.test(version)) {
    console.error(`Invalid version: ${version} (expected semver like 0.1.2)`);
    process.exit(1);
  }

  const pkgPath = path.join(ROOT, "package.json");
  const lockPath = path.join(ROOT, "package-lock.json");
  const manifestPath = path.join(ROOT, "manifest.json");
  const docsPath = path.join(ROOT, "docs", "index.html");

  const pkg = readJson(pkgPath);
  pkg.version = version;
  writeJson(pkgPath, pkg);

  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = version;
    if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
    writeJson(lockPath, lock);
  }

  const manifest = readJson(manifestPath);
  manifest.version = version;
  writeJson(manifestPath, manifest);

  let docs = fs.readFileSync(docsPath, "utf8");
  const next = docs.replace(
    /"softwareVersion":\s*"[^"]*"/,
    `"softwareVersion": "${version}"`
  );
  if (next === docs && !docs.includes(`"softwareVersion": "${version}"`)) {
    console.error(`docs/index.html: missing softwareVersion field to update`);
    process.exit(1);
  }
  fs.writeFileSync(docsPath, next);

  console.log(`version -> ${version}`);
  console.log("  package.json");
  console.log("  package-lock.json");
  console.log("  manifest.json");
  console.log("  docs/index.html (softwareVersion)");
}

const arg = process.argv[2];
const pkgVersion = readJson(path.join(ROOT, "package.json")).version;
sync(arg || pkgVersion);
