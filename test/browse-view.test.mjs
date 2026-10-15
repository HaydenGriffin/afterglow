import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { actionsFor, createBrowse } from "../src/browse-view.js";

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
  h.key("up"); h.key("right");
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
