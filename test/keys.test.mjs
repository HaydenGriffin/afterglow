import assert from "node:assert/strict";
import { test } from "node:test";
import { remoteAction } from "../src/keys.js";

const visuals = { mode: "visuals", visualsShown: true, milkdropReady: true, milkdropOn: true, live: true, lyrics: "idle" };
const at = (over) => Object.assign({}, visuals, over);

test("in the Visuals modes the arrows and colour keys work the visualizer as before", () => {
  for (const mode of ["visuals", "track"]) {
    const ctx = at({ mode });
    assert.deepEqual(remoteAction("up", ctx), { do: "preset", by: 1 });
    assert.deepEqual(remoteAction("down", ctx), { do: "preset", by: -1 });
    assert.deepEqual(remoteAction("left", ctx), { do: "dim", by: -10 });
    assert.deepEqual(remoteAction("right", ctx), { do: "dim", by: 10 });
    assert.deepEqual(remoteAction("yellow", ctx), { do: "favoritePreset" });
    assert.deepEqual(remoteAction("blue", ctx), { do: "presetList" });
  }
  assert.deepEqual(remoteAction("red", visuals), { do: "trim", by: -25 });
  assert.deepEqual(remoteAction("green", visuals), { do: "trim", by: 25 });
  assert.deepEqual(remoteAction("ok", visuals), { do: "controls" });
  assert.deepEqual(remoteAction("back", visuals), { do: "exit" });
  assert.equal(remoteAction("yellow", at({ milkdropReady: false })), null);
  assert.equal(remoteAction("blue", at({ milkdropOn: false })), null);
  assert.equal(remoteAction("red", at({ live: false })), null);
});

test("Album without MilkDrop behind: left/right seek, up/down are harmless, yellow favourites the song", () => {
  const ctx = at({ mode: "album", visualsShown: false });
  assert.deepEqual(remoteAction("left", ctx), { do: "seek", by: -10 });
  assert.deepEqual(remoteAction("right", ctx), { do: "seek", by: 10 });
  assert.equal(remoteAction("up", ctx).do, "hint");
  assert.equal(remoteAction("down", ctx).do, "hint");
  assert.deepEqual(remoteAction("yellow", ctx), { do: "favoriteSong" });
  assert.equal(remoteAction("blue", ctx), null);
});

test("Album with MilkDrop behind keeps preset keys on up/down but seeks on left/right", () => {
  const ctx = at({ mode: "album", visualsShown: true });
  assert.deepEqual(remoteAction("up", ctx), { do: "preset", by: 1 });
  assert.deepEqual(remoteAction("left", ctx), { do: "seek", by: -10 });
  assert.deepEqual(remoteAction("yellow", ctx), { do: "favoriteSong" });
});

test("Lyrics: untimed lyrics page on every arrow, timed lyrics seek", () => {
  const plain = at({ mode: "lyrics", visualsShown: false, lyrics: "plain" });
  assert.deepEqual(remoteAction("left", plain), { do: "lyricsPage", by: -1 });
  assert.deepEqual(remoteAction("right", plain), { do: "lyricsPage", by: 1 });
  assert.deepEqual(remoteAction("up", plain), { do: "lyricsPage", by: -1 });
  assert.deepEqual(remoteAction("down", plain), { do: "lyricsPage", by: 1 });
  const timed = at({ mode: "lyrics", visualsShown: false, lyrics: "timed" });
  assert.deepEqual(remoteAction("left", timed), { do: "seek", by: -10 });
  assert.deepEqual(remoteAction("right", timed), { do: "seek", by: 10 });
  assert.equal(remoteAction("up", timed).do, "hint");
  assert.deepEqual(remoteAction("yellow", timed), { do: "favoriteSong" });
  // the trim stays on red/green: it moves the lyrics too
  assert.deepEqual(remoteAction("red", timed), { do: "trim", by: -25 });
});

test("unknown keys do nothing", () => {
  assert.equal(remoteAction("", visuals), null);
  assert.equal(remoteAction("play", visuals), null);
});
