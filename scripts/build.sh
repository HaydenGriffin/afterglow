#!/usr/bin/env bash
# Usage: scripts/build.sh
# Bundles src/main.js into app/app.js, writes app/config.js from
# config.local.json (development settings only), and puts the MilkDrop library
# and every preset into app/vendor/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATH="$ROOT/node_modules/.bin:$PATH"
OUT="$ROOT/app"

# OffscreenCanvas: code bundled into app.js falls back to it only inside a
# worker, which this app never is; defining it away keeps it out of the bundle.
VERSION="$(node -p "require('$ROOT/app/appinfo.json').version")"
esbuild "$ROOT/src/main.js" --bundle --format=iife --target=chrome68 --minify \
  --define:OffscreenCanvas=undefined --define:VIZ_VERSION="\"$VERSION\"" --log-level=warning --outfile="$OUT/app.js"

# esbuild lowers syntax only. Fail on APIs the TV's Chromium 68 does not have.
TOO_NEW='globalThis|\.flat\(|\.flatMap\(|Object\.fromEntries|\.replaceAll\(|\.at\(|\.matchAll\(|Promise\.allSettled|structuredClone|OffscreenCanvas'
if hits="$(grep -oE "$TOO_NEW" "$OUT/app.js" | sort -u)" && [ -n "$hits" ]; then
  echo "app.js uses APIs newer than Chromium 68:" >&2
  echo "$hits" >&2
  exit 1
fi

if [ -f "$ROOT/config.local.json" ]; then
  node -e 'process.stdout.write("window.VIS_CONFIG = " + JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))) + ";\n")' \
    "$ROOT/config.local.json" > "$OUT/config.js"
else
  echo "window.VIS_CONFIG = {};" > "$OUT/config.js"
fi

mkdir -p "$OUT/vendor"
rm -f "$OUT/vendor/butterchurnPresetsMinimal.min.js"
# Butterchurn (Music Assistant fork) ships ESM only; wrap it as a classic
# script that sets window.butterchurn, as the 2.x UMD build did. Not run
# through TOO_NEW: its OffscreenCanvas and Object.fromEntries uses sit behind
# a feature check or on the WASM preset path, which 2.4.7 presets never take.
# No --define:OffscreenCanvas here: that would break `new OffscreenCanvas` on
# TVs that have it.
# (stdin input resolves "butterchurn" against the working directory)
printf 'import Butterchurn from "butterchurn";\nwindow.butterchurn = Butterchurn;\n' \
  | (cd "$ROOT" && esbuild --bundle --format=iife --target=chrome68 --minify --log-level=warning \
      --sourcefile=vendor-butterchurn.js --outfile="$OUT/vendor/butterchurn.min.js")
node "$ROOT/scripts/make-presets.mjs"

echo "built app/app.js ($(wc -c < "$OUT/app.js") bytes), app/vendor/butterchurn.min.js ($(wc -c < "$OUT/vendor/butterchurn.min.js") bytes)"
