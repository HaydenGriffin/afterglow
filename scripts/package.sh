#!/usr/bin/env bash
# Usage: npm run package
# Builds the app, packages it as dist/<id>_<version>_all.ipk, and writes the
# Homebrew Channel manifest next to it (dist/<id>.manifest.json).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATH="$ROOT/node_modules/.bin:$PATH"
"$ROOT/scripts/build.sh"
ares-package --check "$ROOT/app"
ares-package --no-minify -o "$ROOT/dist" "$ROOT/app"
node "$ROOT/scripts/make-manifest.mjs"
