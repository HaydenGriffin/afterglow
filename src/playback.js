// TV presentation data and commands. Music Assistant remains the playback owner.
import { authority } from "./relay.js";

export const VIEW_MODES = ["visuals", "track", "album", "lyrics"];
export const VIEW_LABELS = { visuals: "Visuals only", track: "Visuals + track", album: "Album", lyrics: "Lyrics" };
export function applyPresentationTrim(position, trimMs) { return Math.max(0, position - trimMs / 1000); }
export function timeLabel(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
// Music Assistant's image proxy only serves sizes 0, 80, 160, 256, 512 and 1024.
export function imageUrl(picture, host, size) {
  if (picture && /^[a-f0-9]{64}$/i.test(picture.proxy_id || "")) return "http://" + authority(host) + "/imageproxy/" + picture.proxy_id + "?size=" + size;
  if (picture && picture.remotely_accessible && /^(https?:\/\/|data:image\/svg\+xml;)/.test(picture.path || "")) return picture.path;
  return "";
}
export function thumbOf(item) {
  const pictures = (item && item.metadata && item.metadata.images) || [];
  return (item && item.image) || pictures.filter(i => i.type === "thumb")[0] || (item && item.album && item.album.image) || null;
}
export function trackInfo(item, host) {
  if (!item) return null;
  const media = item.media_item || {};
  const album = media.album || {};
  const image = imageUrl(item.image || thumbOf(media), host, 512);
  return { id: item.queue_item_id, title: media.name || item.name || "Unknown track",
    artist: (media.artists || []).map(a => a.name).filter(Boolean).join(", "),
    album: album.name || "", duration: item.duration || media.duration || 0, image, media };
}

// LRC can contain multiple timestamps per line and a signed millisecond offset.
// Keep only the current song, cap malformed/untrusted provider responses.
export function parseLyrics(value) {
  const text = String(value || "").slice(0, 100000);
  const offset = /\[offset:([+-]?\d+)\]/i.exec(text);
  const shift = offset ? Number(offset[1]) / 1000 : 0;
  const rows = [];
  for (const line of text.split(/\r?\n/).slice(0, 2000)) {
    const pattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    const stamps = []; let match;
    while ((match = pattern.exec(line))) stamps.push(Number(match[1]) * 60 + Number(match[2]) + Number("0." + (match[3] || "0")) + shift);
    const words = line.replace(/\[[^\]]*\]/g, "").replace(/<\d+:\d+(?:\.\d+)?>/g, "").trim();
    for (const at of stamps) rows.push({ at: Math.max(0, Math.round(at * 1000) / 1000), text: words });
  }
  return rows.sort((a, b) => a.at - b.at).slice(0, 2000);
}
export function lyricIndex(lines, position) {
  let lo = 0, hi = lines.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (lines[mid].at <= position) lo = mid + 1; else hi = mid; }
  return lo - 1;
}

