import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom.mjs";
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
    play: async (media, option) => { plays.push({ media, option }); return true; },
    onNotice: text => notices.push(text), onLeave: toNow => leaves.push(toNow) });
  const names = () => element.querySelector(".browse-list").querySelectorAll("strong").map(s => s.textContent);
  const selected = () => element.querySelector(".selected");
  return { doc, browse, element, calls, plays, notices, leaves, names, selected, key: name => browse.handleKey(name) };
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
