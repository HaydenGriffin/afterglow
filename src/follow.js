// Decides which player the relay should watch, and reports what it is
// playing. The relay binds to one player per connection and never switches,
// so this keeps Music Assistant's player and queue lists through its API
// socket (every client gets its events; snapshots reconcile now and then)
// and asks pick.js what to watch whenever they change. While streaming it
// also polls the watched queue for its track.
//   ws://<host>:8095/ws: server info, then {command:"auth"}, then commands.

import { authority } from "./relay.js";
import { favoritesFromList, mergeFavorites } from "./settings.js";
import { choose, isSkipped, speakersOf } from "./pick.js";

const RECONCILE_MS = 10000; // snapshot of players and queues while waiting
const RECONCILE_STREAMING_MS = 30000; // and while streaming (events carry the rest)
const CHOOSE_DEBOUNCE_MS = 300; // events come in bursts
const TRACK_POLL_MS = 4000;
const SAVE_DEBOUNCE_MS = 1500;
const PREFS_KEY = "vizman"; // our entry in the user's preferences
const MA_FAVORITES_KEY = "visualizer_favorites"; // Music Assistant's own MilkDrop favorites
const REMOTE_REFRESH_MS = 60000; // how often another TV's changes are picked up
const RESUME_MS = 3000; // wait this long after a stream ends before looking elsewhere
const NO_FRAMES_MS = 5000; // a "playing" queue that sends nothing by then is skipped
const RETRY_MS = 3000;
const HANDSHAKE_MS = 10000; // an API socket must be logged in by then
const EVENTS = {
  player_added: "players",
  player_updated: "players",
  player_removed: "players",
  queue_added: "queues",
  queue_updated: "queues",
  queue_removed: "queues",
};

