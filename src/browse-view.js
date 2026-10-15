import { imageUrl, thumbOf, timeLabel } from "./playback.js";

// Browse: categories on the left, the chosen list on the right, and an
// item's actions in place of the list. Lists are read when a category is
// chosen, at most LIMIT items, and dropped when Browse closes. The list is
// rebuilt only when what it shows changes; arrow keys just move the selection.
const LIMIT = 60;
export const CATEGORIES = [
  { id: "recent", label: "Recently played", command: "music/recently_played_items", args: { limit: 30, fully_played_only: false } },
  { id: "fav-playlists", label: "Favourite playlists", command: "music/playlists/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "fav-albums", label: "Favourite albums", command: "music/albums/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "fav-tracks", label: "Favourite songs", command: "music/tracks/library_items", args: { favorite: true, order_by: "timestamp_added_desc" } },
  { id: "fav-artists", label: "Favourite artists", command: "music/artists/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "radio", label: "Radio stations", command: "music/radios/library_items", args: { order_by: "sort_name" } },
  { id: "playlists", label: "All playlists", command: "music/playlists/library_items", args: { order_by: "sort_name" } },
  { id: "albums", label: "All albums", command: "music/albums/library_items", args: { order_by: "timestamp_added_desc" } },
];
const KIND = { track: "Song", album: "Album", playlist: "Playlist", artist: "Artist", radio: "Radio" };

// The actions an item offers; "tracks" opens an album, playlist or artist.
export function actionsFor(item) {
  const list = [["replace", "Play now"], ["next", "Play next"], ["add", "Add to the queue"]];
  if (item.media_type !== "radio") list.push(["radio", "Start radio from this"]);
  if (item.media_type === "album" || item.media_type === "playlist") list.push(["tracks", "Show songs"]);
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

export function createBrowse({ element, live, host, play, target, onNotice, onLeave }) {
  element.textContent = "";
  const header = make("header", "", element), body = make("div", "browse-body", element);
  make("h2", "", header, "Browse");
  const note = make("p", "panel-note", header), catList = make("ol", "browse-cats", body), main = make("div", "browse-main", body);
  const title = make("h3", "browse-title", main), list = make("ol", "browse-list", main);
  let column = "cats", cat = 0, index = 0, action = 0, generation = 0, version = 0, built = -1;
  let items = [], state = "idle", stack = null, chosen = null; // stack: { title, parent, item } while showing an album's songs
  let rows = [], selected = null; // rows: what OK can activate in the list column, in order
  const lists = new Map();

  const cats = CATEGORIES.map((c, i) => {
    const button = make("button", "", make("li", "", catList), c.label);
    button.tabIndex = -1;
    button.addEventListener("click", () => { column = "cats"; choose(i); });
    return button;
  });
  function changed() { version++; }

  async function load(i) {
    const c = CATEGORIES[i], gen = ++generation;
    changed();
    if (lists.has(c.id)) { items = lists.get(c.id); state = "ready"; return; }
    items = []; state = "loading"; render();
    try {
      const result = await live.call(c.command, Object.assign({ limit: LIMIT, offset: 0 }, c.args));
      if (gen !== generation) return;
      items = (Array.isArray(result) ? result : []).filter(x => x && x.uri).slice(0, LIMIT);
      lists.set(c.id, items); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; items = []; }
    changed(); render();
  }
  async function showSongs(item) {
    const gen = ++generation, command = item.media_type === "album" ? "music/albums/album_tracks" : "music/playlists/playlist_tracks";
    stack = { title: item.name, parent: { items, index }, item };
    items = []; state = "loading"; index = 0; column = "list"; changed(); render();
    try {
      const result = await live.call(command, { item_id: item.item_id, provider_instance_id_or_domain: item.provider || "library" });
      if (gen !== generation) return;
      items = (Array.isArray(result) ? result : []).filter(x => x && x.uri).slice(0, 200); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; items = []; }
    changed(); render();
  }
  function choose(i) { cat = i; index = 0; stack = null; chosen = null; load(i); render(); }
  function retry() { if (stack) showSongs(stack.item); else { lists.delete(CATEGORIES[cat].id); load(cat); } }
  async function run(kind) {
    const item = chosen;
    if (kind === "tracks") return showSongs(item);
    const media = kind === "radio" ? "radio_playlist://playlist/" + item.uri : item.uri;
    const ok = await play(media, kind === "radio" ? "replace" : kind);
    if (!ok) return;
    onNotice(kind === "next" ? item.name + " plays next" : kind === "add" ? item.name + " added to the queue" : "Playing " + item.name + (kind === "radio" ? " radio" : ""));
    if (kind === "replace" || kind === "radio") onLeave(true);
    else { column = "list"; chosen = null; changed(); render(); }
  }
  function openItem(i) { index = i; chosen = items[i]; column = "actions"; action = 0; changed(); render(); }

  function addRow(button, activate) { list.appendChild(make("li")).appendChild(button); button.addEventListener("click", activate); rows.push(button); }
  function buildActions() {
    text(title, chosen.name);
    actionsFor(chosen).forEach(([kind, label], i) => addRow(makeRow(label, "", undefined, "browse-action"), () => { action = i; run(kind); }));
  }
  function buildList() {
    text(title, stack ? stack.title : CATEGORIES[cat].label);
    const status = (label, detail, activate) => addRow(makeRow(label, detail, undefined, "browse-status"), activate || (() => {}));
    if (state === "loading") status("Loading…", "");
    else if (state === "error") status("Couldn’t load this list", "OK tries again", retry);
    else if (!items.length) status(stack ? "No songs here" : "Nothing here yet", stack ? "" : "Favourite music in Music Assistant and it appears here");
    items.forEach((item, i) => addRow(makeRow(item.name, detailOf(item), imageUrl(thumbOf(item), host, 160)), () => openItem(i)));
  }
  function rebuild() {
    built = version; rows = []; selected = null;
    list.textContent = "";
    if (column === "actions" && chosen) buildActions(); else buildList();
  }
  function render() {
    text(note, "Plays on " + target());
    if (built !== version) rebuild();
    cats.forEach((b, i) => b.classList.toggle("chosen", i === cat));
    focus();
  }
  function focus() {
    const nodes = column === "cats" ? cats : rows, at = column === "cats" ? cat : column === "actions" ? action : index;
    const next = nodes[Math.max(0, Math.min(at, nodes.length - 1))];
    if (selected && selected !== next) { selected.classList.remove("selected"); selected.tabIndex = -1; }
    selected = next || null;
    if (!next) return;
    next.classList.add("selected"); next.tabIndex = 0; next.focus({ preventScroll: true }); next.scrollIntoView({ block: "nearest" });
  }
  function back() {
    if (column === "actions") { column = "list"; chosen = null; changed(); }
    else if (column === "list" && stack) { generation++; items = stack.parent.items; index = stack.parent.index; stack = null; state = "ready"; changed(); }
    else if (column === "list") column = "cats";
    else return onLeave(false);
    render();
  }
  return {
    open() { column = "cats"; if (state === "idle") choose(0); else render(); },
    close() { generation++; lists.clear(); items = []; state = "idle"; stack = null; chosen = null; changed(); },
    handleKey(name) {
      const count = rows.length;
      if (name === "back") return back();
      if (name === "up" || name === "down") {
        const step = name === "up" ? -1 : 1;
        if (column === "cats") return choose((cat + step + CATEGORIES.length) % CATEGORIES.length);
        if (column === "actions") action = (action + step + count) % count;
        else if (count) index = Math.max(0, Math.min(count - 1, index + step));
      } else if (name === "right" && column === "cats") { if (items.length || state !== "ready") column = "list"; }
      else if (name === "left") return back();
      else if (name === "ok") {
        if (column === "cats") column = "list";
        else { const b = rows[column === "actions" ? action : index]; if (b) return b.click(); }
      }
      render();
    },
  };
}
