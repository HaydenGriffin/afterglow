#!/usr/bin/env node
// Usage: node scripts/version-icons.mjs <staged app dir>
// Renames the staged launcher icons to <name>-<version>.png and points
// appinfo.json at them, so a new release's icon reaches the TV's launcher.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: version-icons.mjs <staged app dir>");
const infoPath = join(dir, "appinfo.json");
const info = JSON.parse(readFileSync(infoPath, "utf8"));
for (const key of ["icon", "largeIcon"]) {
  const versioned = info[key].replace(/\.png$/, `-${info.version}.png`);
  renameSync(join(dir, info[key]), join(dir, versioned));
  info[key] = versioned;
}
writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n");
