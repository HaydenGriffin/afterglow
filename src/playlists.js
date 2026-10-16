// Playlists in Music Assistant: save the queue as one, add a song to one, keep
// tonight's programme as one. Music Assistant 2.10 owns playlists; Afterglow
// only asks. Names are made here so no keyboard is needed ("Queue · 16 Oct",
// unique with " (2)"), and the background task Music Assistant hands back is
// followed until it says how many songs went in. One job at a time; each
// outcome is kept for the row that started it (see confirmationFor).

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PICKER_LIMIT = 8;
const TASK_POLL_MS = 1000;
const TASK_WAIT_MS = 30000;
export const CONFIRM_MS = 2500; // a success's tick, as Browse's Play next
export const NOTICE_MS = 6000; // anything else stays a little longer

export function shortDate(date) { return date.getDate() + " " + MONTHS[date.getMonth()].slice(0, 3); }
export function playlistName(prefix, date) { return prefix + " · " + shortDate(date); }

// The name itself when free, else the first of "name (2)" … "name (99)" that is.
export function uniqueName(base, taken) {
  const used = new Set((taken || []).map(name => String(name)));
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!used.has(base + " (" + n + ")")) return base + " (" + n + ")";
  return base;
}

// The playlists a song can go into, most recently changed first (as asked).
export function editablePlaylists(items, limit) {
  return (Array.isArray(items) ? items : []).filter(p => p && p.is_editable && !p.is_dynamic && p.item_id != null && p.name)
    .slice(0, limit || PICKER_LIMIT);
}

// What a background task says: "running", "done" or "failed". An answer that
// is not a task (an older server) means the work is already done.
export function taskState(task) {
  if (!task || typeof task !== "object" || !task.id || !task.status) return "done";
  if (task.status === "success" || task.status === "partial_success") return "done";
  if (task.status === "failed" || task.status === "cancelled") return "failed";
  return "running";
}
// How many songs the task put in, or null when it does not say.
export function addedCount(task) {
  const text = String(task && task.progress_text || "");
  const added = /^Added (\d+) item/.exec(text);
  if (added) return Number(added[1]);
  return /^No new playlist items/.test(text) ? 0 : null;
}

// Music Assistant's refusals (error codes from music_assistant_models.errors).
export function refusal(error, verb) {
  const code = error && error.code;
  if (code === 22 || code === 18) return "This account can’t change playlists";
  if (verb === "save" && code === 8) return "Nothing in the queue can go in a playlist";
  if ((verb === "save" || verb === "create") && (code === 1 || code === 3)) return "Music Assistant has nowhere to keep playlists";
  return verb === "add" ? "Couldn’t add. Try again" : "Couldn’t save. Try again";
}

const songs = n => n + (n === 1 ? " song" : " songs");
const quoted = name => "“" + name + "”";

// The words for a finished job. kind: "save" (the queue), "keep" (the
// programme) or "add"; expected: songs asked for.
export function outcomeText(kind, name, added, expected) {
  const missing = added == null ? 0 : Math.max(0, expected - added);
  if (kind === "add") {
    if (added === 0) return { text: "Already in " + quoted(name) + ", or not available there", ok: false };
    return { text: "Added to " + quoted(name), ok: true };
  }
  const done = (kind === "keep" ? "Kept as " : "Saved as ") + quoted(name);
  if (missing > 0) return { text: done + " · " + songs(missing) + " couldn’t be added", ok: false };
  return { text: done, ok: true };
}

// The picker's rows: New playlist first, then what the list holds or why not.
export function pickerRows(list, date) {
  const rows = [{ kind: "new", label: "New playlist", detail: "As " + quoted(playlistName("Playlist", date)) }];
  if (list.state === "loading") rows.push({ kind: "status", label: "Loading playlists…", detail: "", disabled: true });
  else if (list.state === "error") rows.push({ kind: "retry", label: "Couldn’t load playlists", detail: "OK tries again" });
  else if (!list.items.length) rows.push({ kind: "status", label: "No playlists you can add to yet", detail: "", disabled: true });
  else list.items.forEach(playlist => rows.push({ kind: "playlist", label: playlist.name, detail: "", playlist }));
  return rows;
}

