#!/usr/bin/env node
// Usage: npm run build && node scripts/showcase.mjs
// Renders the README images from the demo (mock) at 1920x1080:
//   docs/images/hero.jpg   the Lyrics view mid-line, MilkDrop behind the artwork
//   docs/images/views.jpg  album, browse, queue and idle (docs/screenshots) in a grid
// Needs Playwright, which is not a dependency:
//   npm install --no-save playwright-core && npx playwright-core install chromium
// The page is served from memory through request routing, so nothing listens
// on a port and the demo's only requests are for its own files.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://afterglow.test";
const TYPES = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
const DEMO_CONFIG = 'window.AFTERGLOW_CONFIG = {"mock":true};\n';
const GRID = ["album", "browse", "queue", "idle"];

function file(path) {
  if (path === "/config.js") return { body: DEMO_CONFIG, type: TYPES[".js"] };
  if (path === "/views.html") return { body: gridPage(), type: TYPES[".html"] };
  const base = path.startsWith("/docs/") ? root : join(root, "app");
  const full = normalize(join(base, path === "/" ? "index.html" : path));
  if (!full.startsWith(root + sep)) return null;
  try {
    return { body: readFileSync(full), type: TYPES[extname(full)] || "application/octet-stream" };
  } catch (e) {
    return null;
  }
}

function gridPage() {
  const cells = GRID.map(name => `<img src="/docs/screenshots/${name}.jpg" alt="">`).join("");
  return `<!DOCTYPE html><meta charset="utf-8"><style>
    html, body { margin: 0; width: 1920px; height: 1080px; background: #000; }
    body { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 16px; padding: 16px; box-sizing: border-box; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  </style>${cells}`;
}

async function hero(page) {
  await page.addInitScript(() => {
    localStorage.setItem("afterglow.viewMode", JSON.stringify("lyrics"));
    localStorage.setItem("afterglow.playerBackground", "true");
  });
  await page.goto(ORIGIN + "/");
  // The demo's second line is sung word by word from 0:35; catch it mid-line.
  await page.waitForFunction(() => document.body.innerText.includes("\n0:36\n"), null, { timeout: 30000 });
  await page.screenshot({ path: join(root, "docs/images/hero.jpg"), type: "jpeg", quality: 88 });
}

async function views(page) {
  await page.goto(ORIGIN + "/views.html");
  await page.waitForFunction(() => Array.from(document.images).every(i => i.complete && i.naturalWidth));
  await page.screenshot({ path: join(root, "docs/images/views.jpg"), type: "jpeg", quality: 85 });
}

mkdirSync(join(root, "docs/images"), { recursive: true });
const browser = await chromium.launch({ channel: "chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(ORIGIN + "/**", route => {
    const found = file(new URL(route.request().url()).pathname);
    return found ? route.fulfill({ status: 200, contentType: found.type, body: found.body }) : route.fulfill({ status: 404, body: "" });
  });
  await page.route(url => !url.href.startsWith(ORIGIN) && !url.href.startsWith("data:"), route => {
    console.error("blocked request:", route.request().url());
    return route.abort();
  });
  await hero(page);
  await views(page);
  console.log("wrote docs/images/hero.jpg and docs/images/views.jpg");
} finally {
  await browser.close();
}
