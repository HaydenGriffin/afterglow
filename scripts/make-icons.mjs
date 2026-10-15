#!/usr/bin/env node
// Usage: scripts/make-icons.mjs
// Draws the app's launcher icons as PNGs without any image library.
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The launcher icon in the poster's world: paper on ink, no brand accent.
// A sun setting on a horizon rule (the afterglow) over two lines of poster
// type. Shapes are in unit space; each pixel is supersampled 4×4.
const INK = [18, 20, 23];
const PAPER = [239, 235, 227];
const HORIZON = 0.6;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
function paper(x, y) {
  if (y < HORIZON && (x - 0.5) ** 2 + (y - HORIZON) ** 2 <= 0.27 ** 2) return true; // the sun, above the horizon
  return inRect(x, y, 0.14, HORIZON, 0.86, HORIZON + 0.035) // horizon rule
    || inRect(x, y, 0.14, 0.7, 0.7, 0.765) // title line
    || inRect(x, y, 0.14, 0.805, 0.52, 0.85); // second line
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const n = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) if (paper((x + (sx + 0.5) / n) / size, (y + (sy + 0.5) / n) / size)) hits++;
      const t = hits / (n * n), i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(INK[c] + (PAPER[c] - INK[c]) * t);
      px[i + 3] = 255;
    }
  }
  return px;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [["icon.png", 80], ["largeIcon.png", 130]]) {
  const file = join(root, "app", name);
  writeFileSync(file, png(size, draw(size)));
  console.log(`wrote app/${name} (${size}x${size})`);
}
