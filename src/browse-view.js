import { imageUrl, thumbOf, timeLabel } from "./playback.js";
import { cleanQuery, flattenGroups, groupResults, searchArgs } from "./search.js";
import { createSearchField } from "./search-field.js";
import { createScrollCue } from "./scroll-cue.js";
import { CONFIRM_MS as PLAYLIST_CONFIRM_MS, NOTICE_MS, confirmationFor, pickerRows } from "./playlists.js";

// Browse: categories on the left, the chosen list on the right, and an
// item's actions in place of the list. Lists are read when a category is
// chosen, at most LIMIT items, and dropped when Browse closes. The list is
// rebuilt only when what it shows changes; arrow keys just move the selection.
const LIMIT = 60;
const CONFIRM_MS = 2500; // how long a row reads "Added to the queue"
// Search sits at the top; Browse opens on Recently played.
export const CATEGORIES = [
  { id: "search", label: "Search" },
  { id: "recent", label: "Recently played", command: "music/recently_played_items", args: { limit: 30, fully_played_only: false } },
  { id: "fav-playlists", label: "Favourite playlists", command: "music/playlists/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "fav-albums", label: "Favourite albums", command: "music/albums/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "fav-tracks", label: "Favourite songs", command: "music/tracks/library_items", args: { favorite: true, order_by: "timestamp_added_desc" } },
  { id: "fav-artists", label: "Favourite artists", command: "music/artists/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "radio", label: "Radio stations", command: "music/radios/library_items", args: { order_by: "sort_name" } },
  { id: "playlists", label: "All playlists", command: "music/playlists/library_items", args: { order_by: "sort_name" } },
  { id: "albums", label: "All albums", command: "music/albums/library_items", args: { order_by: "timestamp_added_desc" } },
];
// Where an album's, playlist's or artist's songs are read.
const SONGS = { album: "music/albums/album_tracks", playlist: "music/playlists/playlist_tracks", artist: "music/artists/artist_tracks" };
const START = 1;
const KIND = { track: "Song", album: "Album", playlist: "Playlist", artist: "Artist", radio: "Radio" };

// The actions an item offers; "tracks" opens an album, playlist or artist,
// "playlist" a song's playlist picker (when playlists can be changed).
export function actionsFor(item, withPlaylists) {
  const list = [["replace", "Play now"], ["next", "Play next"], ["add", "Add to the queue"]];
  if (item.media_type !== "radio") list.push(["radio", "Start radio from this"]);
  if (withPlaylists && item.media_type === "track") list.push(["playlist", "Add to a playlist"]);
  if (SONGS[item.media_type]) list.push(["tracks", "Show songs"]);
  return list;
}

export function detailOf(item) {
  const artists = (item.artists || []).map(a => a.name).filter(Boolean).join(", ");
  const parts = [KIND[item.media_type] || ""];
  if (artists) parts.push(artists);
  if (item.media_type === "album" && item.year) parts.push(item.year);
  if (item.media_type === "track" && item.duration) parts.push(timeLabel(item.duration));
  return parts.filter(Boolean).join(" · ");
}

function make(tag, cls, parent, value) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value) node.textContent = value;
  if (parent) parent.appendChild(node);
  return node;
}
function setDetail(button, value) { text(button.querySelector(".browse-words").lastChild, value); }
function text(node, value) { const v = String(value == null ? "" : value); if (node.textContent !== v) node.textContent = v; }

// One list row: an optional thumbnail, a name and a detail line.
function makeRow(label, detail, image, cls) {
  const button = make("button", "browse-row" + (cls ? " " + cls : ""));
  button.tabIndex = -1;
  if (image !== undefined) {
    const thumb = make("span", "browse-thumb", button);
    if (image) { const img = make("img", "", thumb); img.alt = ""; img.onerror = () => img.remove(); img.src = image; }
  }
  const words = make("span", "browse-words", button);
  make("strong", "", words, label); make("span", "", words, detail);
  return button;
}

