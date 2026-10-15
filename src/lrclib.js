// Lyrics straight from LRCLIB's search, for when Music Assistant finds none.
// Music Assistant asks LRCLIB's exact-match endpoint with the provider's title;
// a title LRCLIB lists differently ("That's It" against "That's It (feat. …)")
// misses, and misses are rate-limited (429). Search matches loosely, so the
// best hit by artist and length is taken here, once per track.
const SEARCH_URL = "https://lrclib.net/api/search";
const TIMEOUT_MS = 8000;
const DURATION_SLACK_S = 3;

// "That's It (feat. Future) [from GTA VI]" -> "that's it"
export function baseTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s*[([].*$/, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
}

// The hit to use from LRCLIB's search results, or null: same base title, the
// artist named, the length within a few seconds when both are known; timed
// lyrics before plain ones.
export function pickLyrics(results, { title, artist, album, duration }) {
  const want = baseTitle(title);
  const who = String(artist || "").toLowerCase();
  const fits = (Array.isArray(results) ? results : []).filter((r) => {
    if (!r || r.instrumental || !(r.syncedLyrics || r.plainLyrics)) return false;
    if (baseTitle(r.trackName) !== want) return false;
    if (who && String(r.artistName || "").toLowerCase().indexOf(who) < 0) return false;
    return !(duration > 0 && r.duration > 0) || Math.abs(r.duration - duration) <= DURATION_SLACK_S;
  });
  const rank = r => (r.syncedLyrics ? 100 : 0) +
    (album && String(r.albumName || "").toLowerCase() === album.toLowerCase() ? 10 : 0) -
    (duration > 0 && r.duration > 0 ? Math.abs(r.duration - duration) : DURATION_SLACK_S);
  fits.sort((a, b) => rank(b) - rank(a));
  const hit = fits[0];
  return hit ? { plain: hit.plainLyrics || "", lrc: hit.syncedLyrics || "" } : null;
}

// null means no matching recording. Transport errors stay retryable.
export async function searchLyrics({ title, artist, album, duration }, fetchImpl = typeof fetch === "function" ? fetch : null) {
  if (!fetchImpl || !baseTitle(title)) return null;
  const query = "?track_name=" + encodeURIComponent(baseTitle(title)) + (artist ? "&artist_name=" + encodeURIComponent(artist) : "");
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => abort && abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(SEARCH_URL + query, abort ? { signal: abort.signal } : {});
    if (!response.ok) throw new Error("Lyrics service unavailable (" + response.status + ")");
    return pickLyrics(await response.json(), { title, artist, album, duration });
  } finally {
    clearTimeout(timer);
  }
}
