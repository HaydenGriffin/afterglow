import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { actionsFor, CATEGORIES, createBrowse, detailOf } from "../src/browse-view.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
const album = { item_id: "7", provider: "library", media_type: "album", uri: "library://album/7", name: "Coastline", artists: [{ name: "Demo" }] };
const song = n => ({ item_id: String(n), provider: "library", media_type: "track", uri: "library://track/" + n, name: "Song " + n });

// A Browse over a fake document and a Music Assistant whose calls stay
// pending until the test answers them.
function harness(t) {
  const doc = useFakeDocument(t);
  const calls = [], plays = [], notices = [], leaves = [];
  const live = { call(command, args) { return new Promise((resolve, reject) => calls.push({ command, args, resolve, reject })); } };
  const element = doc.createElement("section");
  doc.body.appendChild(element);
  const browse = createBrowse({ element, live, host: "ma", target: () => "Kitchen",
    play: async (media, option) => { plays.push({ media, option }); return h.playResult; },
    onNotice: text => notices.push(text), onLeave: toNow => leaves.push(toNow) });
  let h;
  const names = () => element.querySelector(".browse-list").querySelectorAll("strong").map(s => s.textContent);
  const selected = () => element.querySelector(".selected");
  h = { doc, browse, element, calls, plays, notices, leaves, names, selected, playResult: true, key: name => browse.handleKey(name) };
  return h;
}
// Opens Browse on its first list and answers it with the given items.
async function openWith(h, items) {
  h.browse.open();
  h.calls[h.calls.length - 1].resolve(items); await settle();
  h.key("right");
}

test("Back while an album's songs load keeps the list; the late answer is dropped", async t => {
  const h = harness(t);
  await openWith(h, [album]);
  h.key("ok"); // the album's actions
  const show = actionsFor(album).findIndex(([kind]) => kind === "tracks");
  for (let i = 0; i < show; i++) h.key("down");
  h.key("ok"); // Show songs: pending
  assert.equal(h.calls[h.calls.length - 1].command, "music/albums/album_tracks");
  h.key("back");
  assert.deepEqual(h.names(), ["Coastline"]);
  h.calls[h.calls.length - 1].resolve([song(1), song(2)]); await settle();
  assert.deepEqual(h.names(), ["Coastline"], "songs that arrive after Back must not replace the list");
});

test("moving through a list only moves the selection; rows are not rebuilt", async t => {
  const h = harness(t);
  const art = { type: "thumb", path: "https://example.org/a.jpg", remotely_accessible: true };
  await openWith(h, [1, 2, 3, 4].map(n => Object.assign(song(n), { metadata: { images: [art] } })));
  const before = h.doc.created, firstImage = h.element.querySelector("img");
  h.key("down"); h.key("down");
  assert.equal(h.doc.created, before, "arrow keys must not create elements");
  assert.equal(h.element.querySelector("img"), firstImage);
  assert.equal(h.selected().textContent, "Song 3Song");
  h.key("up");
  assert.equal(h.selected().textContent, "Song 2Song");
  assert.equal(h.element.querySelectorAll(".selected").length, 1);
});

test("an artist offers Show songs and reads the artist's tracks", async t => {
  const h = harness(t);
  const artist = { item_id: "3", provider: "spotify--x", media_type: "artist", uri: "spotify://artist/3", name: "Demo Ensemble" };
  assert.ok(actionsFor(artist).some(([kind]) => kind === "tracks"));
  await openWith(h, [artist]);
  h.key("ok");
  const show = actionsFor(artist).findIndex(([kind]) => kind === "tracks");
  for (let i = 0; i < show; i++) h.key("down");
  h.key("ok");
  const call = h.calls[h.calls.length - 1];
  assert.equal(call.command, "music/artists/artist_tracks");
  assert.deepEqual(call.args, { item_id: "3", provider_instance_id_or_domain: "spotify--x" });
  call.resolve([song(1)]); await settle();
  assert.deepEqual(h.names(), ["Song 1"]);
  assert.equal(h.element.querySelector(".browse-title").textContent, "Demo Ensemble");
});

test("a list that fails says so, and OK tries again", async t => {
  const h = harness(t);
  h.browse.open();
  h.calls[0].reject(Error("offline")); await settle();
  h.key("right");
  assert.deepEqual(h.names(), ["Couldn’t load this list"]);
  h.key("ok");
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.names(), ["Loading…"]);
  h.calls[1].resolve([song(1)]); await settle();
  assert.deepEqual(h.names(), ["Song 1"]);
});

