// Lyrics straight from LRCLIB's search, for when Music Assistant finds none.
// Music Assistant asks LRCLIB's exact-match endpoint with the provider's title;
// a title LRCLIB lists differently ("That's It" against "That's It (feat. …)")
// misses, and misses are rate-limited (429). Search matches loosely, so the
// best hit by artist and length is taken here, once per track.
import { fingerprint } from "./song-lyrics.js";

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

// The parsed JSON of a GET on lrclib.net, or null for a 404 (no such record).
// Other failures (429, 5xx, a timeout, no network) throw and stay retryable.
async function request(url, fetchImpl) {
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => abort && abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, abort ? { signal: abort.signal } : {});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Lyrics service unavailable (" + response.status + ")");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const defaultFetch = () => (typeof fetch === "function" ? fetch : null);

export function searchUrl({ title, artist }) {
  return SEARCH_URL + "?track_name=" + encodeURIComponent(baseTitle(title)) + (artist ? "&artist_name=" + encodeURIComponent(artist) : "");
}

// null means no matching recording. Transport errors stay retryable.
export async function searchLyrics({ title, artist, album, duration }, fetchImpl = defaultFetch()) {
  if (!fetchImpl || !baseTitle(title)) return null;
  return pickLyrics(await request(searchUrl({ title, artist }), fetchImpl), { title, artist, album, duration });
}

// "Choose other lyrics" (docs/settings.md): up to six versions to pick from,
// each with its LRCLIB id. One per distinct lyric text; the same title by the
// artist first, then the closest length, then timed before plain. Nothing is
// dropped for its length: a much longer (live) version is listed, saying so.
export const CANDIDATE_LIMIT = 6;
export function lyricCandidates(results, { title, artist, duration }) {
  const want = baseTitle(title);
  const who = String(artist || "").toLowerCase();
  const seen = new Set();
  const list = [];
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || r.instrumental || !(r.syncedLyrics || r.plainLyrics) || !(Number(r.id) > 0)) continue;
    const sum = fingerprint(r.syncedLyrics || r.plainLyrics);
    if (seen.has(sum)) continue;
    seen.add(sum);
    list.push({
      id: Number(r.id), title: String(r.trackName || ""), artist: String(r.artistName || ""), album: String(r.albumName || ""),
      duration: Number(r.duration) > 0 ? Number(r.duration) : 0, timed: !!r.syncedLyrics, plain: r.plainLyrics || "", lrc: r.syncedLyrics || "", sum,
      same: baseTitle(r.trackName) === want && (!who || String(r.artistName || "").toLowerCase().indexOf(who) >= 0),
    });
  }
  const gap = c => (duration > 0 && c.duration > 0 ? Math.abs(c.duration - duration) : Infinity);
  list.sort((a, b) => (b.same - a.same) || (gap(a) - gap(b)) || (b.timed - a.timed));
  return list.slice(0, CANDIDATE_LIMIT);
}

// Throws (retryable) when LRCLIB fails; [] when it has nothing.
export async function searchCandidates(query, fetchImpl = defaultFetch()) {
  if (!fetchImpl || !baseTitle(query.title)) return [];
  return lyricCandidates(await request(searchUrl(query), fetchImpl), query);
}

// One record by its LRCLIB id: { plain, lrc }, or null when LRCLIB no longer has it.
export async function getLyrics(id, fetchImpl = defaultFetch()) {
  if (!fetchImpl || !(Number(id) > 0)) return null;
  const r = await request(SEARCH_URL.replace(/search$/, "get/") + Number(id), fetchImpl);
  if (!r || r.instrumental || !(r.syncedLyrics || r.plainLyrics)) return null;
  return { plain: r.plainLyrics || "", lrc: r.syncedLyrics || "" };
}
