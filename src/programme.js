// Tonight's programme: the songs this TV's queue played in the last few
// hours, set as a concert programme on the idle poster's request. Music
// Assistant's played history (music/recently_played_items for the queue,
// played after a timestamp) survives a restart but carries no artists or
// times; a session log kept while the app runs adds both, and the queue's own
// items add artists for songs the log missed. Offered, never opened by itself.
import { MONTHS } from "./playlists.js";

export const PROGRAMME_HOURS = 4;
export const PROGRAMME_MIN_SONGS = 3;
const LOG_LIMIT = 80;
const LOG_KEEP_MS = 12 * 3600 * 1000;
const HISTORY_LIMIT = 60;
const QUEUE_ITEMS_LIMIT = 100;
export const PROGRAMME_ROWS = 22; // two columns of eleven

const artistsOf = media => ((media && media.artists) || []).map(a => a && a.name).filter(Boolean).join(", ");
const pad = n => (n < 10 ? "0" : "") + n;
export function clockLabel(ms) { const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

// Songs as they start on a queue: { queueId, uri, title, artist, at }.
export function createSessionLog({ now = Date.now } = {}) {
  let entries = [], lastKey = "";
  return {
    get entries() { return entries; },
    // Called about once a second with what the screen follows.
    observe(queue) {
      const item = queue && queue.current_item, media = item && item.media_item;
      if (!queue || queue.state !== "playing" || !media || !media.uri || media.media_type !== "track") return;
      const key = queue.queue_id + ":" + item.queue_item_id;
      if (key === lastKey) return;
      lastKey = key;
      const at = now();
      entries = entries.filter(e => at - e.at < LOG_KEEP_MS).concat([{ queueId: queue.queue_id, uri: media.uri, title: media.name || item.name || "", artist: artistsOf(media), at }]);
      if (entries.length > LOG_LIMIT) entries = entries.slice(entries.length - LOG_LIMIT);
    },
  };
}

// The evening a moment belongs to: before 05:00 it is still the night before.
export function eveningOf(ms) {
  const d = new Date(ms);
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return d;
}
export function isTonight(ms) { const h = new Date(ms).getHours(); return h >= 17 || h < 5; }
export function headline(ms) {
  const day = eveningOf(ms);
  return { word: isTonight(ms) ? "Tonight" : "Today", date: day.getDate() + " " + MONTHS[day.getMonth()] };
}

export function historyArgs(queueId, nowMs) {
  return { limit: HISTORY_LIMIT, queue_id: queueId, media_types: ["track"], fully_played_only: false, played_after_timestamp: Math.floor(nowMs / 1000) - PROGRAMME_HOURS * 3600 };
}
export function queueItemsArgs(queueId) { return { queue_id: queueId, offset: 0, limit: QUEUE_ITEMS_LIMIT }; }

// The programme, oldest first: Music Assistant's history (newest first, one
// row per song) reversed, then songs only the log knows in the order they
// started. Artist and time from the log, else artists from the queue's items.
// history: null when Music Assistant could not say, so the log stands alone.
export function programmeSongs({ history, log, queueId, queueItems, nowMs }) {
  const since = nowMs - PROGRAMME_HOURS * 3600 * 1000;
  const mine = (log || []).filter(e => e.queueId === queueId && e.at >= since);
  const latest = {};
  mine.forEach(e => { latest[e.uri] = e; });
  const artists = {};
  (queueItems || []).forEach(q => { const m = q && q.media_item; if (m && m.uri && !artists[m.uri]) artists[m.uri] = artistsOf(m); });
  const songs = [], seen = {};
  const add = (uri, title, image) => {
    if (!uri || seen[uri]) return;
    seen[uri] = true;
    const e = latest[uri];
    songs.push({ uri, title: title || (e && e.title) || "Untitled", artist: (e && e.artist) || artists[uri] || "", at: e ? e.at : null, image: image || null });
  };
  if (Array.isArray(history)) history.slice().reverse().forEach(h => h && add(h.uri, h.name, h.image));
  mine.forEach(e => add(e.uri, e.title, null));
  return songs;
}

// Whether the idle poster offers it.
export function offered(songs) { return songs.length >= PROGRAMME_MIN_SONGS; }

// "14 songs · 19:40 to 22:15", or just the count when no time is known.
export function summary(songs) {
  const times = songs.map(s => s.at).filter(t => t != null);
  const count = songs.length + (songs.length === 1 ? " song" : " songs");
  if (!times.length) return count;
  const first = Math.min.apply(null, times), last = Math.max.apply(null, times);
  return count + " · " + clockLabel(first) + (last - first >= 60000 ? " to " + clockLabel(last) : "");
}
// The idle poster's line for the tile.
export function offerDetail(songs, queueName) {
  const times = songs.map(s => s.at).filter(t => t != null);
  const count = songs.length + " songs";
  if (times.length) return count + " since " + clockLabel(Math.min.apply(null, times));
  return queueName ? count + " on " + queueName : count;
}
// Two columns of eleven rows; past 22 songs the last row says how many more.
export function programmeColumns(songs) {
  const rows = songs.map((s, i) => ({ number: pad(i + 1), title: s.title, artist: s.artist, time: s.at != null ? clockLabel(s.at) : "" }));
  if (rows.length > PROGRAMME_ROWS) {
    const more = rows.length - (PROGRAMME_ROWS - 1);
    rows.splice(PROGRAMME_ROWS - 1, rows.length, { number: "", title: "and " + more + " more", artist: "", time: "", more: true });
  }
  const half = PROGRAMME_ROWS / 2;
  return [rows.slice(0, half), rows.slice(half)];
}