test("songs that fail to load can be retried, and Back returns to the list", async t => {
  const h = harness(t);
  await openWith(h, [album]);
  h.key("ok");
  for (let i = 0; i < 4; i++) h.key("down");
  h.key("ok");
  h.calls[h.calls.length - 1].reject(Error("offline")); await settle();
  assert.deepEqual(h.names(), ["Couldn’t load this list"]);
  h.key("ok");
  assert.equal(h.calls[h.calls.length - 1].command, "music/albums/album_tracks");
  h.calls[h.calls.length - 1].resolve([song(4)]); await settle();
  assert.deepEqual(h.names(), ["Song 4"]);
  h.key("back");
  assert.deepEqual(h.names(), ["Coastline"]);
});

test("lists are read once while Browse is open and afresh after it closes", async t => {
  const h = harness(t);
  await openWith(h, [song(1)]);
  h.key("left"); h.key("down");
  h.calls[1].resolve([album]); await settle();
  h.key("up");
  assert.equal(h.calls.length, 2, "the first list comes from the cache");
  assert.equal(h.element.querySelectorAll(".selected").length, 1, "one row is selected across categories");
  assert.deepEqual(h.names(), ["Song 1"]);
  h.browse.close(); h.browse.open();
  assert.equal(h.calls.length, 3, "closing drops the cache");
});

test("a late answer for a category left behind does not replace the current one", async t => {
  const h = harness(t);
  h.browse.open(); h.key("down");
  h.calls[1].resolve([album]); await settle();
  h.calls[0].resolve([song(9)]); await settle();
  assert.deepEqual(h.names(), ["Coastline"]);
});

test("Play next and Add to the queue confirm on the item's own row, then settle", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(t);
  await openWith(h, [album, song(2)]);
  h.key("ok"); h.key("down"); h.key("down"); // Add to the queue
  h.key("ok"); await settle();
  assert.deepEqual(h.plays, [{ media: "library://album/7", option: "add" }]);
  const row = h.selected();
  assert.ok(row.classList.contains("browse-added"), "the row carries the tick");
  assert.equal(row.querySelector("strong").textContent, "Coastline");
  assert.equal(row.querySelectorAll("span").pop().textContent, "Added to the queue");
  h.key("down"); h.key("up");
  assert.ok(h.selected().classList.contains("browse-added"), "moving does not lose it");
  t.mock.timers.tick(3000);
  assert.ok(!h.selected().classList.contains("browse-added"));
  assert.equal(h.selected().querySelectorAll("span").pop().textContent, "Album · Demo");
});

test("an action that fails says so on its row and stays put", async t => {
  const h = harness(t);
  await openWith(h, [album]);
  h.key("ok"); h.key("down"); // Play next
  h.playResult = false;
  h.key("ok"); await settle();
  assert.equal(h.selected().querySelector("strong").textContent, "Play next");
  assert.equal(h.selected().querySelectorAll("span").pop().textContent, "Couldn’t do that. OK tries again");
});

// Search: the first category, a real text field for the TV keyboard.
const artist = { item_id: "3", provider: "library", media_type: "artist", uri: "library://artist/3", name: "Demo Ensemble" };
function startSearch(h) {
  h.browse.open();
  h.calls[0].resolve([album]);
  h.key("up"); h.key("up"); h.key("right"); // past Continue listening to Search
  const input = h.element.querySelector("input");
  assert.ok(h.selected().contains(input), "Right from Search selects the field");
  assert.notEqual(h.doc.activeElement, input, "selecting the field must not open the keyboard");
  h.key("ok");
  assert.equal(h.doc.activeElement, input, "OK puts the keyboard on the field");
  return input;
}
const type = (input, value, keyCode) => { input.value = value; input.dispatch("input"); if (keyCode) input.dispatch("keydown", { keyCode, key: keyCode === 13 ? "Enter" : "" }); };
const headings = h => h.element.querySelectorAll(".browse-group").map(g => g.textContent);

