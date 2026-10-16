import test from "node:test";
import assert from "node:assert/strict";
import { chooseLyrics, chosenLyrics, clearChoice, createTimingOffer, fingerprint, forgetTiming, keepTiming, keptTiming, lineSeekPosition, readSongs, SONG_LIMIT } from "../src/song-lyrics.js";

test("the fingerprint is FNV-1a of the UTF-8, without carriage returns or outer space", () => {
  assert.equal(fingerprint("a"), "e40c292c");
  assert.equal(fingerprint("foobar"), "bf9cf968");
  assert.equal(fingerprint("  foobar\n"), "bf9cf968");
  assert.equal(fingerprint("[00:01]a\r\n[00:02]b"), fingerprint("[00:01]a\n[00:02]b"));
  assert.equal(fingerprint(""), "");
  assert.equal(fingerprint(null), "");
  // Two-, three- and four-byte characters hash as their UTF-8 bytes (Afterglow for PS5 hashes bytes).
  assert.equal(fingerprint("ł"), "538f31a6");
  assert.equal(fingerprint("€"), "298f832b");
  assert.equal(fingerprint("🎵"), "4cd7445d");
});

test("a kept timing applies only to the same song with the same words", () => {
  let songs = keepTiming([], "library://track/1", "0000000a", 700, 1);
  assert.equal(keptTiming(songs, "library://track/1", "0000000a"), 700);
  assert.equal(keptTiming(songs, "library://track/1", "0000000b"), null, "other lyrics: the device timing");
  assert.equal(keptTiming(songs, "library://track/2", "0000000a"), null);
  songs = keepTiming(songs, "library://track/1", "0000000a", -300, 2);
  assert.deepEqual(songs, [{ id: "library://track/1", sum: "0000000a", ms: -300, at: 2 }], "one entry per song");
  assert.deepEqual(forgetTiming(songs, "library://track/1", 3), [], "nothing left to remember");
});

test("the store keeps the 100 most recently changed songs", () => {
  let songs = [];
  for (let i = 0; i < SONG_LIMIT + 5; i++) songs = keepTiming(songs, "library://track/" + i, "0000000a", 100, 1000 + i);
  assert.equal(songs.length, SONG_LIMIT);
  assert.equal(keptTiming(songs, "library://track/0", "0000000a"), null, "the oldest went first");
  assert.equal(keptTiming(songs, "library://track/104", "0000000a"), 100);
  songs = keepTiming(songs, "library://track/5", "0000000a", 200, 5000);
  songs = keepTiming(songs, "library://track/new", "0000000a", 300, 5001);
  assert.equal(keptTiming(songs, "library://track/5", "0000000a"), 200, "changing a song makes it recent again");
  assert.equal(keptTiming(songs, "library://track/6", "0000000a"), null);
});

test("choosing lyrics replaces a timing kept for other words; keeping one keeps the choice", () => {
  let songs = keepTiming([], "u", "0000000a", 500, 1);
  songs = chooseLyrics(songs, "u", 42, "0000000b", 2);
  assert.equal(chosenLyrics(songs, "u"), 42);
  assert.equal(keptTiming(songs, "u", "0000000a"), null);
  songs = keepTiming(songs, "u", "0000000b", 300, 3);
  assert.deepEqual(songs, [{ id: "u", sum: "0000000b", ms: 300, lrclib: 42, at: 3 }]);
  songs = forgetTiming(songs, "u", 4);
  assert.equal(chosenLyrics(songs, "u"), 42, "forgetting the timing keeps the chosen lyrics");
  songs = clearChoice(songs, "u", 5);
  assert.deepEqual(songs, []);
});

test("nothing is stored without an identity or for an overlong one", () => {
  assert.deepEqual(keepTiming([], "", "0000000a", 100, 1), []);
  assert.deepEqual(keepTiming([], "x".repeat(301), "0000000a", 100, 1), []);
  assert.deepEqual(keepTiming([], "u", "", 100, 1), [], "no words, no fingerprint");
  assert.deepEqual(keepTiming([], "u", "0000000a", 10100, 1), [], "outside the timing range");
  assert.deepEqual(chooseLyrics([], "u", 0, "0000000a", 1), []);
});

test("a stored list read back keeps only well-formed entries", () => {
  const songs = readSongs([
    { id: "a", sum: "0000000a", ms: 100, at: 1 },
    { id: "b", sum: "nothex!!", ms: 100, at: 1 },
    { id: "c", sum: "0000000a", at: 1 },
    { id: "d", sum: "0000000a", ms: 1.5, lrclib: 7, at: 2 },
    { id: "a", sum: "0000000b", ms: 200, at: 3 },
    null, "text",
  ]);
  assert.deepEqual(songs, [{ id: "a", sum: "0000000a", ms: 100, at: 1 }, { id: "d", sum: "0000000a", lrclib: 7, at: 2 }]);
  assert.deepEqual(readSongs({ not: "a list" }), []);
});

test("the keep offer appears once the timing changes during a song, until answered or the song changes", () => {
  const offer = createTimingOffer();
  const at = (deviceMs, kept = null) => offer.pending({ deviceMs, kept, timed: true, id: "u" });
  offer.song("q:1", 0);
  assert.equal(at(0), false, "nothing changed yet");
  assert.equal(at(300), true);
  assert.equal(offer.base, 0);
  assert.equal(at(0), false, "back where it started");
  assert.equal(at(300, 500), false, "a kept timing already applies");
  assert.equal(offer.pending({ deviceMs: 300, kept: null, timed: false, id: "u" }), false, "untimed lyrics have no timing");
  assert.equal(offer.pending({ deviceMs: 300, kept: null, timed: true, id: "" }), false, "a song with no identity");
  offer.answer();
  assert.equal(at(400), false, "answered for this song");
  offer.song("q:1", 400);
  assert.equal(at(500), false, "the same song still");
  offer.song("q:2", 400);
  assert.equal(at(400), false);
  assert.equal(at(500), true, "the next song asks again");
  assert.equal(offer.base, 400);
});

test("going to a line seeks to where the timing shows it", () => {
  assert.equal(lineSeekPosition(35, 0, 240), 35);
  assert.equal(lineSeekPosition(35.6, 0, 240), 35, "from the start of the line");
  assert.equal(lineSeekPosition(35, 1500, 240), 36, "lyrics shown later: further into the song");
  assert.equal(lineSeekPosition(35, -1500, 240), 33);
  assert.equal(lineSeekPosition(0.5, -2000, 240), 0);
  assert.equal(lineSeekPosition(239.5, 2000, 240), 240);
});
