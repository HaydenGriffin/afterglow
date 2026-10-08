#!/usr/bin/env bash
# Usage: npm run serve-ipk   (PORT=8138 by default)
# Serves dist/ so an installer on the TV can fetch a package by URL.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8138}"
IP="$(hostname -I | cut -d' ' -f1)"
for f in "$ROOT"/dist/*.ipk; do [ -e "$f" ] && echo "http://$IP:$PORT/$(basename "$f")"; done
exec python3 -m http.server "$PORT" --directory "$ROOT/dist"
