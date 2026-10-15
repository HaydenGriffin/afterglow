import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { createIdle, idleTiles, IDLE_AFTER_MS, PAUSED_IDLE_AFTER_MS, REST_AFTER_MS } from "../src/idle-view.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
const album = n => ({ item_id: String(n), provider: "library", media_type: "album", uri: "library://album/" + n, name: "Album " + n, artists: [{ name: "Demo" }] });
const pausedQueue = { queue_id: "q", display_name: "Kitchen", state: "paused",
  current_item: { queue_item_id: "x", media_item: { media_type: "track", uri: "library://track/1", name: "Low tide", artists: [{ name: "Demo" }] } } };

function harness(t, queue) {
  const doc = useFakeDocument(t);
  let time = Date.UTC(2026, 9, 15, 12);
  const calls = [], plays = [], resumes = [], browses = [];
  const live = { playback: { queue, connected: true }, call(command, args) { return new Promise((resolve, reject) => calls.push({ command, args, resolve, reject })); } };
  const element = doc.createElement("div");
  let h;
  const idle = createIdle({ element, live, host: "ma", now: () => time,
    play: async (media, option) => { plays.push({ media, option }); return h.playResult; },
    resume: async () => { resumes.push(true); return true; }, onBrowse: () => browses.push(true) });
  h = { doc, idle, playResult: true, element, live, calls, plays, resumes, browses,
    advance(ms) { time += ms; idle.update(h.allowed); }, allowed: true,
    title: () => element.querySelector(".idle-title").textContent,
    detail: () => element.querySelector(".idle-detail").textContent,
    hint: () => element.querySelector(".idle-hint").textContent,
    tiles: () => element.querySelectorAll("button") };
  idle.update(true);
  return h;
}

test("the idle poster waits until nothing has played for a while, and leaves when music starts", async t => {
  const h = harness(t, null);
  assert.equal(h.idle.showing, false);
  h.advance(IDLE_AFTER_MS - 1000);
  assert.equal(h.idle.showing, false);
  h.advance(1000);
  assert.equal(h.idle.showing, true);
  assert.ok(h.element.classList.contains("shown"));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].command, "music/recently_played_items");
  assert.equal(h.title(), "Nothing playing");
  assert.equal(h.detail(), "Finding what you played…");
  h.calls[0].resolve([album(1), album(2)]); await settle();
  assert.equal(h.title(), "Album 1");
  assert.equal(h.hint(), "OK plays it");
  h.live.playback = { queue: { state: "playing" } };
  h.advance(1000);
  assert.equal(h.idle.showing, false);
  assert.ok(!h.element.classList.contains("shown"));
});

test("not while a panel or menu is open", t => {
  const h = harness(t, null);
  h.allowed = false;
  h.advance(IDLE_AFTER_MS * 2);
  assert.equal(h.idle.showing, false);
  h.allowed = true;
  h.advance(1000);
  assert.equal(h.idle.showing, true, "closing the panel brings it straight back");
});

test("the paused song comes first and OK resumes it; right then OK plays a recent item", async t => {
  const h = harness(t, pausedQueue);
  h.advance(IDLE_AFTER_MS);
  assert.equal(h.idle.showing, false, "a short pause is left alone");
  h.advance(PAUSED_IDLE_AFTER_MS - IDLE_AFTER_MS);
  h.calls[0].resolve([album(1), album(2)]); await settle();
  assert.equal(h.title(), "Low tide");
  assert.equal(h.detail(), "Paused · Demo");
  assert.equal(h.hint(), "OK resumes");
  assert.equal(h.idle.handleKey("ok"), true); await settle();
  assert.equal(h.resumes.length, 1);
  assert.equal(h.idle.handleKey("right"), true);
  assert.equal(h.title(), "Album 1");
  assert.equal(h.element.querySelectorAll(".selected").length, 1);
  h.idle.handleKey("ok"); await settle();
  assert.deepEqual(h.plays, [{ media: "library://album/1", option: "replace" }]);
});

