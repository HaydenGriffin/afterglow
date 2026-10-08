#!/usr/bin/env node
// Usage: scripts/bench-presets.mjs [client]   (client defaults to "tv")
// Measures how fast a linked page renders every MilkDrop preset in the
// butterchurn-presets packs. Each preset is sent over the dev server's test
// link, shown for a few seconds, and its frame rate recorded in
// .dev/bench-<client>.json. Needs `npm run dev` running, the page linked with
// a `report` address, and music playing. Safe to interrupt and run again: it
// carries on from where it stopped.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allPresets } from "./make-presets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = process.argv[2] || "tv";
const server = `http://localhost:${process.env.PORT || 8137}`;
const statusFile = join(root, ".dev", `status-${client}.json`);
const resultFile = join(root, ".dev", `bench-${client}.json`);
const SETTLE_MS = 3000; // shader compile and the first frames
const SAMPLE_MS = 1100; // the page's frame-rate figure covers one second
const STALE_MS = 6000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function command(body) {
  const response = await fetch(`${server}/cmd`, { method: "POST", body: JSON.stringify(body) });
  const { sentTo } = await response.json();
  return sentTo.includes(client);
}

async function status() {
  await command({ type: "status" });
  await sleep(250);
  const report = JSON.parse(readFileSync(statusFile, "utf8"));
  report.age = Date.now() - Date.parse(report.receivedAt);
  return report;
}

const presets = allPresets();
const names = Object.keys(presets).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
const results = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, "utf8")) : {};
const todo = names.filter((name) => !(name in results));
console.log(`${names.length} presets, ${names.length - todo.length} already measured, ${todo.length} to go`);

if (!(await command({ type: "status" }))) {
  console.error(`no page linked as "${client}"`);
  process.exit(1);
}
await sleep(6000);

for (const name of todo) {
  if (!(await command({ type: "preset", name, preset: presets[name] }))) {
    console.error(`"${client}" is no longer linked; stopping`);
    break;
  }
  await sleep(SETTLE_MS);
  const first = await status();
  await sleep(SAMPLE_MS);
  const second = await status();
  if (second.age > STALE_MS) {
    results[name] = "no answer";
    writeFileSync(resultFile, JSON.stringify(results, null, 1));
    console.error(`no status from "${client}" after ${name}; stopping`);
    break;
  }
  if (!second.preset || String(second.idle).startsWith("true")) {
    console.error(`"${client}" shows ${second.preset || "no preset"}, idle=${second.idle}: MilkDrop must be running with music playing; stopping`);
    break;
  }
  const fps = Math.min(parseInt(first.fps, 10), parseInt(second.fps, 10));
  results[name] = fps;
  writeFileSync(resultFile, JSON.stringify(results, null, 1));
  console.log(`${String(fps).padStart(3)} fps  ${name}`);
}

const measured = Object.values(results).filter((v) => typeof v === "number");
console.log(`done: ${measured.length} measured; ${measured.filter((v) => v >= 50).length} at 50+ fps, ${measured.filter((v) => v >= 30 && v < 50).length} at 30-49, ${measured.filter((v) => v < 30).length} below 30`);