// playlists: playlists.js createPlaylists (Add to a playlist), or null.
export function createBrowse({ element, live, host, play, target, onNotice, onLeave, playlists = null }) {
  element.textContent = "";
  const header = make("header", "", element), body = make("div", "browse-body", element);
  make("h2", "", header, "Browse");
  const note = make("p", "panel-note", header), catList = make("ol", "browse-cats", body), main = make("div", "browse-main", body);
  const title = make("h3", "browse-title", main);
  const field = createSearchField({ onFocus: toField, onSubmit: value => search(value, false), onLeave: toField, onArrow: name => handleKey(name) });
  main.appendChild(field.row);
  const frame = make("div", "scroll-frame", main), list = make("ol", "browse-list", frame);
  const cue = createScrollCue(list, frame);
  let column = "cats", cat = START, index = 0, action = 0, generation = 0, version = 0, built = -1;
  let items = [], headings = {}, state = "idle", stack = null, chosen = null; // stack: { title, parent, item } while showing an album's songs
  let rows = [], selected = null; // rows: what OK can activate in the list column, in order
  let isOpen = false, running = false, confirmed = null; // confirmed: { uri, text } while an item's row confirms an action
  let query = ""; // the last search sent
  const lists = new Map();
  let adding = null; // the song whose playlist picker shows in the actions column
  let expiries = [];
  // A job's row confirms as it moves, and its words go when they expire.
  const redraw = () => { if (isOpen) { changed(); render(); } };
  if (playlists) playlists.listen(() => {
    redraw();
    const job = playlists.job;
    if (job && job.state === "done") expiries = [setTimeout(redraw, PLAYLIST_CONFIRM_MS + 20), setTimeout(redraw, NOTICE_MS + 20)];
  });

  const cats = CATEGORIES.map((c, i) => {
    const button = make("button", "", make("li", "", catList), c.label);
    button.tabIndex = -1;
    button.addEventListener("click", () => { column = "cats"; choose(i); });
    return button;
  });
  function changed() { version++; }
  function searching() { return CATEGORIES[cat].id === "search" && !stack; }
  function show(next) { items = next.items; headings = next.headings || {}; }

  async function load(i) {
    const c = CATEGORIES[i], gen = ++generation;
    changed();
    if (lists.has(c.id)) { show(lists.get(c.id)); state = "ready"; return; }
    if (c.id === "search") { show({ items: [] }); state = "idle"; if (field.input.value) search(field.input.value, true); return; }
    show({ items: [] }); state = "loading"; render();
    try {
      const result = await live.call(c.command, Object.assign({ limit: LIMIT, offset: 0 }, c.args));
      if (gen !== generation) return;
      show({ items: (Array.isArray(result) ? result : []).filter(x => x && x.uri).slice(0, LIMIT) });
      lists.set(c.id, { items }); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; }
    changed(); render();
  }
  // Searches Music Assistant; a newer search, Back or another category drops the answer.
  async function search(value, force) {
    if (!searching()) return;
    const q = cleanQuery(value);
    if (!force && q === query && state !== "error" && state !== "idle") return;
    const gen = ++generation;
    query = q; lists.delete("search"); show({ items: [] }); state = q ? "loading" : "idle"; changed(); render();
    if (!q) return;
    try {
      const found = flattenGroups(groupResults(await live.call("music/search", searchArgs(q))));
      if (gen !== generation) return;
      show(found); lists.set("search", found); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; }
    changed(); render();
  }
  async function showSongs(item) {
    const gen = ++generation, retrying = stack && stack.item === item;
    stack = { title: item.name, parent: retrying ? stack.parent : { items, headings, index }, item };
    show({ items: [] }); state = "loading"; index = 0; column = "list"; changed(); render();
    try {
      const result = await live.call(SONGS[item.media_type], { item_id: item.item_id, provider_instance_id_or_domain: item.provider || "library" });
      if (gen !== generation) return;
      show({ items: (Array.isArray(result) ? result : []).filter(x => x && x.uri).slice(0, 200) }); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; }
    changed(); render();
  }
  function choose(i) { cat = i; index = 0; stack = null; chosen = null; load(i); render(); }
  function retry() { if (stack) showSongs(stack.item); else if (searching()) search(query, true); else { lists.delete(CATEGORIES[cat].id); load(cat); } }
  function toField() { column = "list"; index = 0; render(); }
  async function run(kind, button) {
    const item = chosen, gen = generation;
    if (kind === "tracks") return showSongs(item);
    if (kind === "playlist") { adding = item; action = 0; playlists.loadEditable(); changed(); return render(); }
    if (running) return;
    const media = kind === "radio" ? "radio_playlist://playlist/" + item.uri : item.uri;
    running = true;
    const ok = await play(media, kind === "radio" ? "replace" : kind);
    running = false;
    if (gen !== generation) return; // Browse closed or moved on meanwhile
    if (!ok) return setDetail(button, "Couldn’t do that. OK tries again");
    if (kind === "replace" || kind === "radio") { onNotice("Playing " + item.name + (kind === "radio" ? " radio" : "")); return onLeave(true); }
    confirm(item, kind === "next" ? "Plays next" : "Added to the queue");
    if (column === "actions" && chosen === item) { column = "list"; chosen = null; }
    changed(); render();
  }
  // The item's row reads what happened, with the tick, for a moment.
  function confirm(item, value) {
    const mark = confirmed = { uri: item.uri, text: value };
    setTimeout(() => {
      if (confirmed !== mark) return;
      confirmed = null;
      rows.filter(b => b.dataset.uri === item.uri).forEach(b => { b.classList.remove("browse-added"); setDetail(b, detailOf(item)); });
    }, CONFIRM_MS);
  }
  function openItem(i) { index = i + (rows[0] === field.row ? 1 : 0); chosen = items[i]; column = "actions"; action = 0; changed(); render(); }

  function addRow(button, activate) { list.appendChild(make("li")).appendChild(button); button.addEventListener("click", activate); rows.push(button); }
  function status(label, detail, activate) { addRow(makeRow(label, detail, undefined, "browse-status"), activate || (() => {})); }
  function buildPicker() {
    text(title, "Add to a playlist");
    const item = adding, key = "browse:" + item.uri;
    pickerRows(playlists.list, new Date()).forEach(r => {
      const b = makeRow(r.label, r.detail, undefined, "browse-action");
      b.disabled = !!r.disabled;
      addRow(b, () => {
        if (r.kind === "retry") return playlists.loadEditable();
        if (r.disabled || playlists.busy) return;
        adding = null; column = "list"; chosen = null; changed();
        if (r.kind === "new") playlists.addToNew([item.uri], key);
        else playlists.addTo(r.playlist, [item.uri], key);
        render();
      });
    });
  }
  function buildActions() {
    if (adding) return buildPicker();
    text(title, chosen.name);
    actionsFor(chosen, !!playlists).forEach(([kind, label], i) => { const b = makeRow(label, "", undefined, "browse-action"); addRow(b, () => { action = i; run(kind, b); }); });
  }
  function buildSearchStatus() {
    if (state === "idle") make("li", "browse-hint", list, "OK opens the TV keyboard. Type or say an artist, album or song.");
    else if (state === "loading") status("Searching…", "");
    else if (state === "error") status("Search didn’t work", "OK tries again", retry);
    else if (!items.length) status("Nothing found for “" + query + "”", "Try fewer or different words");
  }
  function buildStatus() {
    if (state === "loading") status("Loading…", "");
    else if (state === "error") status("Couldn’t load this list", "OK tries again", retry);
    else if (!items.length) status(stack ? "No songs here" : "Nothing here yet", stack ? "" : "Favourite music in Music Assistant and it appears here");
  }
  function buildList() {
    text(title, stack ? stack.title : CATEGORIES[cat].label);
    if (searching()) { rows.push(field.row); buildSearchStatus(); } else buildStatus();
    items.forEach((item, i) => {
      if (headings[i]) make("li", "browse-group", list, headings[i]);
      const mark = playlists ? confirmationFor(playlists.job, "browse:" + item.uri, Date.now()) : null;
      const done = confirmed && confirmed.uri === item.uri;
      const b = makeRow(item.name, done ? confirmed.text : mark ? mark.text : detailOf(item), imageUrl(thumbOf(item), host, 160), done || (mark && mark.tick) ? "browse-added" : "");
      b.dataset.uri = item.uri; addRow(b, () => openItem(i));
    });
  }
  function rebuild() {
    built = version; rows = [];
    if (selected) { selected.classList.remove("selected"); selected.tabIndex = -1; selected = null; }
    list.textContent = "";
    if (column === "actions" && chosen) buildActions(); else buildList();
    field.row.style.display = rows[0] === field.row ? "" : "none";
  }
  function render() {
    text(note, "Plays on " + target());
    if (built !== version) rebuild();
    cats.forEach((b, i) => b.classList.toggle("chosen", i === cat));
    focus();
  }
  // Marks the selected row; while the TV keyboard is up the field keeps focus.
  function focus() {
    const nodes = column === "cats" ? cats : rows, at = column === "cats" ? cat : column === "actions" ? action : index;
    const next = field.typing ? field.row : nodes[Math.max(0, Math.min(at, nodes.length - 1))];
    if (selected && selected !== next) { selected.classList.remove("selected"); selected.tabIndex = -1; }
    selected = next || null;
    if (!next) return;
    next.classList.add("selected"); next.tabIndex = 0;
    if (!field.typing) next.focus({ preventScroll: true });
    if (column === "cats") { next.scrollIntoView({ block: "nearest" }); cue.update(); } else cue.reveal(next);
  }
  function back() {
    if (column === "actions" && adding) { adding = null; action = actionsFor(chosen, true).findIndex(([kind]) => kind === "playlist"); changed(); }
    else if (column === "actions") { column = "list"; chosen = null; changed(); }
    else if (column === "list" && stack) { generation++; show(stack.parent); index = stack.parent.index; stack = null; state = "ready"; changed(); }
    else if (column === "list") column = "cats";
    else return onLeave(false);
    render();
  }
  function handleKey(name) {
    const count = rows.length;
    if (name === "back") return back();
    if (name === "up" || name === "down") {
      const step = name === "up" ? -1 : 1;
      if (column === "cats") return choose((cat + step + CATEGORIES.length) % CATEGORIES.length);
      if (column === "actions") action = (action + step + count) % count;
      else if (count) index = Math.max(0, Math.min(count - 1, index + step));
    } else if (name === "right" && column === "cats") { if (rows.length) column = "list"; }
    else if (name === "left") return back();
    else if (name === "ok") {
      if (column === "cats") { if (rows.length) column = "list"; }
      else { const b = rows[column === "actions" ? action : index]; if (b) return b.click(); }
    }
    render();
  }
  return {
    open() { column = "cats"; if (isOpen) return render(); isOpen = true; choose(START); },
    close() {
      isOpen = false; confirmed = null; running = false; adding = null; generation++; lists.clear();
      expiries.forEach(clearTimeout); expiries = [];
      field.reset(); query = ""; show({ items: [] }); state = "idle"; stack = null; chosen = null; changed();
    },
    handleKey,
  };
}
