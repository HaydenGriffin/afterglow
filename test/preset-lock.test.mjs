import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCK_LIMIT, createPresetLocks, lockFor, lockKeys, withLock } from "../src/preset-lock.js";

const song = (artist, album, artists) => ({ id: "q1", title: "Song", artist, album, media: { artists: artists || [{ name: artist }] } });

test("lock keys name the album with its artist, and the main artist alone", () => {
  assert.deepEqual(lockKeys(song("Massive Attack", "Mezzanine")), { album: "album:massive attack|mezzanine", artist: "artist:massive attack" });
  // the first credited artist, not the joined credit line
  assert.equal(lockKeys(song("Air, Beck", "Talkie Walkie", [{ name: "Air" }, { name: "Beck" }])).artist, "artist:air");
  assert.deepEqual(lockKeys(song("Air", "")), { album: "", artist: "artist:air" });
  assert.deepEqual(lockKeys(null), { album: "", artist: "" });
});

test("an album lock wins over an artist lock", () => {
  const track = song("Air", "Moon Safari");
  let locks = withLock({}, "artist:air", "Geiss - Spiral");
  assert.deepEqual(lockFor(locks, track), { name: "Geiss - Spiral", by: "artist" });
  locks = withLock(locks, "album:air|moon safari", "Flexi - Mindblob");
  assert.deepEqual(lockFor(locks, track), { name: "Flexi - Mindblob", by: "album" });
  assert.deepEqual(lockFor(locks, song("Air", "Talkie Walkie")), { name: "Geiss - Spiral", by: "artist" });
  assert.equal(lockFor(locks, song("Beck", "Odelay")), null);
  assert.equal(lockFor(null, track), null);
});

test("unlocking removes the entry without touching the original map", () => {
  const locks = withLock({}, "artist:air", "A");
  const none = withLock(locks, "artist:air", null);
  assert.deepEqual(none, {});
  assert.deepEqual(locks, { "artist:air": "A" });
});

test("the map is capped, dropping the oldest lock", () => {
  let locks = {};
  for (let i = 0; i <= LOCK_LIMIT; i++) locks = withLock(locks, "artist:" + i, "P");
  assert.equal(Object.keys(locks).length, LOCK_LIMIT);
  assert.equal("artist:0" in locks, false);
  assert.equal("artist:" + LOCK_LIMIT in locks, true);
});

function lockHarness(initial) {
  const h = { loads: 0, saved: [], held: [], stored: initial };
  h.locks = createPresetLocks({
    load: () => { h.loads++; return h.stored; },
    save: (locks) => { h.stored = locks; h.saved.push(locks); },
    hold: (name) => h.held.push(name),
  });
  return h;
}

test("following the playing track reads the saved locks once and holds only on a change", () => {
  const h = lockHarness({ "artist:air": "Geiss - Spiral" });
  const air = song("Air", "Moon Safari");
  for (let i = 0; i < 5; i++) h.locks.follow(air);
  assert.equal(h.loads, 1, "not parsed again every second");
  assert.deepEqual(h.held, ["Geiss - Spiral"]);
  h.locks.follow(song("Air", "Talkie Walkie"));
  h.locks.follow(song("Beck", "Sea Change"));
  h.locks.follow(song("Beck", "Sea Change"));
  assert.deepEqual(h.held, ["Geiss - Spiral", "Geiss - Spiral", null]);
  assert.equal(h.loads, 1);
});

test("locking saves, and the playing track takes the new lock at once", () => {
  const h = lockHarness(null);
  const air = song("Air", "Moon Safari");
  h.locks.follow(air);
  assert.equal(h.locks.locked("album:air|moon safari"), null);
  h.locks.set("album:air|moon safari", "Flexi - Mindblob", air);
  assert.deepEqual(h.saved, [{ "album:air|moon safari": "Flexi - Mindblob" }]);
  assert.equal(h.locks.locked("album:air|moon safari"), "Flexi - Mindblob");
  assert.deepEqual(h.held, [null, "Flexi - Mindblob"]);
  h.locks.set("album:air|moon safari", null, air);
  assert.deepEqual(h.held, [null, "Flexi - Mindblob", null]);
});

test("reload picks up locks changed elsewhere (the account)", () => {
  const h = lockHarness({});
  const air = song("Air", "Moon Safari");
  h.locks.follow(air);
  h.stored = { "artist:air": "Geiss - Spiral" };
  h.locks.follow(air);
  assert.deepEqual(h.held, [null]);
  h.locks.reload();
  h.locks.follow(air);
  assert.equal(h.loads, 2);
  assert.deepEqual(h.held, [null, "Geiss - Spiral"]);
});
