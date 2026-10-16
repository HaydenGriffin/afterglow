// What Afterglow remembers about one song's lyrics: a timing kept for it and
// the LRCLIB lyrics chosen for it (docs/settings.md, Lyrics). The store is the
// `lyricsSongs` preference, so it follows the account like the other
// settings: [{ id, sum, ms?, lrclib?, at }], newest change last, at most
// SONG_LIMIT songs. `id` is the song's Music Assistant uri; `sum` the
// fingerprint of the lyrics the entry was made for, so a kept timing never
// moves other words. Every function here returns a new list.
export const SONGS_PREF = "lyricsSongs";
export const SONG_LIMIT = 100;
const ID_MAX = 300;
const OFFSET_LIMIT_MS = 10000;

// FNV-1a (32 bits) of the text's UTF-8, without carriage returns and outer
// whitespace: 8 hex digits, "" for no text. Afterglow for PS5 computes the same.
export function fingerprint(text) {
  const source = String(text || "").replace(/\r/g, "").trim();
  if (!source) return "";
  let hash = 0x811c9dc5;
  const byte = (b) => { hash = Math.imul(hash ^ b, 0x01000193) >>> 0; };
  for (const ch of source) {
    const c = ch.codePointAt(0);
    if (c < 0x80) byte(c);
    else if (c < 0x800) { byte(0xc0 | (c >> 6)); byte(0x80 | (c & 63)); }
    else if (c < 0x10000) { byte(0xe0 | (c >> 12)); byte(0x80 | ((c >> 6) & 63)); byte(0x80 | (c & 63)); }
    else { byte(0xf0 | (c >> 18)); byte(0x80 | ((c >> 12) & 63)); byte(0x80 | ((c >> 6) & 63)); byte(0x80 | (c & 63)); }
  }
  return hash.toString(16).padStart(8, "0");
}

const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= ID_MAX;
const validMs = (ms) => Number.isInteger(ms) && Math.abs(ms) <= OFFSET_LIMIT_MS;
const validChoice = (id) => Number.isInteger(id) && id > 0;

// The stored list as it can be trusted (a preference may come from anywhere).
export function readSongs(value) {
  const out = [];
  for (const e of Array.isArray(value) ? value.slice(-SONG_LIMIT * 2) : []) {
    if (!e || !validId(e.id) || typeof e.sum !== "string" || !/^[0-9a-f]{8}$/.test(e.sum)) continue;
    const entry = { id: e.id, sum: e.sum, at: Number(e.at) > 0 ? Number(e.at) : 0 };
    if (validMs(e.ms)) entry.ms = e.ms;
    if (validChoice(e.lrclib)) entry.lrclib = e.lrclib;
    if (entry.ms === undefined && entry.lrclib === undefined) continue;
    out.push(entry);
  }
  return trim(out.filter((e, i) => out.findIndex((o) => o.id === e.id) === i));
}

function trim(list) {
  if (list.length <= SONG_LIMIT) return list;
  const keep = new Set(list.slice().sort((a, b) => b.at - a.at).slice(0, SONG_LIMIT));
  return list.filter((e) => keep.has(e));
}

const find = (songs, id) => (validId(id) ? songs.find((e) => e.id === id) : undefined);

// The timing kept for this song and these lyrics, or null.
export function keptTiming(songs, id, sum) {
  const e = find(songs, id);
  return e && sum && e.sum === sum && e.ms !== undefined ? e.ms : null;
}

// The LRCLIB record chosen for this song, or 0.
export function chosenLyrics(songs, id) {
  const e = find(songs, id);
  return e && e.lrclib ? e.lrclib : 0;
}

function put(songs, id, change, now) {
  if (!validId(id)) return songs;
  const old = find(songs, id);
  const entry = Object.assign({}, old || { id }, change, { at: now });
  if (entry.ms === undefined) delete entry.ms;
  if (entry.lrclib === undefined) delete entry.lrclib;
  const rest = songs.filter((e) => e !== old);
  if (entry.ms === undefined && entry.lrclib === undefined) return rest;
  return trim(rest.concat([entry]));
}

// Keep (or change) this song's timing for the lyrics with fingerprint sum.
export function keepTiming(songs, id, sum, ms, now) {
  if (!sum || !validMs(ms)) return songs;
  const old = find(songs, id);
  // A chosen record stays chosen, unless the words are no longer its.
  const lrclib = old && old.sum === sum ? old.lrclib : undefined;
  return put(songs, id, { sum, ms, lrclib }, now);
}

export function forgetTiming(songs, id, now) {
  return find(songs, id) ? put(songs, id, { ms: undefined }, now) : songs;
}

// Use LRCLIB record `lrclib` (lyrics with fingerprint sum) for this song. A
// timing kept for other words no longer applies, so it goes.
export function chooseLyrics(songs, id, lrclib, sum, now) {
  if (!validChoice(lrclib) || !sum) return songs;
  return put(songs, id, { sum, lrclib, ms: undefined }, now);
}

export function clearChoice(songs, id, now) {
  return find(songs, id) ? put(songs, id, { lrclib: undefined }, now) : songs;
}

// "Keep this timing for this song?": offered once per song, while its
// device timing differs from what it was when the song came on.
export function createTimingOffer() {
  let key = "", base = 0, answered = false;
  return {
    // Each tick: the song (its key changes with every play) and the device timing.
    song(nextKey, deviceMs) {
      if (nextKey === key) return;
      key = nextKey; base = deviceMs; answered = false;
    },
    pending({ deviceMs, kept, timed, id }) {
      return !!key && !answered && kept === null && !!timed && validId(id) && deviceMs !== base;
    },
    get base() { return base; },
    answer() { answered = true; },
  };
}

// Where to seek so `line` (its LRC time, s) is the line on screen: the
// timing shows lyrics later by offsetMs, so the song is that much further on.
export function lineSeekPosition(lineAt, offsetMs, duration) {
  const at = Math.floor(lineAt + offsetMs / 1000);
  return Math.max(0, duration > 0 ? Math.min(Math.floor(duration), at) : at);
}
