import test from "node:test";
import assert from "node:assert/strict";
import { createPlayback } from "../src/playback.js";

// Every model here is given its lyricsSearch (a fake, or null): nothing in
// this file can reach lrclib.net.
const settle = () => new Promise((resolve) => setImmediate(resolve));
const track = (id) => ({
  queue_item_id: id,
  duration: 350,
  media_item: { media_type: "track", uri: "library://track/" + id, name: "Song", artists: [{ name: "Artist" }], album: { name: "Album" } },
});
const found = async () => ({ lrc: "[00:01]Found", plain: "" });

function setup(call, lyricsSearch) {
  assert.notEqual(lyricsSearch, undefined, "undefined would fall back to the real LRCLIB search");
  const queue = { queue_id: "tv", state: "playing", current_item: track("one") };
  const live = { playback: { queue, connected: true, position: 20 }, call };
  const model = createPlayback({ live, host: "ma", lyricsSearch });
  model.wantLyrics(true);
  model.tick();
  return { model, queue };
}

test("lyrics fallback still runs when Music Assistant rejects the request", async () => {
  const { model } = setup(async () => { throw Error("timeout"); }, found);
  await settle();
  assert.equal(model.snapshot().lyrics.status, "timed");
});

test("a slow Music Assistant lookup cannot block the fallback indefinitely", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { model } = setup(() => new Promise(() => {}), found);
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(model.snapshot().lyrics.status, "timed");
});

test("leaving a song does not start its fallback after a late failure", async () => {
  let reject;
  let asked = 0;
  const { model } = setup(() => new Promise((_, no) => { reject = no; }), async () => { asked++; return null; });
  model.stop();
  reject(Error("late"));
  await settle();
  assert.equal(asked, 0);
});

test("retry invalidates a cached no-lyrics result", async () => {
  let available = false;
  const { model } = setup(async () => [null, null], async () => (available ? found() : null));
  await settle();
  assert.equal(model.snapshot().lyrics.status, "missing");
  available = true;
  model.retryLyrics();
  model.tick();
  await settle();
  assert.equal(model.snapshot().lyrics.status, "timed");
});

test("provider errors stay retryable instead of being cached as missing", async () => {
  let calls = 0;
  const { model } = setup(async () => [null, null], async () => { calls++; throw Error("rate limited"); });
  await settle();
  assert.equal(model.snapshot().lyrics.status, "error");
  model.retryLyrics();
  model.tick();
  await settle();
  assert.equal(calls, 2);
});

test("lyrics timing adjusts the words without moving playback or seek targets", async () => {
  let offset = 300;
  let sought;
  const live = {
    playback: { queue: { queue_id: "tv", state: "playing", current_item: track("one") }, connected: true, position: 20, lyricPosition: 19.925 },
    call: async (_, args) => { sought = args.position; },
  };
  const model = createPlayback({ live, host: "ma", lyricsSearch: null, lyricsOffset: () => offset });
  assert.equal(model.snapshot().lyricPosition, 19.625);
  assert.equal(model.snapshot().position, 20);
  await model.command("seek_by", 10);
  assert.equal(sought, 30);
  offset = -500;
  assert.equal(model.snapshot().lyricPosition, 20.425);
});

test("temporary failures get one delayed automatic retry, without hammering the provider", async () => {
  let time = 1000;
  let calls = 0;
  const live = {
    playback: { queue: { queue_id: "tv", state: "playing", current_item: track("one") }, connected: true, position: 20 },
    call: async () => { calls++; throw Error("unavailable"); },
  };
  const model = createPlayback({ live, host: "ma", lyricsSearch: null, now: () => time });
  model.wantLyrics(true);
  model.tick();
  await settle();
  assert.equal(model.snapshot().lyrics.retryAt, 31000);
  time = 30999;
  model.tick();
  await settle();
  assert.equal(calls, 1);
  time = 31000;
  model.tick();
  await settle();
  assert.equal(calls, 2);
  assert.equal(model.snapshot().lyrics.retryAt, 0);
  time = 100000;
  model.tick();
  await settle();
  assert.equal(calls, 2);
});

test("a Music Assistant failure followed by an LRCLIB miss stays retryable", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let time = 1000;
  let maCalls = 0;
  const queue = { queue_id: "tv", state: "playing", current_item: track("one") };
  const live = { playback: { queue, connected: true, position: 20 }, call: () => { maCalls++; return new Promise(() => {}); } };
  const model = createPlayback({ live, host: "ma", now: () => time, lyricsSearch: async () => null });
  model.wantLyrics(true);
  model.tick();
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(model.snapshot().lyrics.status, "error", "a timeout is not a clean miss");
  assert.equal(model.snapshot().lyrics.retryAt, 31000);
  time = 31000;
  model.tick();
  await settle();
  assert.equal(maCalls, 2, "tried again after the cooldown");
});
