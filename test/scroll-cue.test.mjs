import test from "node:test";
import assert from "node:assert/strict";
import { overflowOf, scrollFor } from "../src/scroll-cue.js";

test("the cue shows at the edges where rows continue", () => {
  assert.deepEqual(overflowOf({ scrollTop: 0, clientHeight: 500, scrollHeight: 1200 }), { above: false, below: true });
  assert.deepEqual(overflowOf({ scrollTop: 300, clientHeight: 500, scrollHeight: 1200 }), { above: true, below: true });
  assert.deepEqual(overflowOf({ scrollTop: 700, clientHeight: 500, scrollHeight: 1200 }), { above: true, below: false });
  assert.deepEqual(overflowOf({ scrollTop: 699, clientHeight: 500, scrollHeight: 1200 }), { above: true, below: false }, "a pixel short of the end is the end");
  assert.deepEqual(overflowOf({ scrollTop: 0, clientHeight: 500, scrollHeight: 400 }), { above: false, below: false }, "a list that fits");
});

// Rows 70 px tall in a 500 px list of 1400 px.
const list = { clientHeight: 500, scrollHeight: 1400 };
const row = (i, scrollTop) => scrollFor(Object.assign({ top: i * 70, bottom: i * 70 + 70, context: 70, scrollTop }, list));

test("a row already in view with a row beyond it stays put", () => {
  assert.equal(row(3, 0), 0);
  assert.equal(row(5, 0), 0, "row 5 ends at 420 and its context at 490: still shown");
});

test("moving down keeps one row of context below the focused row", () => {
  assert.equal(row(6, 0), 6 * 70 + 70 + 70 - 500, "row 6 ends at 490; with context at 560");
  assert.equal(row(12, 300), 12 * 70 + 140 - 500);
});

test("moving up keeps one row of context above it", () => {
  assert.equal(row(4, 400), 3 * 70);
});

test("near either end the list simply reaches the end", () => {
  assert.equal(row(0, 300), 0);
  assert.equal(row(19, 0), 900, "the last row: scrolled to the bottom");
});
