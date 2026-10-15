import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeNode, fakeTimers, installDocument } from "./fake-dom.mjs";
import { parseLyrics } from "../src/playback.js";
import { createKaraoke, wordIndex } from "../src/karaoke.js";

installDocument();

test("enhanced LRC keeps word timings; the line text has no tags", () => {
  const [line] = parseLyrics("[00:12.00]<00:12.00>Hold <00:12.50>me <00:13.20>close<00:14.00>");
  assert.equal(line.at, 12);
  assert.equal(line.text, "Hold me close");
  assert.deepEqual(line.words, [{ at: 12, text: "Hold " }, { at: 12.5, text: "me " }, { at: 13.2, text: "close" }]);
});

test("a first word without its own tag starts with the line; the offset moves words too (as it moves lines)", () => {
  const [line] = parseLyrics("[offset:500]\n[01:00.00]Hello <01:00.80>there");
  assert.equal(line.text, "Hello there");
  assert.deepEqual(line.words, [{ at: 60.5, text: "Hello " }, { at: 61.3, text: "there" }]);
});

test("a repeated line takes its words along to each timestamp", () => {
  const lines = parseLyrics("[00:10.00][00:30.00]<00:10.00>La <00:10.50>la");
  assert.deepEqual(lines.map((l) => l.words.map((w) => w.at)), [[10, 10.5], [30, 30.5]]);
});

test("plain LRC lines carry no words", () => {
  const lines = parseLyrics("[00:01.00]Just a line");
  assert.deepEqual(lines, [{ at: 1, text: "Just a line" }]);
});

test("wordIndex finds the word being sung", () => {
  const words = [{ at: 1, text: "a" }, { at: 2, text: "b" }, { at: 3, text: "c" }];
  assert.equal(wordIndex(words, 0.5), -1);
  assert.equal(wordIndex(words, 2), 1);
  assert.equal(wordIndex(words, 9), 2);
});

test("karaoke marks words as sung and touches the DOM only when the word changes", () => {
  const timers = fakeTimers();
  let position = 12;
  const karaoke = createKaraoke(() => position, timers);
  const box = new FakeNode("p");
  karaoke.show(box, { at: 12, text: "Hold me close", words: [{ at: 12, text: "Hold " }, { at: 12.5, text: "me " }, { at: 13.2, text: "close" }] });
  const sung = () => box.children.map((c) => (c.classList.contains("sung") ? 1 : 0)).join("");
  assert.equal(box.children.length, 3);
  assert.equal(sung(), "100");
  const before = box.children.map((c) => c.className);
  karaoke.update();
  assert.deepEqual(box.children.map((c) => c.className), before);
  position = 12.6;
  karaoke.update();
  assert.equal(sung(), "110");
  // close to the next word, a timer lands on it between ticks
  position = 13.0;
  karaoke.update();
  assert.equal(sung(), "110");
  position = 13.25;
  timers.advance(250);
  assert.equal(sung(), "111");
  // a seek back unmarks
  position = 12.1;
  karaoke.update();
  assert.equal(sung(), "100");
  karaoke.show(null);
  timers.advance(5000);
});

test("a line without words is set as plain text", () => {
  const karaoke = createKaraoke(() => 0, fakeTimers());
  const box = new FakeNode("p");
  karaoke.show(box, { at: 0, text: "Plain" });
  assert.equal(box.textContent, "Plain");
  assert.equal(box.children.length, 0);
});
