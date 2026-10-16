import test from "node:test";
import assert from "node:assert/strict";
import { getLyrics, lyricCandidates, searchCandidates } from "../src/lrclib.js";
import { createPlayback } from "../src/playback.js";
import { fingerprint } from "../src/song-lyrics.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
const hit = (o) => Object.assign({ id: 1, trackName: "Low Tide", artistName: "Demo Band", albumName: "Coast", duration: 200, syncedLyrics: "[00:01]one", plainLyrics: "one" }, o);
const want = { title: "Low Tide", artist: "Demo Band", duration: 200 };

test("candidates: same title and artist first, then the nearest length, timed before plain", () => {
  const list = lyricCandidates([
    hit({ id: 1, trackName: "Something Else", syncedLyrics: "[00:01]a" }),
    hit({ id: 2, duration: 320, syncedLyrics: "[00:01]live" }),
    hit({ id: 3, duration: 201, syncedLyrics: "", plainLyrics: "plain" }),
    hit({ id: 4, duration: 201, syncedLyrics: "[00:01]timed" }),
    hit({ id: 5, duration: 200, syncedLyrics: "[00:01]timed", albumName: "Copy" }),
    hit({ id: 6, instrumental: true }),
    hit({ id: 0, syncedLyrics: "[00:01]no id" }),
    hit({ id: 7, syncedLyrics: "", plainLyrics: "" }),
  ], want);
  assert.deepEqual(list.map((c) => c.id), [4, 3, 2, 1], "id 5 has the same words as 4; no instrumental, id-less or empty results");
  assert.deepEqual(list[0], { id: 4, title: "Low Tide", artist: "Demo Band", album: "Coast", duration: 201, timed: true, plain: "one", lrc: "[00:01]timed", sum: fingerprint("[00:01]timed"), same: true });
  assert.equal(list[3].same, false);
});

test("at most six candidates are offered", () => {
  const results = Array.from({ length: 10 }, (_, i) => hit({ id: i + 1, syncedLyrics: "[00:01]v" + i }));
  assert.equal(lyricCandidates(results, want).length, 6);
});

test("the candidate search fails retryably when LRCLIB is busy", async () => {
  await assert.rejects(searchCandidates(want, async () => ({ ok: false, status: 503 })), /503/);
  let url = "";
  assert.deepEqual(await searchCandidates(want, async (u) => { url = u; return { ok: true, status: 200, json: async () => [] }; }), []);
  assert.equal(url, "https://lrclib.net/api/search?track_name=low%20tide&artist_name=Demo%20Band");
});

test("a chosen record is fetched by id; 404 means it is gone, other failures are retryable", async () => {
  let url = "";
  const ok = await getLyrics(42, async (u) => { url = u; return { ok: true, status: 200, json: async () => hit({ id: 42 }) }; });
  assert.equal(url, "https://lrclib.net/api/get/42");
  assert.deepEqual(ok, { plain: "one", lrc: "[00:01]one" });
  assert.equal(await getLyrics(42, async () => ({ ok: false, status: 404 })), null);
  await assert.rejects(getLyrics(42, async () => ({ ok: false, status: 503 })), /503/);
  assert.equal(await getLyrics(0, async () => { throw Error("not asked"); }), null);
});

function playback(options) {
  const queue = { queue_id: "q", state: "playing", current_item: { queue_item_id: "i", duration: 200, media_item: { media_type: "track", uri: "library://track/1", name: "Low Tide", artists: [{ name: "Demo Band" }] } } };
  const asked = [];
  const live = { playback: { queue, player: {}, connected: true, position: 20 }, call: async (command) => { asked.push(command); return [null, "[00:01]from music assistant"]; } };
  const model = createPlayback(Object.assign({ live, host: "ma", lyricsSearch: null }, options));
  model.wantLyrics(true);
  model.tick();
  return { model, asked };
}

test("with a chosen record its lyrics are used instead of Music Assistant's", async () => {
  const { model, asked } = playback({ lyricsChoice: (uri) => (uri === "library://track/1" ? 42 : 0), lyricsGet: async (id) => ({ plain: "", lrc: "[00:01]chosen " + id }) });
  await settle();
  const lyrics = model.snapshot().lyrics;
  assert.equal(lyrics.lines[0].text, "chosen 42");
  assert.equal(lyrics.source, "chosen");
  assert.equal(lyrics.sum, fingerprint("[00:01]chosen 42"));
  assert.deepEqual(asked, [], "Music Assistant was not asked");
});

test("a chosen record LRCLIB no longer has is forgotten and the usual lookup runs", async () => {
  const gone = [];
  const { model } = playback({ lyricsChoice: () => 42, lyricsGet: async () => null, onChoiceGone: (uri) => gone.push(uri) });
  await settle();
  assert.deepEqual(gone, ["library://track/1"]);
  assert.equal(model.snapshot().lyrics.source, "ma");
  assert.equal(model.snapshot().lyrics.lines[0].text, "from music assistant");
});

test("a chosen record that fails to load is a retryable error", async () => {
  const { model } = playback({ lyricsChoice: () => 42, lyricsGet: async () => { throw Error("Lyrics service unavailable (503)"); } });
  await settle();
  assert.equal(model.snapshot().lyrics.status, "error");
  assert.ok(model.snapshot().lyrics.retryAt > 0);
});

test("Online lyrics Off: a chosen record is not fetched", async () => {
  let fetched = 0;
  const { model } = playback({ onlineLyrics: () => false, lyricsChoice: () => 42, lyricsGet: async () => { fetched++; return null; } });
  await settle();
  assert.equal(fetched, 0);
  assert.equal(model.snapshot().lyrics.source, "ma");
});

test("picked lyrics show at once, and the timing is asked with them", async () => {
  const seen = [];
  const { model } = playback({ lyricsOffset: (track, lyrics) => { seen.push(lyrics.sum); return 0; } });
  await settle();
  model.useLyrics({ plain: "", lrc: "[00:01]picked" });
  const s = model.snapshot();
  assert.equal(s.lyrics.lines[0].text, "picked");
  assert.equal(s.lyrics.source, "chosen");
  assert.equal(seen[seen.length - 1], fingerprint("[00:01]picked"));
});
