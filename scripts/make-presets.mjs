#!/usr/bin/env node
// Usage: scripts/make-presets.mjs
// Writes app/vendor/presets.js: every MilkDrop preset in the butterchurn-presets
// packs as window.vizmanPresets, and the frame rates measured on an LG CX
// (bench/lg-cx-webos5.json) as window.vizmanPresetBench, which a TV uses as
// its validated list until it has run its own scan.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = ["butterchurnPresets", "butterchurnPresetsExtra", "butterchurnPresetsExtra2", "butterchurnPresetsMD1"];
export const BENCH = join(root, "bench", "lg-cx-webos5.json");

// Every preset in the packs, by name.
export function allPresets() {
  const all = {};
  for (const pack of PACKS) {
    const loaded = require(`butterchurn-presets/lib/${pack}.min.js`);
    const presets = (loaded.default || loaded).getPresets();
    for (const name of Object.keys(presets)) if (!(name in all)) all[name] = presets[name];
  }
  return all;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = allPresets();
  const bench = JSON.parse(readFileSync(BENCH, "utf8")).fps || {};
  const seed = {};
  for (const name of Object.keys(all)) if (typeof bench[name] === "number") seed[name] = bench[name];
  const out = join(root, "app", "vendor");
  mkdirSync(out, { recursive: true });
  const text = "window.vizmanPresets = " + JSON.stringify(all) + ";\nwindow.vizmanPresetBench = " + JSON.stringify(seed) + ";\n";
  writeFileSync(join(out, "presets.js"), text);
  console.log(`wrote app/vendor/presets.js (${Object.keys(all).length} presets, ${Object.keys(seed).length} benchmarked, ${text.length} bytes)`);
}
