// Decides which player the relay should watch, and reports what it is
// playing. The relay binds to one player per connection and never switches,
// so while nothing is streaming this polls Music Assistant's API socket for a
// queue that is playing; while streaming it polls that queue for its track.
//   ws://<host>:8095/ws: server info, then {command:"auth"}, then commands.

import { authority } from "./relay.js";
import { favoritesFromList, mergeFavorites } from "./settings.js";

const POLL_MS = 3000;
const TRACK_POLL_MS = 4000;
const SAVE_DEBOUNCE_MS = 1500;
const PREFS_KEY = "vizman"; // our entry in the user's preferences
const MA_FAVORITES_KEY = "visualizer_favorites"; // Music Assistant's own MilkDrop favorites
const REMOTE_REFRESH_MS = 60000; // how often another TV's changes are picked up
const RESUME_MS = 3000; // wait this long after a stream ends before looking elsewhere
const NO_FRAMES_MS = 5000; // a "playing" queue that sends nothing by then is skipped
const RETRY_MS = 3000;
const HANDSHAKE_MS = 10000; // an API socket must be logged in by then

export function createFollow({ host, token, pinned, relay, WebSocketImpl, onState, onTrack, onRemotePrefs, deviceId, sharedKeys }) {
  const Socket = WebSocketImpl || WebSocket;
  let socket = null;
  let generation = 0;
  let active = false;
  let authed = false;
  let streaming = false;
  let current = "";
  let connectedAt = 0;
  let pollTimer = 0;
  let waitTimer = 0;
  let helloTimer = 0;
  let state = "idle";
  let trackId = null;
  let remotePrefs = null; // the user's whole preferences object, once read
  let base = null; // shared values as last synced with the account
  const syncLog = []; // what was read and saved, for the debug readout
  let pendingSave = null;
  let saveTimer = 0;
  let refreshTimer = 0;
  const skipped = {}; // queue ids that claimed to play but sent no frames

  function setState(next) {
    if (next !== state) {
      state = next;
      if (onState) onState(next);
    }
  }

  function closeApi() {
    generation++;
    clearTimeout(pollTimer);
    clearTimeout(waitTimer);
    clearTimeout(helloTimer);
    pollTimer = waitTimer = helloTimer = 0;
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

  function choose(queues) {
    if (pinned) return; // only ever watching the one player
    const playing = [];
    for (const queue of queues) {
      if (queue.state === "playing") playing.push(queue.queue_id);
      else delete skipped[queue.queue_id];
    }
    if (current && playing.indexOf(current) >= 0 && !skipped[current]) {
      if (Date.now() - connectedAt < NO_FRAMES_MS) return;
      skipped[current] = true; // playing something the relay cannot read
    }
    for (const id of playing) {
      if (skipped[id]) continue;
      if (id !== current || relay.state === "closed") {
        current = id;
        connectedAt = Date.now();
        relay.connect(id);
      }
      setState("watching");
      return;
    }
    setState("waiting");
  }

  function poll(gen) {
    if (gen !== generation || !socket || socket.readyState !== 1) return;
    clearTimeout(pollTimer);
    if (streaming && current) {
      socket.send(JSON.stringify({ message_id: "queue", command: "player_queues/get", args: { queue_id: current } }));
      pollTimer = setTimeout(() => poll(gen), TRACK_POLL_MS);
    } else {
      socket.send(JSON.stringify({ message_id: "queues", command: "player_queues/all" }));
      pollTimer = setTimeout(() => poll(gen), POLL_MS);
    }
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
          if (!again) poll(gen);
        } else {
          setState("rejected");
          closeApi();
        }
      } else if (message.message_id === "queues" && Array.isArray(message.result)) {
        choose(message.result);
        for (const queue of message.result) if (queue.queue_id === current) sawQueue(queue);
      } else if (message.message_id === "queue" && message.result) {
        sawQueue(message.result);
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
      if (active && state !== "rejected") waitTimer = setTimeout(openApi, RETRY_MS);
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
      trackId = null;
      setState("idle");
    },
    // The relay delivered a frame: the right player is being watched.
    noteFrame() {
      if (streaming) return;
      streaming = true;
      if (!pinned) setState("watching");
      poll(generation);
    },
    // The stream stopped. Keep the relay socket (the same player may resume)
    // and, after a pause, start looking for another one.
    noteEnd() {
      if (!streaming) return;
      streaming = false;
      if (active && !pinned) {
        clearTimeout(waitTimer);
        waitTimer = setTimeout(() => poll(generation), RESUME_MS);
      }
    },
    // A new track is starting on the relay: look up what it is straight away.
    noteClear() {
      poll(generation);
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
      if (!pinned && current) skipped[current] = true;
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
  };
}
