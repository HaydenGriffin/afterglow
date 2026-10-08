#!/usr/bin/env node
// Usage: scripts/make-manifest.mjs [ipk]   (default: the newest in dist/)
// Writes dist/<id>.manifest.json, the file the webOS Homebrew Channel reads
// from a GitHub release to find and verify the package.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const info = JSON.parse(readFileSync(join(root, "app", "appinfo.json"), "utf8"));
const REPO = "https://github.com/mnestrud/viz-man";

const ipk =
  process.argv[2] ||
  readdirSync(dist)
    .filter((f) => f.endsWith(".ipk"))
    .map((f) => join(dist, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!ipk) {
  console.error("no .ipk in dist/; run npm run package first");
  process.exit(1);
}

const manifest = {
  id: info.id,
  version: info.version,
  type: info.type,
  title: info.title,
  appDescription: "MilkDrop visualizer for Music Assistant: draws what your speakers are playing, in time with it.",
  iconUri: `https://raw.githubusercontent.com/mnestrud/viz-man/v${info.version}/app/largeIcon.png`,
  sourceUrl: REPO,
  rootRequired: false,
  ipkUrl: basename(ipk),
  ipkHash: { sha256: createHash("sha256").update(readFileSync(ipk)).digest("hex") },
};
const out = join(dist, `${info.id}.manifest.json`);
writeFileSync(out, JSON.stringify(manifest) + "\n");
console.log(`wrote ${out} for ${basename(ipk)} (${manifest.ipkHash.sha256.slice(0, 12)}…)`);
