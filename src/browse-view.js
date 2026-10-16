import { imageUrl, thumbOf, timeLabel } from "./playback.js";
import { cleanQuery, flattenGroups, groupResults, searchArgs } from "./search.js";
import { createSearchField } from "./search-field.js";
import { createScrollCue } from "./scroll-cue.js";
import { addPage, emptyList, failedMore, loadingMore, MAX_ITEMS, pageArgs, wantsMore, windowFor } from "./browse-pages.js";
import { spokenDetail } from "./spoken-word.js";

// Browse: categories on the left, the chosen list on the right, and an
// item's actions in place of the list. Lists are read when a category is
// chosen and dropped when Browse closes; library lists read the next page as
// the focus nears their end (browse-pages.js), and only a window of rows is
// in the page. The list is rebuilt only when what it shows changes (or the
// window moves); arrow keys just move the selection.
const CONFIRM_MS = 2500; // how long a row reads "Added to the queue"
const ROW_VH = 9.4; // a list row's height (player.css .browse-row), for the window's spacers
// Search sits at the top; Browse opens on Recently played.
export const CATEGORIES = [
  { id: "search", label: "Search" },
  { id: "continue", label: "Continue listening", command: "music/in_progress_items", args: { limit: 30 }, empty: ["Nothing to carry on with", "Audiobooks and episodes you start show here"] },
  { id: "recent", label: "Recently played", command: "music/recently_played_items", args: { limit: 30, fully_played_only: false } },
  { id: "fav-playlists", label: "Favourite playlists", command: "music/playlists/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "fav-albums", label: "Favourite albums", command: "music/albums/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "fav-tracks", label: "Favourite songs", command: "music/tracks/library_items", args: { favorite: true, order_by: "timestamp_added_desc" } },
  { id: "fav-artists", label: "Favourite artists", command: "music/artists/library_items", args: { favorite: true, order_by: "sort_name" } },
  { id: "radio", label: "Radio stations", command: "music/radios/library_items", args: { order_by: "sort_name" } },
  { id: "playlists", label: "All playlists", command: "music/playlists/library_items", args: { order_by: "sort_name" } },
  { id: "albums", label: "All albums", command: "music/albums/library_items", args: { order_by: "timestamp_added_desc" } },
  { id: "podcasts", label: "Podcasts", command: "music/podcasts/library_items", args: { order_by: "sort_name" }, empty: ["No podcasts yet", "Add podcasts in Music Assistant and they appear here"] },
  { id: "audiobooks", label: "Audiobooks", command: "music/audiobooks/library_items", args: { order_by: "sort_name" }, empty: ["No audiobooks yet", "Add audiobooks in Music Assistant and they appear here"] },
];
// Library lists page on the server; the others are read whole.
const paged = c => /\/library_items$/.test(c.command || "");
// Where an album's, playlist's or artist's songs, or a podcast's episodes, are read.
const SONGS = { album: "music/albums/album_tracks", playlist: "music/playlists/playlist_tracks", artist: "music/artists/artist_tracks", podcast: "music/podcasts/podcast_episodes" };
const START = 2;
const KIND = { track: "Song", album: "Album", playlist: "Playlist", artist: "Artist", radio: "Radio", podcast: "Podcast", podcast_episode: "Episode", audiobook: "Audiobook" };
// Music Assistant builds radio from songs, albums, playlists and artists only.
const NO_RADIO = { radio: true, podcast: true, podcast_episode: true, audiobook: true };

// The actions an item offers; "tracks" opens an album, playlist or artist (or a podcast's episodes).
export function actionsFor(item) {
  const list = [["replace", "Play now"], ["next", "Play next"], ["add", "Add to the queue"]];
  if (!NO_RADIO[item.media_type]) list.push(["radio", "Start radio from this"]);
  if (SONGS[item.media_type]) list.push(["tracks", item.media_type === "podcast" ? "Show episodes" : "Show songs"]);
  return list;
}

