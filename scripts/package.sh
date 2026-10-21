#!/usr/bin/env bash
# Usage: npm run package
# Builds the app, packages it as dist/<id>_<version>_all.ipk, and writes the
# Homebrew Channel manifest next to it (dist/<id>.manifest.json).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATH="$ROOT/node_modules/.bin:$PATH"
"$ROOT/scripts/build.sh"
ares-package --check "$ROOT/app"
# The TV's launcher keeps showing the icon it first read from a path, so each
# release packages its icons under a versioned name.
STAGE="$(mktemp -d)/app"
trap 'rm -rf "$(dirname "$STAGE")"' EXIT
cp -R "$ROOT/app" "$STAGE"
node "$ROOT/scripts/version-icons.mjs" "$STAGE"
ares-package --no-minify -o "$ROOT/dist" "$STAGE"
node "$ROOT/scripts/make-manifest.mjs"
