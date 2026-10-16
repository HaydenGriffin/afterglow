import test from "node:test";
import assert from "node:assert/strict";
import { chapterAt, chaptersOf, clockLabel, isSpokenWord, linksOf, speedLabel, speedOf, spokenDetail, stepSpeed } from "../src/spoken-word.js";

test("speed steps stop at the ends with arrows and wrap with OK", () => {
  assert.equal(stepSpeed(1, 1), 1.25);
  assert.equal(stepSpeed(2, 1), 2);
  assert.equal(stepSpeed(0.75, -1), 0.75);
  assert.equal(stepSpeed(2, 1, true), 0.75);
  assert.equal(stepSpeed(1.1, 1), 1.25, "an odd speed set elsewhere steps from the nearest");
  assert.deepEqual([0.75, 1, 1.25, 1.5, 2].map(speedLabel), ["0.75×", "1×", "1.25×", "1.5×", "2×"]);
});

test("the queue's speed comes from Music Assistant, 1 when it does not say", () => {
  assert.equal(speedOf({ playback_speed: 1.5 }), 1.5);
  assert.equal(speedOf({ current_item: { extra_attributes: { playback_speed: 1.25 } } }), 1.25);
  assert.equal(speedOf({}), 1);
  assert.equal(speedOf(null), 1);
});

test("only audiobooks and episodes are spoken word", () => {
  assert.ok(isSpokenWord({ media_type: "audiobook" }));
  assert.ok(isSpokenWord({ media_type: "podcast_episode" }));
  assert.ok(!isSpokenWord({ media_type: "track" }));
  assert.ok(!isSpokenWord(null));
});

test("chapters are read from metadata, sorted, named and capped; one is not a list", () => {
  const media = { metadata: { chapters: [{ position: 2, name: "Two", start: 15.15, end: 32 }, { position: 1, name: "", start: 0, end: 15.15 }, { name: "bad", start: "x" }] } };
  assert.deepEqual(chaptersOf(media), [{ name: "Chapter 2", start: 0 }, { name: "Two", start: 15 }]);
  assert.deepEqual(chaptersOf({ metadata: { chapters: [{ name: "Only", start: 0 }] } }), []);
  assert.deepEqual(chaptersOf({}), []);
  const many = { metadata: { chapters: Array.from({ length: 400 }, (_, i) => ({ name: "C" + i, start: i * 60 })) } };
  assert.equal(chaptersOf(many).length, 300);
});

test("the current chapter follows the position", () => {
  const chapters = [{ start: 0 }, { start: 60 }, { start: 120 }];
  assert.equal(chapterAt(chapters, 0), 0);
  assert.equal(chapterAt(chapters, 59), 0);
  assert.equal(chapterAt(chapters, 60), 1);
  assert.equal(chapterAt(chapters, 4000), 2);
  assert.equal(clockLabel(245), "4:05");
  assert.equal(clockLabel(3735), "1:02:15");
});

test("Go to rows come from the item's ids: album, up to three artists, an episode's podcast", () => {
  const ref = (kind, id, name) => ({ item_id: id, provider: "spotify--x", uri: "spotify--x://" + kind + "/" + id, name });
  const song = { media_type: "track", album: ref("album", "a1", "Coastline"), artists: [ref("artist", "1", "One"), { name: "No id" }, ref("artist", "2", "Two"), ref("artist", "3", "Three"), ref("artist", "4", "Four")] };
  assert.deepEqual(linksOf(song).map(l => [l.label, l.value, l.item.media_type, l.item.item_id]), [
    ["Go to the album", "Coastline", "album", "a1"], ["Go to One", "", "artist", "1"], ["Go to Two", "", "artist", "2"], ["Go to Three", "", "artist", "3"]]);
  assert.deepEqual(linksOf({ media_type: "track", album: { name: "Only a name" } }), []);
  assert.deepEqual(linksOf({ media_type: "podcast_episode", podcast: ref("podcast", "p", "Quiet hour") }).map(l => [l.label, l.item.media_type]), [["Go to the podcast", "podcast"]]);
  assert.deepEqual(linksOf({ media_type: "radio", artists: [ref("artist", "1", "One")] }), [], "nothing for radio");
  assert.deepEqual(linksOf({ media_type: "audiobook", authors: [ref("artist", "1", "One")] }), [], "nor audiobooks");
});

test("spoken-word rows read like the PS5's", () => {
  assert.equal(spokenDetail({ media_type: "audiobook", authors: [{ name: "A" }, "B"] }), "A, B");
  assert.equal(spokenDetail({ media_type: "podcast_episode", duration: 2520, metadata: { release_date: "2021-09-11T00:00:00+00:00" } }), "11 Sep 2021 · 42 min");
  assert.equal(spokenDetail({ media_type: "podcast_episode", duration: 4000 }), "1 h 7 min");
  assert.equal(spokenDetail({ media_type: "podcast", publisher: " Demo Radio ", total_episodes: 1 }), "Demo Radio · 1 episode");
  assert.equal(spokenDetail({ media_type: "track" }), "");
});