test("Search sits above the categories; Enter searches and results come grouped", async t => {
  const h = harness(t);
  assert.equal(h.element.querySelector(".browse-cats").querySelector("button").textContent, "Search");
  const input = startSearch(h);
  const before = h.calls.length;
  type(input, "  demo  ", 13);
  assert.notEqual(h.doc.activeElement, input, "Enter puts the keyboard away");
  assert.equal(h.calls.length, before + 1);
  assert.equal(h.calls[before].command, "music/search");
  assert.equal(h.calls[before].args.search_query, "demo");
  assert.deepEqual(h.names(), ["Searching…"]);
  h.calls[before].resolve({ artists: [artist], tracks: [song(1), song(2)], albums: [] });
  await settle();
  assert.deepEqual(headings(h), ["Artists", "Songs"]);
  assert.deepEqual(h.names(), ["Demo Ensemble", "Song 1", "Song 2"]);
  h.key("down");
  assert.equal(h.selected().querySelector("strong").textContent, "Demo Ensemble");
  h.key("ok");
  assert.equal(h.names()[0], "Play now");
  h.key("back");
  assert.deepEqual(h.names(), ["Demo Ensemble", "Song 1", "Song 2"], "Back from actions returns to the results");
  assert.equal(input.value, "  demo  ");
});

test("only the latest search's answer is shown", async t => {
  const h = harness(t);
  const input = startSearch(h);
  const first = h.calls.length;
  type(input, "dem", 13);
  h.key("ok"); type(input, "demo", 13);
  h.calls[first + 1].resolve({ tracks: [song(2)] }); await settle();
  h.calls[first].resolve({ tracks: [song(1)] }); await settle();
  assert.deepEqual(h.names(), ["Song 2"]);
});

test("search says when nothing is found, and a failed search can be retried", async t => {
  const h = harness(t);
  const input = startSearch(h);
  const at = h.calls.length;
  type(input, "zz", 13);
  h.calls[at].resolve({ artists: [], tracks: [] }); await settle();
  assert.deepEqual(h.names(), ["Nothing found for “zz”"]);
  h.key("ok"); type(input, "yy", 13);
  h.calls[at + 1].reject(Error("offline")); await settle();
  assert.deepEqual(h.names(), ["Search didn’t work"]);
  h.key("down"); h.key("ok");
  assert.equal(h.calls[at + 2].args.search_query, "yy");
});

test("Back leaves the field, then the list, without a dead end", t => {
  const h = harness(t);
  const input = startSearch(h);
  const event = input.dispatch("keydown", { keyCode: 461 });
  assert.ok(event.defaultPrevented);
  assert.notEqual(h.doc.activeElement, input);
  assert.ok(h.selected().contains(input), "the field stays selected");
  h.key("back");
  assert.equal(h.selected().textContent, "Search");
  h.key("back");
  assert.deepEqual(h.leaves, [false]);
});

test("voice or keyboard text searches after a pause; the TV keyboard closing searches too", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(t);
  const input = startSearch(h);
  const at = h.calls.length;
  type(input, "low tide");
  t.mock.timers.tick(500);
  assert.equal(h.calls.length, at);
  t.mock.timers.tick(600);
  assert.equal(h.calls[at].args.search_query, "low tide");
  assert.equal(h.doc.activeElement, input, "results arriving while typing keep the keyboard");
  h.calls[at].resolve({ tracks: [song(5)] }); await settle();
  assert.equal(h.doc.activeElement, input);
  type(input, "home");
  h.doc.dispatch("keyboardStateChange", { detail: { visibility: false } });
  assert.notEqual(h.doc.activeElement, input);
  assert.equal(h.calls[at + 1].args.search_query, "home");
  t.mock.timers.tick(2000);
  assert.equal(h.calls.length, at + 2, "the pending pause does not search twice");
});

test("Down from the field after a voice search leaves it for the first result", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(t);
  const input = startSearch(h);
  const at = h.calls.length;
  type(input, "low tide");
  t.mock.timers.tick(1100); // the pause searches; the field keeps focus
  h.calls[at].resolve({ tracks: [song(5), song(6)] }); await settle();
  assert.equal(h.doc.activeElement, input);
  const event = input.dispatch("keydown", { keyCode: 40 });
  assert.ok(event.defaultPrevented, "the page, not the field, takes Down");
  assert.notEqual(h.doc.activeElement, input, "Down puts the keyboard away");
  assert.equal(h.selected().querySelector("strong").textContent, "Song 5");
  assert.equal(h.calls.length, at + 1, "the same text is not searched again");
  h.key("down");
  assert.equal(h.selected().querySelector("strong").textContent, "Song 6");
});

test("Down with text still pending searches it and moves below the field", async t => {
  const h = harness(t);
  const input = startSearch(h);
  const at = h.calls.length;
  type(input, "home");
  input.dispatch("keydown", { keyCode: 40 });
  assert.equal(h.calls[at].args.search_query, "home");
  assert.equal(h.selected().querySelector("strong").textContent, "Searching…");
  h.calls[at].resolve({ tracks: [song(1)] }); await settle();
  assert.equal(h.selected().querySelector("strong").textContent, "Song 1");
});