export function createPlayback({ live, host, now = Date.now }) {
  let key = "", generation = 0, stopped = false;
  let lyrics = { status: "idle", lines: [], plain: "" };
  let items = [], itemsState = "idle", queueGeneration = 0;
  let nextQueueRead = 0, queueWanted = false, lyricsWanted = false;
  let busy = false, error = "";
  const cache = new Map(); // three songs at most
  function snapshot() {
    const current = live.playback;
    const queue = current && current.queue;
    const track = trackInfo(queue && queue.current_item, host);
    return { queue, track, player: current && current.player, connected: !!(current && current.connected),
      position: Math.min(track && track.duration || Infinity, Math.max(0, current && current.position || 0)),
      lyricPosition: current && current.lyricPosition != null ? current.lyricPosition : current && current.position || 0,
      next: trackInfo(queue && queue.next_item, host), lyrics, items, itemsState, busy, error };
  }
  async function readLyrics(track, gen) {
    if (!track || track.media.media_type !== "track") { lyrics = { status: "missing", lines: [], plain: "" }; return; }
    const uri = track.media.uri || track.id;
    if (cache.has(uri)) { lyrics = cache.get(uri); return; }
    lyrics = { status: "loading", lines: [], plain: "" };
    try {
      const result = await live.call("metadata/get_track_lyrics", { track: track.media });
      const lines = parseLyrics(result && result[1]);
      const plain = String(result && result[0] || "").slice(0, 50000);
      const value = { status: lines.length ? "timed" : plain ? "plain" : "missing", lines, plain };
      if (gen !== generation || stopped) return;
      cache.set(uri, value);
      if (cache.size > 3) cache.delete(cache.keys().next().value);
      lyrics = value;
    } catch (e) { if (gen === generation && !stopped) lyrics = { status: "error", lines: [], plain: "" }; }
  }
  async function readItems() {
    const state = snapshot();
    if (!state.queue || !state.connected || itemsState === "loading") return;
    const gen = ++queueGeneration, id = state.queue.queue_id;
    itemsState = "loading";
    nextQueueRead = now() + 5000;
    try {
      const result = await live.call("player_queues/items", { queue_id: id, offset: (state.queue.current_index == null ? -1 : state.queue.current_index) + 1, limit: 12 });
      if (gen !== queueGeneration || stopped || !snapshot().queue || snapshot().queue.queue_id !== id) return;
      items = (Array.isArray(result) ? result : []).slice(0, 12);
      itemsState = "ready";
    } catch (e) { if (gen === queueGeneration && !stopped) { itemsState = "error"; error = e.message; } }
  }
  return {
    snapshot,
    tick() {
      if (stopped) return;
      const s = snapshot();
      const nextKey = s.queue ? s.queue.queue_id + ":" + (s.track ? s.track.id : "") : "";
      if (nextKey !== key) { key = nextKey; generation++; queueGeneration++; lyrics = { status: "idle", lines: [], plain: "" }; items = []; itemsState = "idle"; nextQueueRead = 0; error = ""; }
      if (lyricsWanted && s.connected && s.track && lyrics.status === "idle") readLyrics(s.track, generation);
      if (queueWanted && now() >= nextQueueRead) readItems();
    },
    wantLyrics(on) { lyricsWanted = on; },
    wantQueue(on) { queueWanted = on; if (on) nextQueueRead = 0; },
    retryLyrics() { lyrics = { status: "idle", lines: [], plain: "" }; },
    async command(action, value) {
      const s = snapshot();
      if (busy) return false;
      if (!s.queue || !s.connected) { error = "No connected player. Start music in Music Assistant."; return false; }
      const id = s.queue.queue_id;
      let command = "player_queues/" + action, args = { queue_id: id };
      if (action === "seek") {
        if (!s.track || !s.track.duration) { error = "Seeking is unavailable for this stream."; return false; }
        args.position = Math.max(0, Math.min(Math.floor(s.track.duration), Math.round(value)));
      } else if (action === "play_index") args.index = value;
      else if (action === "shuffle") args.shuffle_enabled = !s.queue.shuffle_enabled;
      else if (action === "repeat") args.repeat_mode = value;
      else if (action === "autoplay") args.autoplay_enabled = !s.queue.autoplay_enabled;
      else if (action === "crossfade") args.crossfade_enabled = !s.queue.crossfade_enabled;
      else if (action === "volume") { command = "players/cmd/volume_set"; args = { player_id: id, volume_level: Math.max(0, Math.min(100, value)) }; }
      else if (action === "sleep") { command = "players/sleep_timer/" + (value ? "set" : "clear"); args = { player_id: id }; if (value) args.seconds = value * 60; }
      else if (action === "favorite") { command = "music/favorites/add_item"; args = { item: s.track && s.track.media.uri }; if (!args.item) return false; }
      else if (action === "play_media") { if (!value || !value.media) return false; args.media = value.media; args.option = value.option; }
      else if (action === "radio") {
        // Music Assistant 2.10 turns radio_mode into this provider uri itself; send it directly.
        const uri = s.track && s.track.media.uri; if (!uri) return false;
        command = "player_queues/play_media"; args.media = "radio_playlist://playlist/" + uri; args.option = "replace";
      }
      else if (action === "move_item") { args.queue_item_id = value.id; args.pos_shift = value.shift; }
      else if (action === "delete_item") args.item_id_or_index = value;
      else if (["previous", "next", "play_pause", "play", "pause"].indexOf(action) < 0) { error = "Unsupported action"; return false; }
      busy = true; error = "";
      try { await live.call(command, args); nextQueueRead = 0; return true; }
      catch (e) { error = e.message; return false; }
      finally { busy = false; }
    },
    stop() { stopped = true; generation++; queueGeneration++; itemsState = "idle"; lyrics = { status: "idle", lines: [], plain: "" }; },
    start() { stopped = false; nextQueueRead = 0; },
  };
}
