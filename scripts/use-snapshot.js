#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/use-snapshot.js <snapshot-label> [--root samples/adventureworks-batches]"
  );
}

function copyFile(source, target) {
  fs.copyFileSync(source, target);
}

function main() {
  const argv = process.argv.slice(2);
  const label = argv[0];
  if (!label || label.startsWith("-")) {
    usage();
    process.exit(1);
  }

  let snapshotsRoot = "samples/adventureworks-batches";
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) {
      snapshotsRoot = argv[++i];
    }
  }

  const repoRoot = process.cwd();
  const snapshotDir = path.join(repoRoot, snapshotsRoot, label);
  const snapshotManifest = path.join(snapshotDir, "manifest.json");
  const snapshotCatalog = path.join(snapshotDir, "catalog.json");

  if (!fs.existsSync(snapshotManifest) || !fs.existsSync(snapshotCatalog)) {
    console.error(`Snapshot not found or incomplete: ${snapshotDir}`);
    process.exit(1);
  }

  const currentManifest = path.join(repoRoot, "manifest.json");
  const currentCatalog = path.join(repoRoot, "catalog.json");
  const backupManifest = path.join(repoRoot, "manifest_backup.json");
  const backupCatalog = path.join(repoRoot, "catalog_backup.json");

  if (!fs.existsSync(currentManifest) || !fs.existsSync(currentCatalog)) {
    console.error("Current manifest.json/catalog.json missing in project root.");
    process.exit(1);
  }

  copyFile(currentManifest, backupManifest);
  copyFile(currentCatalog, backupCatalog);
  copyFile(snapshotManifest, currentManifest);
  copyFile(snapshotCatalog, currentCatalog);

  const snapshotSources = path.join(snapshotDir, "sources.json");
  const currentSources = path.join(repoRoot, "sources.json");
  if (fs.existsSync(snapshotSources)) {
    copyFile(snapshotSources, currentSources);
  }

  console.log(`Applied snapshot: ${label}`);
  console.log("Backups updated: manifest_backup.json, catalog_backup.json");
}

main();