test("Up from the field leaves it with the field still selected", t => {
  const h = harness(t);
  const input = startSearch(h);
  const event = input.dispatch("keydown", { keyCode: 38 });
  assert.ok(event.defaultPrevented);
  assert.notEqual(h.doc.activeElement, input);
  assert.ok(h.selected().contains(input));
});

// Long lists: library lists read the next page near their end; only a window of rows is built.
const many = (from, count) => Array.from({ length: count }, (_, i) => Object.assign(song(from + i), { name: "Song " + (from + i) }));
async function openCategory(h, id, items) {
  h.browse.open();
  h.calls[0].resolve([]); await settle();
  const want = CATEGORIES.findIndex(c => c.id === id), from = CATEGORIES.findIndex(c => c.id === "recent");
  for (let i = from; i < want; i++) h.key("down");
  const call = h.calls[h.calls.length - 1];
  call.resolve(items); await settle();
  h.key("right");
  return call;
}

test("a library list reads the next page as the focus nears its end, with Loading more…", async t => {
  const h = harness(t);
  const first = await openCategory(h, "albums", many(0, 60));
  assert.deepEqual(first.args, { order_by: "timestamp_added_desc", limit: 60, offset: 0 });
  const before = h.calls.length;
  for (let i = 0; i < 45; i++) h.key("down");
  assert.equal(h.calls.length, before, "no read while far from the end");
  for (let i = 0; i < 5; i++) h.key("down");
  assert.equal(h.calls.length, before + 1, "one read near the end");
  assert.deepEqual(h.calls[before].args, { order_by: "timestamp_added_desc", limit: 60, offset: 60 });
  h.key("down");
  assert.equal(h.calls.length, before + 1, "never two at once");
  assert.equal(h.names().pop(), "Loading more…");
  h.calls[before].resolve(many(60, 20)); await settle();
  assert.equal(h.names().pop(), "Song 79");
  for (let i = 0; i < 40; i++) h.key("down");
  assert.equal(h.calls.length, before + 1, "a short page ends the list");
  assert.equal(h.selected().querySelector("strong").textContent, "Song 79");
});

test("a failed page says so at the end and OK tries again", async t => {
  const h = harness(t);
  await openCategory(h, "albums", many(0, 60));
  for (let i = 0; i < 55; i++) h.key("down");
  h.calls[h.calls.length - 1].reject(Error("offline")); await settle();
  assert.equal(h.names().pop(), "More couldn’t load");
  for (let i = 0; i < 10; i++) h.key("down");
  h.key("ok");
  assert.deepEqual(h.calls[h.calls.length - 1].args.offset, 60);
  assert.equal(h.names().pop(), "Loading more…");
});

test("a long whole list is kept and windowed: rows stay bounded and follow the focus", async t => {
  const h = harness(t);
  await openWith(h, [album]);
  h.key("ok");
  const show = actionsFor(album).findIndex(([kind]) => kind === "tracks");
  for (let i = 0; i < show; i++) h.key("down");
  h.key("ok");
  h.calls[h.calls.length - 1].resolve(many(0, 1500)); await settle();
  const rows = () => h.element.querySelector(".browse-list").querySelectorAll("button").length;
  assert.ok(rows() <= 80, "at most a window of rows in the page");
  assert.equal(h.element.querySelectorAll(".browse-spacer").length, 1, "a spacer stands for the rows below");
  for (let i = 0; i < 1200; i++) h.key("down");
  assert.equal(h.selected().querySelector("strong").textContent, "Song 1200");
  assert.ok(rows() <= 80);
  assert.equal(h.element.querySelectorAll(".browse-spacer").length, 2);
  h.key("ok");
  assert.equal(h.names()[0], "Play now", "the focused song opens");
  h.key("back");
  assert.equal(h.selected().querySelector("strong").textContent, "Song 1200", "Back returns to it");
});

test("Continue listening sits under Search and reads Music Assistant's in-progress items", async t => {
  const h = harness(t);
  assert.deepEqual(CATEGORIES.slice(0, 3).map(c => c.label), ["Search", "Continue listening", "Recently played"]);
  assert.deepEqual(CATEGORIES.slice(-2).map(c => c.label), ["Podcasts", "Audiobooks"]);
  h.browse.open();
  assert.equal(h.calls[0].command, "music/recently_played_items", "Browse still opens on Recently played");
  h.calls[0].resolve([]); await settle();
  h.key("up");
  const call = h.calls[1];
  assert.deepEqual([call.command, call.args], ["music/in_progress_items", { limit: 30 }]);
  call.resolve([]); await settle();
  assert.deepEqual(h.names(), ["Nothing to carry on with"]);
});

