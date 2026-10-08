#!/usr/bin/env node
// Usage: MA_HOST=<host> MA_TOKEN=<token> scripts/backup-favorites.mjs
// Writes the account's MilkDrop favorites (as viz-man keeps them, and as
// Music Assistant's own list) to backups/favorites-<date>.json and
// backups/favorites-latest.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectApi } from "../src/ma.js";
import { favoriteNames } from "../src/settings.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.MA_HOST;
const token = process.env.MA_TOKEN;
if (!host || !token) {
  console.error("usage: MA_HOST=<host> MA_TOKEN=<token> backup-favorites.mjs");
  process.exit(1);
}

const api = await connectApi(host);
try {
  await api.call("auth", { token });
  const me = await api.call("auth/me");
  const prefs = (me && me.preferences) || {};
  const ours = prefs.vizman || {};
  const dated = favoriteNames(ours.favoritesMeta || {});
  const web = Array.isArray(prefs.visualizer_favorites) ? prefs.visualizer_favorites : [];
  const favorites = Array.from(new Set(dated.concat(web))).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const out = { savedAt: new Date().toISOString().slice(0, 19), count: favorites.length, favorites, favoritesMeta: ours.favoritesMeta || {} };
  const text = JSON.stringify(out, null, 1) + "\n";
  mkdirSync(join(root, "backups"), { recursive: true });
  writeFileSync(join(root, "backups", `favorites-${out.savedAt.slice(0, 10)}.json`), text);
  writeFileSync(join(root, "backups", "favorites-latest.json"), text);
  console.log(`${favorites.length} favorites (${dated.length} dated, ${web.length} in Music Assistant's list) for ${me.username}`);
} finally {
  api.close();
}
