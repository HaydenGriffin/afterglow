import test from "node:test";
import assert from "node:assert/strict";
import { baseTitle, pickLyrics, searchLyrics } from "../src/lrclib.js";
import { createPlayback } from "../src/playback.js";

const hit = (o) => Object.assign({ trackName: "That's It (feat. Future & Metro Boomin)", artistName: "Yung Lean", duration: 162, syncedLyrics: "[00:18.88]Tryna put it all", plainLyrics: "Tryna put it all" }, o);

test("titles compare without featured artists, versions or curly quotes", () => {
  assert.equal(baseTitle("That’s It (feat. Future) [from GTA VI]"), "that's it");
  assert.equal(baseTitle("Song - 2011 Remaster"), "song");
});

test("the hit matches title, artist and length, timed lyrics first", () => {
  const want = { title: "That's It", artist: "Yung Lean", duration: 161 };
  assert.deepEqual(pickLyrics([hit({ syncedLyrics: "", duration: 160 }), hit()], want), { plain: "Tryna put it all", lrc: "[00:18.88]Tryna put it all" });
  assert.equal(pickLyrics([hit({ duration: 184 })], want), null, "a different cut is not used");
  assert.equal(pickLyrics([hit({ artistName: "Someone Else" })], want), null);
  assert.equal(pickLyrics([hit({ trackName: "That's All" })], want), null);
  assert.equal(pickLyrics([hit({ instrumental: true })], want), null);
});

test("search failures are quiet", async () => {
  assert.equal(await searchLyrics({ title: "X", artist: "Y" }, async () => ({ ok: false })), null);
  assert.equal(await searchLyrics({ title: "X", artist: "Y" }, async () => { throw Error("offline"); }), null);
  let url = "";
  await searchLyrics({ title: "That's It (feat. Future)", artist: "Yung Lean" }, async (u) => { url = u; return { ok: true, json: async () => [] }; });
  assert.match(url, /track_name=that's%20it&artist_name=Yung%20Lean$/);
});

test("when Music Assistant has no lyrics, the search fills them in", async () => {
  const queue = { queue_id: "q", state: "playing", current_item: { queue_item_id: "i", duration: 162, media_item: { media_type: "track", uri: "spotify://track/1", name: "That's It", artists: [{ name: "Yung Lean" }] } } };
  const live = { playback: { queue, player: {}, connected: true, position: 20 }, call: async () => [null, null] };
  const asked = [];
  const model = createPlayback({ live, host: "ma", lyricsSearch: async (q) => { asked.push(q); return { plain: "", lrc: "[00:18.88]Tryna put it all" }; } });
  model.wantLyrics(true);
  model.tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, [{ title: "That's It", artist: "Yung Lean", duration: 162 }]);
  assert.equal(model.snapshot().lyrics.status, "timed");
});
