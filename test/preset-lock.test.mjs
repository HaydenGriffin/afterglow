import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCK_LIMIT, lockFor, lockKeys, withLock } from "../src/preset-lock.js";

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