export function detailOf(item) {
  const artists = (item.artists || []).map(a => a.name).filter(Boolean).join(", ");
  const parts = [KIND[item.media_type] || ""];
  if (artists) parts.push(artists);
  if (item.media_type === "album" && item.year) parts.push(item.year);
  if (item.media_type === "track" && item.duration) parts.push(timeLabel(item.duration));
  parts.push(spokenDetail(item));
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

export function createBrowse({ element, live, host, play, target, onNotice, onLeave }) {
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
  let pages = emptyList(), source = null; // the list's pages, and the category that reads more of it
  let lead = [], itemRows = [], tail = null, win = null; // the list column: rows before the items, the items in the window, the row after
  let actionRows = [], selected = null;
  let isOpen = false, running = false, confirmed = null; // confirmed: { uri, text } while an item's row confirms an action
  let query = ""; // the last search sent
  let backTo = null; // set while a page opened from elsewhere (Details): Back from it goes there
  const lists = new Map();

  const cats = CATEGORIES.map((c, i) => {
    const button = make("button", "", make("li", "", catList), c.label);
    button.tabIndex = -1;
    button.addEventListener("click", () => { column = "cats"; choose(i); });
    return button;
  });
  function changed() { version++; }
  function searching() { return CATEGORIES[cat].id === "search" && !stack; }
  // A "loading" tail belongs to a read that a newer list dropped: shown again, it may load again.
  function show(next) {
    pages = next.pages.tail === "loading" ? Object.assign({}, next.pages, { tail: "" }) : next.pages;
    items = pages.items; headings = next.headings || {}; source = next.source || null; win = null;
  }
  function current() { return { pages, headings, source }; }

  async function load(i) {
    const c = CATEGORIES[i], gen = ++generation;
    changed();
    if (lists.has(c.id)) { show(lists.get(c.id)); state = "ready"; return; }
    if (c.id === "search") { show({ pages: emptyList() }); state = "idle"; if (field.input.value) search(field.input.value, true); return; }
    show({ pages: emptyList() }); state = "loading"; render();
    try {
      const result = await live.call(c.command, paged(c) ? pageArgs(c.args, 0) : c.args);
      if (gen !== generation) return;
      show({ pages: addPage(emptyList(), result, paged(c)), source: paged(c) ? c : null });
      lists.set(c.id, current()); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; }
    changed(); render();
  }
  // The next page of a library list, kept with the category for this visit.
  async function more() {
    if (!source || !wantsMore(pages, index - leadCount())) return;
    const gen = generation, from = source, key = !stack && CATEGORIES[cat].id;
    pages = loadingMore(pages); changed();
    let next;
    try {
      const result = await live.call(from.command, pageArgs(from.args, pages.received));
      if (gen !== generation) return;
      next = addPage(pages, result, true);
    } catch (e) { if (gen !== generation) return; next = failedMore(pages); }
    pages = next; items = pages.items;
    if (key) lists.set(key, current());
    changed(); render();
  }
  function retryMore() { pages = Object.assign({}, pages, { tail: "" }); changed(); more(); render(); }
  // Searches Music Assistant; a newer search, Back or another category drops the answer.
  async function search(value, force) {
    if (!searching()) return;
    const q = cleanQuery(value);
    if (!force && q === query && state !== "error" && state !== "idle") return;
    const gen = ++generation;
    query = q; lists.delete("search"); show({ pages: emptyList() }); state = q ? "loading" : "idle"; changed(); render();
    if (!q) return;
    try {
      const found = flattenGroups(groupResults(await live.call("music/search", searchArgs(q))));
      if (gen !== generation) return;
      show({ pages: addPage(emptyList(), found.items, false), headings: found.headings }); lists.set("search", current()); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; }
    changed(); render();
  }
  // An album's, playlist's or artist's songs, or a podcast's episodes, read whole.
  // root: opened from elsewhere, so Back leaves Browse rather than returning to a list.
  async function showSongs(item, root) {
    const gen = ++generation, retrying = stack && stack.item === item;
    stack = { title: item.name, parent: root ? null : retrying ? stack.parent : Object.assign(current(), { index }), item };
    show({ pages: emptyList() }); state = "loading"; index = 0; column = "list"; changed(); render();
    try {
      const result = await live.call(SONGS[item.media_type], { item_id: item.item_id, provider_instance_id_or_domain: item.provider || "library" });
      if (gen !== generation) return;
      show({ pages: addPage(emptyList(), result, false) }); state = "ready";
    } catch (e) { if (gen !== generation) return; state = "error"; }
    changed(); render();
  }
  function choose(i) { cat = i; index = 0; stack = null; chosen = null; backTo = null; load(i); render(); }
  function retry() { if (stack) showSongs(stack.item, !stack.parent); else if (searching()) search(query, true); else { lists.delete(CATEGORIES[cat].id); load(cat); } }
  function toField() { column = "list"; index = 0; render(); }
  async function run(kind, button) {
    const item = chosen, gen = generation;
    if (kind === "tracks") return showSongs(item);
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
      itemRows.filter(b => b.dataset.uri === item.uri).forEach(b => { b.classList.remove("browse-added"); setDetail(b, detailOf(item)); });
    }, CONFIRM_MS);
  }
  function openItem(i) { index = i + leadCount(); chosen = items[i]; column = "actions"; action = 0; changed(); render(); }

  // The list column's rows, in order: the lead (the search field and any
  // status row), the items, then the tail. leadCount() is known before the
  // rows are built, so the focus can be placed in a list being rebuilt.
  function leadCount() { return (searching() ? 1 : 0) + (items.length ? 0 : statusShown() ? 1 : 0); }
  function statusShown() { return searching() ? state !== "idle" && state !== "ready" || (state === "ready" && !items.length) : true; }
  function rowCount() { return column === "actions" ? actionRows.length : leadCount() + items.length + (pages.tail ? 1 : 0); }
  function rowAt(i) {
    if (column === "actions") return actionRows[i];
    if (i < lead.length) return lead[i];
    const at = i - lead.length;
    if (at < items.length) return win && at >= win.start && at < win.end ? itemRows[at - win.start] : null;
    return tail;
  }

  function addRow(button, activate) { list.appendChild(make("li")).appendChild(button); button.addEventListener("click", activate); return button; }
  function status(label, detail, activate) { lead.push(addRow(makeRow(label, detail, undefined, "browse-status"), activate || (() => {}))); }
  function spacer(rows) { if (rows > 0) make("li", "browse-spacer", list).style.height = Math.round(rows * ROW_VH * 100) / 100 + "vh"; }
  function buildActions() {
    text(title, chosen.name);
    actionsFor(chosen).forEach(([kind, label], i) => { const b = makeRow(label, "", undefined, "browse-action"); actionRows.push(addRow(b, () => { action = i; run(kind, b); })); });
  }
  function buildSearchStatus() {
    if (state === "idle") make("li", "browse-hint", list, "OK opens the TV keyboard. Type or say an artist, album or song.");
    else if (state === "loading") status("Searching…", "");
    else if (state === "error") status("Search didn’t work", "OK tries again", retry);
    else if (!items.length) status("Nothing found for “" + query + "”", "Try fewer or different words");
  }
  function buildStatus() {
    const empty = stack ? [stack.item.media_type === "podcast" ? "No episodes here" : "No songs here", ""]
      : CATEGORIES[cat].empty || ["Nothing here yet", "Favourite music in Music Assistant and it appears here"];
    if (state === "loading") status("Loading…", "");
    else if (state === "error") status("Couldn’t load this list", "OK tries again", retry);
    else if (!items.length) status(empty[0], empty[1]);
  }
  function buildTail() {
    if (pages.tail === "loading") tail = makeRow("Loading more…", "", undefined, "browse-status");
    else if (pages.tail === "error") tail = makeRow("More couldn’t load", "OK tries again", undefined, "browse-status");
    else if (pages.tail === "cap") tail = makeRow("Showing the first " + MAX_ITEMS.toLocaleString("en-GB"), "", undefined, "browse-status");
    if (tail) addRow(tail, pages.tail === "error" ? retryMore : () => {});
  }
  function buildList() {
    text(title, stack ? stack.title : CATEGORIES[cat].label);
    if (searching()) { lead.push(field.row); buildSearchStatus(); } else buildStatus();
    // Grouped search results are short and keep their headings; long lists are windowed.
    const grouped = Object.keys(headings).length > 0;
    win = grouped ? { start: 0, end: items.length } : windowFor(items.length, Math.max(0, index - leadCount()), win);
    spacer(win.start);
    for (let i = win.start; i < win.end; i++) {
      const item = items[i];
      if (headings[i]) make("li", "browse-group", list, headings[i]);
      const done = confirmed && confirmed.uri === item.uri;
      const b = makeRow(item.name, done ? confirmed.text : detailOf(item), imageUrl(thumbOf(item), host, 160), done ? "browse-added" : "");
      b.dataset.uri = item.uri; itemRows.push(addRow(b, () => openItem(i)));
    }
    spacer(items.length - win.end);
    buildTail();
  }
  function rebuild() {
    built = version; lead = []; itemRows = []; actionRows = []; tail = null;
    if (selected) { selected.classList.remove("selected"); selected.tabIndex = -1; selected = null; }
    list.textContent = "";
    if (column === "actions" && chosen) buildActions(); else buildList();
    field.row.style.display = lead[0] === field.row && column !== "actions" ? "" : "none";
  }
  // The window moves when the focus nears its edge; long lists ask for more near their end.
  function follow() {
    if (column !== "list" || Object.keys(headings).length) return;
    const at = Math.max(0, index - leadCount()), next = windowFor(items.length, at, win);
    if (!win || next.start !== win.start || next.end !== win.end) { win = next; changed(); }
    more();
  }
  function render() {
    text(note, "Plays on " + target());
    follow();
    if (built !== version) rebuild();
    cats.forEach((b, i) => b.classList.toggle("chosen", i === cat && !backTo));
    focus();
  }
  // Marks the selected row; while the TV keyboard is up the field keeps focus.
  function focus() {
    const count = column === "cats" ? cats.length : rowCount(), at = column === "cats" ? cat : column === "actions" ? action : index;
    const next = field.typing ? field.row : column === "cats" ? cats[Math.max(0, Math.min(at, count - 1))] : rowAt(Math.max(0, Math.min(at, count - 1)));
    if (selected && selected !== next) { selected.classList.remove("selected"); selected.tabIndex = -1; }
    selected = next || null;
    if (!next) return;
    next.classList.add("selected"); next.tabIndex = 0;
    if (!field.typing) next.focus({ preventScroll: true });
    if (column === "cats") { next.scrollIntoView({ block: "nearest" }); cue.update(); } else cue.reveal(next);
  }
  function leave() { const to = backTo; backTo = null; stack = null; generation++; to(); }
  function back() {
    if (column === "actions") { column = "list"; chosen = null; changed(); }
    else if (column === "list" && stack && !stack.parent) return leave();
    else if (column === "list" && stack) { generation++; show(stack.parent); index = stack.parent.index; stack = null; state = "ready"; changed(); }
    else if (column === "list") column = "cats";
    else return onLeave(false);
    render();
  }
  function handleKey(name) {
    const count = rowCount();
    if (name === "back") return back();
    if (name === "up" || name === "down") {
      const step = name === "up" ? -1 : 1;
      if (column === "cats") return choose((cat + step + CATEGORIES.length) % CATEGORIES.length);
      if (column === "actions") action = (action + step + count) % count;
      else if (count) index = Math.max(0, Math.min(count - 1, index + step));
    } else if (name === "right" && column === "cats") { if (rowCount()) column = "list"; }
    else if (name === "left") return back();
    else if (name === "ok") {
      if (column === "cats") { if (rowCount()) column = "list"; }
      else { const b = rowAt(column === "actions" ? action : index); if (b) return b.click(); }
    }
    render();
  }
  return {
    open() { column = "cats"; if (isOpen) return render(); isOpen = true; choose(START); },
    // Opens an album's, artist's or podcast's page from elsewhere; Back calls onBack.
    openPage(item, onBack) {
      isOpen = true; cat = START; chosen = null; stack = null; backTo = onBack;
      showSongs(item, true);
    },
    close() {
      isOpen = false; confirmed = null; running = false; generation++; lists.clear(); backTo = null;
      field.reset(); query = ""; show({ pages: emptyList() }); state = "idle"; stack = null; chosen = null; changed();
    },
    handleKey,
  };
}
