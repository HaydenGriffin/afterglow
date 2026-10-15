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

// A group player or a sync leader with members: its volume is the group's.
export function isGroupPlayer(player) {
  if (!player) return false;
  return player.type === "group" || (player.group_members || []).filter(id => id !== player.player_id).length > 0;
}
export function volumeOf(player) {
  if (!player) return null;
  const level = isGroupPlayer(player) && player.group_volume != null ? player.group_volume : player.volume_level;
  return level == null ? null : level;
}

const TOGGLES = { shuffle: "shuffle_enabled", autoplay: "autoplay_enabled", crossfade: "crossfade_enabled" };
const LATEST = { volume: true, seek: true }; // presses that only need their last value
const ASSUME_MS = 4000; // how long a value just sent outranks the queue's own
const WAITING_MAX = 8;

export function createPlayback({ live, host, now = Date.now }) {
  let key = "", itemsKey = "", generation = 0, stopped = false;
  let lyrics = { status: "idle", lines: [], plain: "" };
  let items = [], itemsState = "idle", queueGeneration = 0;
  let nextQueueRead = 0, queueWanted = false, lyricsWanted = false;
  let busy = false, error = "";
  const waiting = []; // commands pressed while one is in flight
  let assumed = {}; // field -> {value, at}: sent, not yet reflected by Music Assistant
  const cache = new Map(); // three songs at most
  // What commands act on (follow.js target); a page without one acts on what is drawn.
  function targetOf(current) {
    const t = live.target !== undefined ? live.target : current && current.queue
      ? { queueId: current.queue.queue_id, name: current.queue.display_name, reason: "following", queue: current.queue, player: current.player, connected: current.connected } : null;
    if (!t) return null;
    const queue = t.queue || null;
    const drawn = !!(current && current.queue && queue && current.queue.queue_id === queue.queue_id);
    return { queueId: t.queueId, name: t.name || (queue && queue.display_name) || t.queueId, reason: t.reason, queue, player: t.player || null,
      connected: !!t.connected, drawn, track: trackInfo(queue && queue.current_item, host),
      position: drawn ? current.position || 0 : queue && queue.elapsed_time || 0 };
  }
  function snapshot() {
    const current = live.playback;
    const queue = current && current.queue;
    const track = trackInfo(queue && queue.current_item, host);
    return { queue, track, player: current && current.player, connected: !!(current && current.connected),
      position: Math.min(track && track.duration || Infinity, Math.max(0, current && current.position || 0)),
      lyricPosition: current && current.lyricPosition != null ? current.lyricPosition : current && current.position || 0,
      next: trackInfo(queue && queue.next_item, host), target: targetOf(current), lyrics, items, itemsState, busy, error };
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
    const target = snapshot().target;
    if (!target || !target.queue || !target.connected || itemsState === "loading") return;
    const gen = ++queueGeneration, id = target.queueId, q = target.queue;
    itemsState = "loading";
    nextQueueRead = now() + 5000;
    try {
      const result = await live.call("player_queues/items", { queue_id: id, offset: (q.current_index == null ? -1 : q.current_index) + 1, limit: 12 });
      const after = snapshot().target;
      if (gen !== queueGeneration || stopped || !after || after.queueId !== id) return;
      items = (Array.isArray(result) ? result : []).slice(0, 12);
      itemsState = "ready";
    } catch (e) { if (gen === queueGeneration && !stopped) { itemsState = "error"; error = e.message; } }
  }
  // A value just sent, until Music Assistant reports it or it grows old.
  function assumedOr(field, actual) {
    const a = assumed[field];
    if (!a || now() - a.at > ASSUME_MS || a.value === actual) { delete assumed[field]; return actual; }
    return a.value;
  }
  function assume(field, value) { assumed[field] = { value, at: now() }; }
  function seekBase(t) {
    const a = assumed.position;
    if (a && now() - a.at <= ASSUME_MS) return a.value + (t.queue.state === "playing" ? (now() - a.at) / 1000 : 0);
    return t.position;
  }
  // The Music Assistant command for a press, worked out when it is sent so
  // toggles and steps start from the value sent before. Returns
  // {command, args, field, sent} or an error message.
  function build(job, s) {
    const t = s.target, action = job.family, value = job.value;
    if (!t) return "No speaker found in Music Assistant.";
    if (!t.connected) return "Music Assistant is reconnecting. Try again shortly.";
    const id = t.queueId, q = t.queue || {};
    const out = { command: "player_queues/" + action, args: { queue_id: id } };
    const set = (field, sent) => { out.field = field; out.sent = sent; return sent; };
    if (action === "seek") {
      const duration = t.track && t.track.duration;
      if (!duration) return "Seeking is unavailable for this stream.";
      out.args.position = set("position", Math.max(0, Math.min(Math.floor(duration), Math.round(job.relative ? seekBase(t) + value : value))));
    } else if (action === "play_index") out.args.index = value;
    else if (TOGGLES[action]) out.args[TOGGLES[action]] = set(TOGGLES[action], !assumedOr(TOGGLES[action], !!q[TOGGLES[action]]));
    else if (action === "repeat") {
      const modes = ["off", "all", "one"];
      const from = Math.max(0, modes.indexOf(assumedOr("repeat_mode", q.repeat_mode || "off")));
      out.args.repeat_mode = set("repeat_mode", typeof value === "number" ? modes[(from + value + 30) % 3] : value);
    } else if (action === "volume") {
      const group = isGroupPlayer(t.player), level = volumeOf(t.player);
      if (level == null && job.relative) return "Volume is unavailable for this speaker.";
      const field = group ? "group_volume" : "volume_level";
      out.command = group ? "players/cmd/group_volume" : "players/cmd/volume_set";
      out.args = { player_id: id, volume_level: set(field, Math.max(0, Math.min(100, Math.round(job.relative ? assumedOr(field, level) + value : value)))) };
    }
    else if (action === "sleep") { out.command = "players/sleep_timer/" + (value ? "set" : "clear"); out.args = { player_id: id }; if (value) out.args.seconds = value * 60; }
    else if (action === "favorite") { out.command = "music/favorites/add_item"; out.args = { item: s.track && s.track.media.uri }; if (!out.args.item) return ""; }
    else if (action === "play_media") { if (!value || !value.media) return ""; out.args.media = value.media; out.args.option = value.option; }
    else if (action === "radio") {
      // Music Assistant 2.10 turns radio_mode into this provider uri itself; send it directly.
      const uri = s.track && s.track.media.uri; if (!uri) return "";
      out.command = "player_queues/play_media"; out.args.media = "radio_playlist://playlist/" + uri; out.args.option = "replace";
    }
    else if (action === "move_item") { out.args.queue_item_id = value.id; out.args.pos_shift = value.shift; }
    else if (action === "delete_item") out.args.item_id_or_index = value;
    else if (action === "transfer") {
      // Moves a queue (the target's unless named, since a pick may change the
      // target before a queued press is sent), keeping its place; Music
      // Assistant ungroups the destination itself.
      if (!value || !value.to) return "";
      out.args = { source_queue_id: value.from || id, target_queue_id: value.to };
      if (value.autoPlay != null) out.args.auto_play = value.autoPlay;
    } else if (action === "group") {
      if (!value || !(value.add || value.remove)) return "";
      out.command = "players/cmd/set_members"; out.args = { target_player: id };
      if (value.add) out.args.player_ids_to_add = [value.add]; else out.args.player_ids_to_remove = [value.remove];
    }
    else if (["previous", "next", "play_pause", "play", "pause"].indexOf(action) < 0) return "Unsupported action";
    return out;
  }
  async function send(job) {
    const built = build(job, snapshot());
    if (typeof built === "string") { if (built) error = built; return false; }
    try {
      await live.call(built.command, built.args);
      if (built.field) assume(built.field, built.sent);
      error = ""; nextQueueRead = 0; return true;
    } catch (e) { error = e.message; return false; }
  }
  async function drain() {
    if (busy || !waiting.length) return;
    const job = waiting.shift();
    busy = true;
    let ok = false;
    try { ok = await send(job); } finally { busy = false; }
    job.done.forEach(resolve => resolve(ok));
    drain();
  }
  return {
    snapshot,
    tick() {
      if (stopped) return;
      const s = snapshot();
      const nextKey = s.queue ? s.queue.queue_id + ":" + (s.track ? s.track.id : "") : "";
      if (nextKey !== key) { key = nextKey; generation++; lyrics = { status: "idle", lines: [], plain: "" }; error = ""; }
      // The queue panel lists what commands act on, which may not be what is drawn.
      const t = s.target, nextItems = t ? t.queueId + ":" + (t.track ? t.track.id : "") : "";
      if (nextItems !== itemsKey) { itemsKey = nextItems; queueGeneration++; items = []; itemsState = "idle"; nextQueueRead = 0; }
      if (lyricsWanted && s.connected && s.track && lyrics.status === "idle") readLyrics(s.track, generation);
      if (queueWanted && now() >= nextQueueRead) readItems();
    },
    wantLyrics(on) { lyricsWanted = on; },
    wantQueue(on) { queueWanted = on; if (on) nextQueueRead = 0; },
    retryLyrics() { lyrics = { status: "idle", lines: [], plain: "" }; },
    // Presses made while a command is in flight wait their turn instead of
    // being lost; repeated volume and seek presses collapse into one.
    // Resolves true once Music Assistant accepted the command.
    command(action, value) {
      return new Promise(resolve => {
        const family = action.replace(/_by$/, "");
        const relative = family !== action;
        const pending = LATEST[family] && waiting.filter(job => job.family === family)[0];
        if (pending) {
          if (relative) pending.value += value; else { pending.value = value; pending.relative = false; }
          pending.done.push(resolve);
          return;
        }
        if (waiting.length >= WAITING_MAX) return resolve(false);
        waiting.push({ family, value, relative, done: [resolve] });
        drain();
      });
    },
    stop() { stopped = true; generation++; queueGeneration++; itemsState = "idle"; lyrics = { status: "idle", lines: [], plain: "" }; },
    start() { stopped = false; nextQueueRead = 0; },
  };
}
