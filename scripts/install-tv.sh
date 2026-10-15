#!/usr/bin/env bash
# Usage: scripts/install-tv.sh <tv-ip> [ipk]
# Installs a package on a rooted TV through Glasshouse's API: upload, wait for
# its preview, confirm. Glasshouse must have sideloading switched on. The app
# is stopped by the install; open it again on the TV afterwards.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TV="http://${1:?usage: install-tv.sh <tv-ip> [ipk]}:8080"
IPK="${2:-$(ls -t "$ROOT"/dist/*.ipk | head -1)}"
state() { curl -s -m 10 "$TV/api/apps/install/status" | node -p 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); [d.state, d.jobId||"", d.error||""].join(" ")'; }

echo "uploading $(basename "$IPK")"
curl -s -m 180 -X POST "$TV/api/apps/install/upload" -H 'Content-Type: application/octet-stream' \
  -H "Content-Length: $(wc -c < "$IPK" | tr -d '[:space:]')" --data-binary "@$IPK" | node -p 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!d.ok) { console.error("upload refused: "+d.error); process.exit(1) } "accepted"'
for _ in $(seq 1 60); do
  read -r STATE JOB ERROR <<<"$(state)"
  case "$STATE" in awaiting-confirm) break;; error) echo "install failed: $ERROR" >&2; exit 1;; esac
  sleep 2
done
[ "$STATE" = "awaiting-confirm" ] || { echo "no preview after two minutes (state $STATE)" >&2; exit 1; }
curl -s -m 30 -X POST "$TV/api/apps/install/confirm" -H 'Content-Type: application/json' -d "{\"jobId\":\"$JOB\",\"elevate\":false}" > /dev/null
for _ in $(seq 1 60); do
  read -r STATE JOB ERROR <<<"$(state)"
  case "$STATE" in installed) echo "installed"; exit 0;; error) echo "install failed: $ERROR" >&2; exit 1;; esac
  sleep 2
done
echo "still $STATE after two minutes" >&2
exit 1