test("Browse ends the strip; other keys keep their meaning", async t => {
  const h = harness(t, null);
  h.advance(IDLE_AFTER_MS);
  h.calls[0].resolve([album(1)]); await settle();
  for (const name of ["back", "up", "down", "red", "playpause"]) assert.equal(h.idle.handleKey(name), false, name);
  h.idle.handleKey("right"); h.idle.handleKey("right");
  assert.equal(h.title(), "Browse");
  h.idle.handleKey("ok");
  assert.equal(h.browses.length, 1);
  h.idle.handleKey("left"); h.idle.handleKey("left"); h.idle.handleKey("left");
  assert.equal(h.title(), "Album 1", "left stops at the first tile");
  assert.ok(h.element.classList.contains("neutral"), "a recent item has no palette: neutral fields");
});

test("nothing played yet, and a failed read that OK retries, are said plainly", async t => {
  const h = harness(t, null);
  h.advance(IDLE_AFTER_MS);
  h.calls[0].resolve([]); await settle();
  assert.equal(h.detail(), "Play something in Music Assistant and it shows here");
  assert.equal(h.tiles().length, 1);
  h.idle.handleKey("ok");
  assert.equal(h.browses.length, 1);

  const e = harness(t, null);
  e.advance(IDLE_AFTER_MS);
  e.calls[0].reject(Error("offline")); await settle();
  assert.equal(e.detail(), "Couldn’t load what you played");
  assert.equal(e.hint(), "OK tries again");
  e.idle.handleKey("ok");
  assert.equal(e.calls.length, 2);
  e.calls[1].resolve([album(3)]); await settle();
  assert.equal(e.title(), "Album 3");
});

test("an answer that arrives after the poster left is dropped", async t => {
  const h = harness(t, null);
  h.advance(IDLE_AFTER_MS);
  h.live.playback = { queue: { state: "playing" } }; h.advance(1000);
  h.calls[0].resolve([album(1)]); await settle();
  h.live.playback = { queue: null }; h.advance(0); h.advance(IDLE_AFTER_MS);
  assert.equal(h.idle.showing, true);
  assert.equal(h.title(), "Nothing playing", "the dropped answer was not used");
  assert.equal(h.calls.length, 2, "showing again reads afresh");
});

test("after a few quiet minutes it dims; the first key only wakes it", async t => {
  const h = harness(t, null);
  h.advance(IDLE_AFTER_MS);
  h.calls[0].resolve([album(1)]); await settle();
  h.advance(REST_AFTER_MS);
  assert.ok(h.element.classList.contains("rest"));
  assert.equal(h.idle.handleKey("ok"), true);
  assert.ok(!h.element.classList.contains("rest"));
  assert.equal(h.plays.length, 0, "a key in the dark does not start music");
  h.idle.handleKey("ok"); await settle();
  assert.equal(h.plays.length, 1);
});

test("a failed play says so on the poster", async t => {
  const h = harness(t, null);
  h.advance(IDLE_AFTER_MS);
  h.calls[0].resolve([album(1)]); await settle();
  h.playResult = false;
  h.idle.handleKey("ok");
  assert.equal(h.hint(), "Starting…");
  await settle();
  assert.equal(h.hint(), "Couldn’t start it. OK tries again");
});

test("tiles are bounded and skip the paused song in the recent list", () => {
  const recent = Array.from({ length: 20 }, (_, i) => album(i)).concat([{ media_type: "track", uri: "library://track/1", name: "Low tide" }]);
  const tiles = idleTiles({ queue: pausedQueue }, recent, "ready");
  assert.equal(tiles[0].kind, "resume");
  assert.equal(tiles.filter(t => t.kind === "play").length, 8);
  assert.equal(tiles[tiles.length - 1].kind, "browse");
  assert.equal(tiles.filter(t => t.item && t.item.uri === "library://track/1").length, 1);
});