// call(command, args) -> Promise (Music Assistant's API); onChange fires as a job moves.
export function createPlaylists({ call, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), onChange = () => {}, onNotice = () => {} }) {
  let job = null; // { key, kind, name, text, ok, state: "working"|"done", at }
  let list = { state: "idle", items: [] }, listGeneration = 0;
  const listeners = [onChange];
  const changed = () => listeners.forEach(fn => fn());

  async function freeName(base) {
    try {
      const found = await call("music/playlists/library_items", { search: base, limit: 50, offset: 0 });
      return uniqueName(base, (Array.isArray(found) ? found : []).map(p => p && p.name));
    } catch (e) { return base; }
  }
  // Follows a task until it ends or TASK_WAIT_MS pass; returns { state, task }.
  async function follow(task) {
    const started = now();
    let state = taskState(task);
    while (state === "running") {
      if (now() - started >= TASK_WAIT_MS) return { state: "slow", task };
      await wait(TASK_POLL_MS);
      try { task = await call("tasks/get", { task_id: task.id }); } catch (e) { return { state: "done", task: null }; }
      state = taskState(task);
    }
    return { state, task };
  }
  function finish(text, ok) {
    job = Object.assign({}, job, { state: "done", text, ok, at: now() });
    onNotice(text); changed();
    return ok;
  }
  function begin(key, kind, text) {
    if (job && job.state === "working") return false;
    job = { key, kind, name: "", text, ok: false, state: "working", at: now() };
    changed();
    return true;
  }
  function settle(kind, name, result, expected) {
    if (result.state === "failed") return finish(kind === "add" ? "Couldn’t add. Try again" : "Couldn’t save. Try again", false);
    if (result.state === "slow") return finish("Still saving in Music Assistant", false);
    const out = outcomeText(kind, name, result.task ? addedCount(result.task) : null, expected);
    return finish(out.text, out.ok);
  }
  // A new playlist, then the songs into it.
  async function createAndAdd(kind, prefix, uris, date) {
    const name = await freeName(playlistName(prefix, date));
    job.name = name;
    let playlist;
    try { playlist = await call("music/playlists/create_playlist", { name }); } catch (e) { return finish(refusal(e, "create"), false); }
    if (!playlist || playlist.item_id == null) return finish(refusal(null, "create"), false);
    let task;
    try { task = await call("music/playlists/add_playlist_tracks", { db_playlist_id: playlist.item_id, uris }); } catch (e) { return finish(refusal(e, "add"), false); }
    return settle(kind === "keep" ? "keep" : "add", name, await follow(task), uris.length);
  }

  return {
    get job() { return job; },
    get list() { return list; },
    get busy() { return !!job && job.state === "working"; },
    listen(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    // The playlists a song can go into; read afresh each time the picker opens.
    async loadEditable() {
      const gen = ++listGeneration;
      list = { state: "loading", items: [] }; changed();
      try {
        const result = await call("music/playlists/library_items", { limit: 50, offset: 0, order_by: "timestamp_modified_desc" });
        if (gen !== listGeneration) return;
        list = { state: "ready", items: editablePlaylists(result) };
      } catch (e) { if (gen === listGeneration) list = { state: "error", items: [] }; }
      changed();
    },
    // Saves every song in a queue (Music Assistant takes the whole queue, played and to come).
    async saveQueue(queueId, expected, date) {
      if (!begin("queue-save", "save", "Saving…")) return false;
      const name = await freeName(playlistName("Queue", date || new Date(now())));
      job.name = name;
      let task;
      try { task = await call("player_queues/save_as_playlist", { queue_id: queueId, name }); } catch (e) { return finish(refusal(e, "save"), false); }
      return settle("save", name, await follow(task), expected);
    },
    // Adds songs to a playlist from the picker; key names the row that confirms.
    async addTo(playlist, uris, key) {
      if (!begin(key, "add", "Adding to " + quoted(playlist.name) + "…")) return false;
      job.name = playlist.name;
      let task;
      try { task = await call("music/playlists/add_playlist_tracks", { db_playlist_id: playlist.item_id, uris }); } catch (e) { return finish(refusal(e, "add"), false); }
      return settle("add", playlist.name, await follow(task), uris.length);
    },
    async addToNew(uris, key, date) {
      const name = playlistName("Playlist", date || new Date(now()));
      if (!begin(key, "add", "Adding to " + quoted(name) + "…")) return false;
      return createAndAdd("add", "Playlist", uris, date || new Date(now()));
    },
    // Tonight's programme, in order, as a new playlist named by its headline word.
    async keep(uris, prefix, key, date) {
      if (!begin(key, "keep", "Keeping…")) return false;
      return createAndAdd("keep", prefix, uris, date || new Date(now()));
    },
  };
}

// What the row with this key reads now: { text, tick } or null once it has gone.
export function confirmationFor(job, key, now) {
  if (!job || job.key !== key) return null;
  if (job.state === "working") return { text: job.text, tick: false };
  if (now - job.at >= (job.ok ? CONFIRM_MS : NOTICE_MS)) return null;
  return { text: job.text, tick: job.ok };
}