test("a podcast offers its episodes and no radio; spoken word reads its own detail", async t => {
  const h = harness(t);
  const podcast = { item_id: "9", provider: "library", media_type: "podcast", uri: "library://podcast/9", name: "Quiet hour", publisher: "Demo", total_episodes: 3 };
  assert.deepEqual(actionsFor(podcast).map(([, label]) => label), ["Play now", "Play next", "Add to the queue", "Show episodes"]);
  assert.deepEqual(actionsFor({ media_type: "audiobook" }).map(([kind]) => kind), ["replace", "next", "add"]);
  assert.equal(detailOf(podcast), "Podcast · Demo · 3 episodes");
  assert.equal(detailOf({ media_type: "audiobook", authors: [{ name: "A Writer" }] }), "Audiobook · A Writer");
  await openWith(h, [podcast]);
  h.key("ok"); for (let i = 0; i < 3; i++) h.key("down"); h.key("ok");
  const call = h.calls[h.calls.length - 1];
  assert.deepEqual([call.command, call.args], ["music/podcasts/podcast_episodes", { item_id: "9", provider_instance_id_or_domain: "library" }]);
  call.resolve([]); await settle();
  assert.deepEqual(h.names(), ["No episodes here"]);
});

test("a page opened from Details goes back there", async t => {
  const h = harness(t);
  let backs = 0;
  h.browse.openPage({ item_id: "a1", provider: "spotify--x", media_type: "album", name: "Coastline" }, () => backs++);
  const call = h.calls[0];
  assert.deepEqual([call.command, call.args], ["music/albums/album_tracks", { item_id: "a1", provider_instance_id_or_domain: "spotify--x" }]);
  call.resolve([song(1), song(2)]); await settle();
  assert.equal(h.element.querySelector(".browse-title").textContent, "Coastline");
  assert.equal(h.selected().querySelector("strong").textContent, "Song 1");
  h.key("ok"); h.key("back");
  assert.equal(backs, 0, "Back from a song's actions returns to the songs");
  h.key("back");
  assert.equal(backs, 1);
  assert.deepEqual(h.leaves, []);
});

test("a song can go into a playlist from Browse; its row confirms in the list", async t => {
  const doc = useFakeDocument(t);
  const { createPlaylists } = await import("../src/playlists.js");
  const answers = {
    "music/recently_played_items": [song(1), album],
    "music/playlists/library_items": [{ item_id: "4", name: "Sunday", is_editable: true }],
    "music/playlists/add_playlist_tracks": { id: "t", status: "success", progress_text: "Added 1 item(s) to playlist" },
  };
  const calls = [];
  const live = { call(command, args) { calls.push({ command, args }); return Promise.resolve(answers[command]); } };
  const playlists = createPlaylists({ call: live.call, wait: () => Promise.resolve() });
  const element = doc.createElement("section"); doc.body.appendChild(element);
  const browse = createBrowse({ element, live, host: "ma", target: () => "Kitchen", play: async () => true, onNotice: () => {}, onLeave: () => {}, playlists });
  const names = () => element.querySelector(".browse-list").querySelectorAll("strong").map(s => s.textContent);
  browse.open(); await settle(); browse.handleKey("right");
  assert.ok(actionsFor(album, true).every(([kind]) => kind !== "playlist"), "albums are not offered for now");
  browse.handleKey("ok");
  const at = actionsFor(song(1), true).findIndex(([kind]) => kind === "playlist");
  assert.equal(names()[at], "Add to a playlist");
  for (let i = 0; i < at; i++) browse.handleKey("down");
  browse.handleKey("ok"); await settle();
  assert.deepEqual(names(), ["New playlist", "Sunday"]);
  browse.handleKey("back");
  assert.equal(names()[0], "Play now", "Back from the picker returns to the song's actions");
  browse.handleKey("ok"); await settle(); // Add to a playlist again (the focus stayed there)
  browse.handleKey("down"); browse.handleKey("ok");
  await settle(); await settle();
  assert.deepEqual(calls.find(c => c.command === "music/playlists/add_playlist_tracks").args, { db_playlist_id: "4", uris: ["library://track/1"] });
  const row = element.querySelector(".browse-added");
  assert.ok(row, "the song's row ticks");
  assert.equal(row.querySelector("span span").textContent, "Added to “Sunday”");
  browse.close();
});
