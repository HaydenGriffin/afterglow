import { imageUrl, thumbOf, timeLabel } from "./playback.js";

// Browse: categories on the left, the chosen list on the right, and an
// item's actions in place of the list. Lists are read when a category is
// chosen, at most LIMIT items, and dropped when Browse closes.
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

export function createBrowse({ element, live, host, play, target, onNotice, onLeave }) {
  const make = (tag, cls, parent, value) => { const node = document.createElement(tag); if (cls) node.className = cls; if (value) node.textContent = value; parent.appendChild(node); return node; };
  element.textContent = "";
  const header = make("header", "", element), body = make("div", "browse-body", element);
  make("h2", "", header, "Browse");
  const note = make("p", "panel-note", header), catList = make("ol", "browse-cats", body), main = make("div", "browse-main", body);
  const title = make("h3", "browse-title", main), list = make("ol", "browse-list", main);
  const el = s => ({ ".panel-note": note, ".browse-cats": catList, ".browse-title": title, ".browse-list": list })[s];
  let column = "cats", cat = 0, index = 0, action = 0, generation = 0;
  let items = [], state = "idle", stack = null, chosen = null; // stack: { title, items, index } while showing an album's songs
  const lists = new Map();
  function text(node, value) { const v = String(value == null ? "" : value); if (node.textContent !== v) node.textContent = v; }

  CATEGORIES.forEach((c, i) => {
    const li = document.createElement("li"), button = document.createElement("button");
    text(button, c.label); button.addEventListener("click", () => { column = "cats"; choose(i); }); li.appendChild(button); el(".browse-cats").appendChild(li);
  });

  async function load(i) {
    const c = CATEGORIES[i], gen = ++generation;
    if (lists.has(c.id)) { items = lists.get(c.id); state = "ready"; return; }
    items = []; state = "loading"; render();
    try {
      const result = await live.call(c.command, Object.assign({ limit: LIMIT, offset: 0 }, c.args));
      if (gen !== generation) return;
      items = (Array.isArray(result) ? result : []).filter(x => x && x.uri).slice(0, LIMIT);
      lists.set(c.id, items); state = "ready";
    } catch (e) { if (gen === generation) { state = "error"; items = []; } }
    render();
  }
  async function showSongs(item) {
    const gen = ++generation, command = item.media_type === "album" ? "music/albums/album_tracks" : "music/playlists/playlist_tracks";
    stack = { title: item.name, parent: { items, index }, item };
    items = []; state = "loading"; index = 0; column = "list"; render();
    try {
      const result = await live.call(command, { item_id: item.item_id, provider_instance_id_or_domain: item.provider || "library" });
      if (gen !== generation) return;
      items = (Array.isArray(result) ? result : []).filter(x => x && x.uri).slice(0, 200); state = "ready";
    } catch (e) { if (gen === generation) { state = "error"; items = []; } }
    render();
  }
  function choose(i) { cat = i; index = 0; stack = null; chosen = null; load(i); render(); }
  async function run(kind) {
    const item = chosen;
    if (kind === "tracks") return showSongs(item);
    const media = kind === "radio" ? "radio_playlist://playlist/" + item.uri : item.uri;
    const ok = await play(media, kind === "radio" ? "replace" : kind);
    if (!ok) return;
    onNotice(kind === "next" ? item.name + " plays next" : kind === "add" ? item.name + " added to the queue" : "Playing " + item.name + (kind === "radio" ? " radio" : ""));
    if (kind === "replace" || kind === "radio") onLeave(true);
    else { column = "list"; chosen = null; render(); }
  }

  function row(list, label, detail, image, cls) {
    const li = document.createElement("li"), button = document.createElement("button");
    button.className = "browse-row" + (cls ? " " + cls : "");
    if (image !== undefined) {
      const thumb = document.createElement("span"); thumb.className = "browse-thumb";
      if (image) { const img = document.createElement("img"); img.alt = ""; img.src = image; img.onerror = () => img.remove(); thumb.appendChild(img); }
      button.appendChild(thumb);
    }
    const words = document.createElement("span"), name = document.createElement("strong"), by = document.createElement("span");
    words.className = "browse-words"; text(name, label); text(by, detail); words.appendChild(name); words.appendChild(by); button.appendChild(words);
    li.appendChild(button); list.appendChild(li); return button;
  }
  function render() {
    text(el(".panel-note"), "Plays on " + target());
    const list = el(".browse-list"); list.textContent = "";
    if (column === "actions" && chosen) {
      text(el(".browse-title"), chosen.name);
      actionsFor(chosen).forEach(([kind, label], i) => row(list, label, "", undefined, "browse-action").addEventListener("click", () => { action = i; run(kind); }));
    } else {
      text(el(".browse-title"), stack ? stack.title : CATEGORIES[cat].label);
      if (state === "loading") row(list, "Loading…", "", undefined, "browse-status");
      else if (state === "error") row(list, "Couldn’t load this list", "OK tries again", undefined, "browse-status").addEventListener("click", () => stack ? showSongs(stack.item) : (lists.delete(CATEGORIES[cat].id), load(cat)));
      else if (!items.length) row(list, stack ? "No songs here" : "Nothing here yet", stack ? "" : "Favourite music in Music Assistant and it appears here", undefined, "browse-status");
      items.forEach((item, i) => row(list, item.name, detailOf(item), imageUrl(thumbOf(item), host, 160)).addEventListener("click", () => { index = i; chosen = item; column = "actions"; action = 0; render(); }));
    }
    Array.from(el(".browse-cats").children).forEach((li, i) => li.firstChild.classList.toggle("chosen", i === cat));
    focus();
  }
  function buttons() { return Array.from((column === "cats" ? el(".browse-cats") : el(".browse-list")).querySelectorAll("button")); }
  function focus() {
    element.querySelectorAll("button.selected").forEach(b => { b.classList.remove("selected"); b.tabIndex = -1; });
    const list = buttons(), at = column === "cats" ? cat : column === "actions" ? action : index;
    const target = list[Math.max(0, Math.min(at, list.length - 1))];
    if (target) { target.classList.add("selected"); target.tabIndex = 0; target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest" }); }
  }
  function back() {
    if (column === "actions") { column = "list"; chosen = null; }
    else if (column === "list" && stack) { generation++; items = stack.parent.items; index = stack.parent.index; stack = null; state = "ready"; }
    else if (column === "list") column = "cats";
    else return onLeave(false);
    render();
  }
  return {
    open() { column = "cats"; if (state === "idle") choose(0); else render(); },
    close() { generation++; lists.clear(); items = []; state = "idle"; stack = null; chosen = null; },
    handleKey(name) {
      const count = buttons().length;
      if (name === "back") return back();
      if (name === "up" || name === "down") {
        const step = name === "up" ? -1 : 1;
        if (column === "cats") choose((cat + step + CATEGORIES.length) % CATEGORIES.length);
        else if (column === "actions") action = (action + step + count) % count;
        else if (count) index = Math.max(0, Math.min(count - 1, index + step));
      } else if (name === "right" && column === "cats") { if (items.length || state !== "ready") column = "list"; }
      else if (name === "left") back();
      else if (name === "ok") { const b = buttons()[column === "cats" ? cat : column === "actions" ? action : index]; if (column === "cats") { column = "list"; } else if (b) b.click(); }
      render();
    },
  };
}