export function createFollow({ host, token, pinned, preferred, relay, WebSocketImpl, onState, onTrack, onRemotePrefs, deviceId, sharedKeys, now }) {
  const Socket = WebSocketImpl || WebSocket;
  const clock = now || Date.now;
  let socket = null;
  let generation = 0;
  let active = false;
  let authed = false;
  let streaming = false;
  let current = ""; // the queue the relay is given
  let following = null; // {queueId, playerId, name, reason} for the readout
  let expectFramesAt = 0; // frames are due within NO_FRAMES_MS of this
  let pollTimer = 0;
  let trackTimer = 0;
  let retryTimer = 0;
  let resumeTimer = 0;
  let chooseTimer = 0;
  let helloTimer = 0;
  let state = "idle";
  let trackId = null;
  let remotePrefs = null; // the user's whole preferences object, once read
  let base = null; // shared values as last synced with the account
  const syncLog = []; // what was read and saved, for the debug readout
  let pendingSave = null;
  let saveTimer = 0;
  let refreshTimer = 0;
  let players = {}; // Music Assistant's players by id, kept current
  let queues = {}; // and its queues
  const loaded = { players: false, queues: false }; // both snapshots seen once
  const firstPlaying = {}; // queue id -> when it was first seen playing
  let skipped = {}; // queue id -> {at, tries}: claimed to play, sent no frames
  let failures = {}; // queue id -> silent tries so far, for the next wait
  let wanted = preferred || ""; // the picked speaker, "" for automatic

  function setState(next) {
    if (next !== state) {
      state = next;
      if (onState) onState(next);
    }
  }

  function closeApi() {
    generation++;
    clearTimeout(pollTimer);
    clearTimeout(trackTimer);
    clearTimeout(retryTimer);
    clearTimeout(resumeTimer);
    clearTimeout(chooseTimer);
    clearTimeout(helloTimer);
    pollTimer = trackTimer = retryTimer = resumeTimer = chooseTimer = helloTimer = 0;
    authed = false;
    clearTimeout(saveTimer);
    clearTimeout(refreshTimer);
    saveTimer = refreshTimer = 0;
    if (socket) {
      try {
        socket.close();
      } catch (e) {
        // already closed
      }
      socket = null;
    }
  }

  // Keeps the queue bookkeeping as a queue's state changes: when it was first
  // seen playing, and that a skipped queue gets a fresh chance once it stops.
  function noteQueueState(id, before, after) {
    const was = before && before.state === "playing";
    const is = after && after.state === "playing";
    if (is && !was) firstPlaying[id] = clock();
    if (!is) {
      delete firstPlaying[id];
      delete skipped[id];
      delete failures[id];
    }
  }

  function applySnapshot(kind, list) {
    const next = {};
    const key = kind === "players" ? "player_id" : "queue_id";
    for (const item of list) if (item && item[key]) next[item[key]] = item;
    if (kind === "queues") {
      for (const id in next) noteQueueState(id, queues[id], next[id]);
      for (const id in queues) if (!next[id]) noteQueueState(id, queues[id], null);
      queues = next;
    } else {
      players = next;
    }
    loaded[kind] = true;
    scheduleChoose();
  }

  function applyEvent(message) {
    const kind = EVENTS[message.event];
    if (!kind) return; // queue_time_updated and the like: nothing to decide on
    const table = kind === "players" ? players : queues;
    const id = message.object_id;
    if (!id) return;
    if (/_removed$/.test(message.event)) {
      if (kind === "queues") noteQueueState(id, queues[id], null);
      delete table[id];
    } else if (message.data && typeof message.data === "object") {
      if (kind === "queues") noteQueueState(id, queues[id], message.data);
      table[id] = message.data;
      if (kind === "queues" && id === current) sawQueue(message.data);
    }
    scheduleChoose();
  }

  function scheduleChoose() {
    if (chooseTimer) return;
    chooseTimer = setTimeout(() => {
      chooseTimer = 0;
      if (active) decide();
    }, CHOOSE_DEBOUNCE_MS);
  }

  function nameOf(playerId) {
    const p = players[playerId];
    if (p && p.name) return p.name;
    const q = queues[playerId];
    return (q && q.display_name) || playerId;
  }

  function switchTo(pick) {
    current = pick.queueId;
    streaming = false;
    trackId = null;
    expectFramesAt = clock();
    relay.connect(pick.queueId);
  }

  // Works out what to watch from the lists as they stand. Runs on every
  // change, so it must be a no-op when nothing has changed.
  function decide() {
    if (pinned || !active || !loaded.players || !loaded.queues) return;
    const t = clock();
    // The watched queue claims to play but nothing arrives: not readable.
    // Only ever judged between streams; while frames flow, the relay is right.
    // A skipped queue whose wait is over is tried again on the socket that is
    // still open to it, with its time starting afresh.
    if (current && !streaming && queues[current] && queues[current].state === "playing") {
      const entry = skipped[current];
      if (entry && !isSkipped(skipped, current, t, true)) {
        delete skipped[current];
        failures[current] = entry.tries;
        expectFramesAt = t;
      } else if (!entry && t - expectFramesAt > NO_FRAMES_MS) {
        skipped[current] = { at: t, tries: (failures[current] || 0) + 1 };
      }
    }
    const pick = choose({ players, queues, current, streaming, preferred: wanted, skipped, firstPlaying, now: t });
    if (!pick) {
      following = null;
      setState("waiting");
      return;
    }
    following = { queueId: pick.queueId, playerId: pick.playerId, name: nameOf(pick.playerId), reason: pick.reason };
    if (pick.queueId !== current || relay.state === "closed") switchTo(pick);
    setState("watching");
  }

  // Fresh copies of both lists, in case an event was missed.
  function reconcile(gen) {
    if (gen !== generation || !socket || socket.readyState !== 1) return;
    clearTimeout(pollTimer);
    socket.send(JSON.stringify({ message_id: "players", command: "players/all" }));
    socket.send(JSON.stringify({ message_id: "queues", command: "player_queues/all" }));
    pollTimer = setTimeout(() => reconcile(gen), streaming ? RECONCILE_STREAMING_MS : RECONCILE_MS);
  }

  // What the watched queue is playing, while it streams.
  function trackPoll(gen) {
    if (gen !== generation || !socket || socket.readyState !== 1) return;
    clearTimeout(trackTimer);
    trackTimer = 0;
    if (!streaming || !current) return;
    socket.send(JSON.stringify({ message_id: "queue", command: "player_queues/get", args: { queue_id: current } }));
    trackTimer = setTimeout(() => trackPoll(gen), TRACK_POLL_MS);
  }

  // What the watched queue is playing, in the shape the track card shows.
  function trackOf(queue) {
    const item = queue && queue.current_item;
    if (!item) return null;
    const media = item.media_item || {};
    const album = media.album || {};
    const meta = media.metadata || {};
    const artists = (media.artists || []).map((a) => a.name).filter(Boolean);
    let title = media.name || item.name || "";
    let artist = artists.join(", ");
    if (!artist && item.name && item.name.indexOf(" - ") > 0) {
      // Radio and other streams only have "Artist - Title" as one string.
      artist = item.name.slice(0, item.name.indexOf(" - "));
      title = item.name.slice(item.name.indexOf(" - ") + 3);
    }
    return { id: item.queue_item_id, title, artist, album: album.name || "", year: album.year || "", label: meta.label || "" };
  }

  function sawQueue(queue) {
    const track = trackOf(queue);
    const id = track ? track.id : null;
    if (id === trackId) return;
    trackId = id;
    if (onTrack) onTrack(track);
  }

  // The shared part of a preferences snapshot (favorites and the like). An
  // account written before the timestamps holds a plain list; it is read as
  // the dated form.
  function sharedOf(prefs) {
    const shared = {};
    for (const key of sharedKeys || []) if (key in prefs) shared[key] = prefs[key];
    if (!shared.favoritesMeta && prefs.favouritesMeta) shared.favoritesMeta = prefs.favouritesMeta; // earlier spelling
    if (Array.isArray(prefs.favorites)) shared.favoritesMeta = favoritesFromList(prefs.favorites, shared.favoritesMeta);
    if (Array.isArray(prefs.favourites)) shared.favoritesMeta = favoritesFromList(prefs.favourites, shared.favoritesMeta);
    return shared;
  }

  // Music Assistant's own web interface keeps MilkDrop favorites on the same
  // user as a plain list, `visualizer_favorites`. Whatever it added or removed
  // since this app last wrote that list (`mirrored`) becomes a dated change,
  // so a star set in the web interface reaches the TVs and the other way
  // round. Returns the dated map with those changes folded in.
  function foldWebFavorites(allPrefs, meta) {
    const list = allPrefs[MA_FAVORITES_KEY];
    if (!Array.isArray(list)) return meta;
    const ours = allPrefs[PREFS_KEY] || {};
    const map = Object.assign({}, meta || {});
    const now = Date.now();
    if (!Array.isArray(ours.mirrored)) return favoritesFromList(list, map); // never mirrored: fold in as old
    for (const name of list) if (ours.mirrored.indexOf(name) < 0 && !(map[name] && map[name].on)) map[name] = { on: true, at: now };
    for (const name of ours.mirrored) if (list.indexOf(name) < 0 && map[name] && map[name].on) map[name] = { on: false, at: now };
    return map;
  }

  function onNames(meta) {
    return Object.keys(meta || {}).filter((n) => meta[n] && meta[n].on).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }

  // How many favorites are on in a dated map, or the length of a list.
  function count(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).filter((k) => value[k] && value[k].on).length;
    return "-";
  }

  function note(text) {
    syncLog.push(new Date().toISOString().slice(11, 19) + " " + text);
    if (syncLog.length > 6) syncLog.shift();
  }

  // Shared lists are merged as sets: what this TV added since it last synced
  // is added, what it removed is removed, and whatever other TVs did in the
  // meantime stays.
  function mergeShared(theirs, mine, before, key) {
    if (key === "favoritesMeta") return mergeFavorites(theirs, mine);
    if (!Array.isArray(mine)) return mine === undefined ? theirs : mine;
    const was = Array.isArray(before) ? before : [];
    const now = Array.isArray(theirs) ? theirs.slice() : [];
    for (const item of was) {
      const at = mine.indexOf(item) < 0 ? now.indexOf(item) : -1;
      if (at >= 0) now.splice(at, 1);
    }
    for (const item of mine) if (was.indexOf(item) < 0 && now.indexOf(item) < 0) now.push(item);
    return now;
  }

  // Reads the account afresh. The server answers auth/me from a copy of the
  // user taken at login, so logging in again on the same socket is what
  // refreshes it; the auth reply then asks for auth/me.
  function readAccount() {
    if (!socket || socket.readyState !== 1 || !authed) return;
    socket.send(JSON.stringify({ message_id: "auth", command: "auth", args: { token } }));
  }

  // Asks for a fresh copy of the account first, so the merge is against what
  // other TVs have done since; the "me" reply then calls pushSave.
  function requestSave() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (pendingSave) readAccount();
  }

  // Keeps this app's preferences on the Music Assistant user, so a reinstall
  // (which can wipe the TV's storage) gets them back: shared keys at the top,
  // everything else under this TV's device id.
  //   vizman: { favorites: [...], devices: { <deviceId>: {...} } }
  function pushSave() {
    if (!pendingSave || remotePrefs === null || !socket || socket.readyState !== 1 || !authed) return;
    const theirs = sharedOf(remotePrefs[PREFS_KEY] || {});
    theirs.favoritesMeta = foldWebFavorites(remotePrefs, theirs.favoritesMeta);
    const mine = sharedOf(pendingSave);
    const merged = {};
    for (const key of sharedKeys || []) {
      const value = mergeShared(theirs[key], mine[key], (base || {})[key], key);
      if (value !== undefined) merged[key] = value;
    }
    note("save: account " + count(theirs.favoritesMeta) + ", mine " + count(mine.favoritesMeta) + " -> " + count(merged.favoritesMeta));
    const ours = Object.assign({}, remotePrefs[PREFS_KEY] || {}, merged);
    delete ours.favouritesMeta; // superseded by favoritesMeta
    delete ours.favourites;
    const device = {};
    for (const key of Object.keys(pendingSave)) if ((sharedKeys || []).indexOf(key) < 0) device[key] = pendingSave[key];
    ours.devices = Object.assign({}, ours.devices || {});
    ours.devices[deviceId] = device;
    const preferences = Object.assign({}, remotePrefs);
    if (ours.favoritesMeta) {
      // Music Assistant's web interface reads the plain list.
      preferences[MA_FAVORITES_KEY] = onNames(ours.favoritesMeta);
      ours.mirrored = preferences[MA_FAVORITES_KEY];
    }
    preferences[PREFS_KEY] = ours;
    pendingSave = null;
    socket.send(JSON.stringify({ message_id: "save", command: "auth/user/update", args: { preferences } }));
  }

  function openApi() {
    closeApi();
    if (!active) return;
    const gen = generation;
    const ws = new Socket("ws://" + authority(host) + "/ws");
    socket = ws;
    // Start over if the server never answers the login.
    helloTimer = setTimeout(() => {
      if (gen === generation && !authed) openApi();
    }, HANDSHAKE_MS);
    ws.onmessage = (event) => {
      if (gen !== generation || typeof event.data !== "string") return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!authed && message.server_version && !message.message_id) {
        ws.send(JSON.stringify({ message_id: "auth", command: "auth", args: { token } }));
      } else if (message.message_id === "auth") {
        if (message.result && message.result.authenticated) {
          const again = authed;
          authed = true;
          ws.send(JSON.stringify({ message_id: "me", command: "auth/me" }));
          if (!again) {
            reconcile(gen);
            if (streaming) trackPoll(gen);
          }
        } else {
          setState("rejected");
          closeApi();
        }
      } else if (message.message_id === "players" && Array.isArray(message.result)) {
        applySnapshot("players", message.result);
      } else if (message.message_id === "queues" && Array.isArray(message.result)) {
        applySnapshot("queues", message.result);
        if (current && queues[current]) sawQueue(queues[current]);
      } else if (message.message_id === "queue" && message.result) {
        sawQueue(message.result);
      } else if (message.event) {
        applyEvent(message);
      } else if (message.message_id === "me" && message.result) {
        remotePrefs = message.result.preferences || {};
        const ours = remotePrefs[PREFS_KEY] || {};
        // The first read always reaches the page (it restores settings); later
        // ones are skipped while a save is waiting, which gets merged instead.
        note("read " + count(sharedOf(ours).favoritesMeta) + (base === null ? " (first)" : pendingSave ? " (for a save)" : ""));
        const shared = sharedOf(ours);
        shared.favoritesMeta = foldWebFavorites(remotePrefs, shared.favoritesMeta);
        if (base === null) {
          base = {}; // nothing merged yet: a first save adds to the account's lists
          if (onRemotePrefs) onRemotePrefs(shared, (ours.devices || {})[deviceId] || {});
        } else if (!pendingSave) {
          base = shared;
          if (onRemotePrefs) onRemotePrefs(shared, (ours.devices || {})[deviceId] || {});
        }
        if (pendingSave) pushSave();
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          if (gen === generation) readAccount();
        }, REMOTE_REFRESH_MS);
      } else if (message.message_id === "save" && message.result) {
        remotePrefs = message.result.preferences || remotePrefs;
        const saved = sharedOf(remotePrefs[PREFS_KEY] || {});
        note("saved " + count(saved.favoritesMeta));
        base = saved;
        // Another TV's changes may have been merged in; let the page adopt them.
        if (onRemotePrefs) onRemotePrefs(saved, {});
      }
    };
    ws.onclose = () => {
      if (gen !== generation) return;
      socket = null;
      clearTimeout(pollTimer);
      clearTimeout(trackTimer);
      pollTimer = trackTimer = 0;
      if (active && state !== "rejected") retryTimer = setTimeout(openApi, RETRY_MS);
    };
    ws.onerror = () => {};
  }

  return {
    start() {
      active = true;
      streaming = false;
      if (pinned) {
        current = pinned;
        relay.connect(pinned);
        setState("pinned");
      } else {
        setState("waiting");
      }
      openApi();
    },
    stop() {
      active = false;
      closeApi();
      current = "";
      following = null;
      trackId = null;
      players = {};
      queues = {};
      loaded.players = loaded.queues = false;
      skipped = {};
      failures = {};
      setState("idle");
    },
    // The relay delivered a frame: the right player is being watched.
    noteFrame() {
      if (streaming) return;
      streaming = true;
      delete skipped[current];
      delete failures[current];
      if (!pinned) setState("watching");
      trackPoll(generation);
    },
    // The stream stopped. Keep the relay socket (the same player may resume)
    // and, after a pause, see whether something else should be watched.
    noteEnd() {
      if (!streaming) return;
      streaming = false;
      expectFramesAt = clock();
      if (active && !pinned) {
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
          resumeTimer = 0;
          decide();
        }, RESUME_MS);
      }
    },
    // The relay is logged in (again): give the queue its time to send.
    noteRelayOpen() {
      expectFramesAt = clock();
    },
    // A new track is starting on the relay: look up what it is straight away.
    noteClear() {
      trackPoll(generation);
    },
    // The speaker to prefer ("" for automatic); takes effect at once.
    setPreferred(playerId) {
      wanted = playerId || "";
      scheduleChoose();
    },
    speakers() {
      return speakersOf(players);
    },
    // Save a snapshot of the preferences remotely; sent once things settle,
    // and never before the remote copy has been read and merged.
    savePrefs(snapshot) {
      pendingSave = snapshot;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(requestSave, SAVE_DEBOUNCE_MS);
    },
    // The relay refused this player.
    noteError() {
      if (pinned || !current) return;
      skipped[current] = { at: clock(), tries: (failures[current] || 0) + 1 };
      scheduleChoose();
    },
    get state() {
      return state;
    },
    get syncLog() {
      return syncLog.join(" | ");
    },
    get player() {
      return current;
    },
    get preferred() {
      return wanted;
    },
    get following() {
      return following;
    },
  };
}
