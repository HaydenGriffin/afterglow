import assert from "node:assert/strict";
import { test } from "node:test";
import { createMock } from "../src/mock.js";

test("the built-in signal is a looped window: continuous, repeatable, and never silent", () => {
  const mock = createMock();
  const a = Array.from(mock.wave(5000));
  assert.equal(a.length, 1024);
  assert.ok(a.some((v) => v !== 128), "has signal");
  assert.deepEqual(Array.from(mock.wave(5000)), a, "the same instant gives the same window");
  assert.deepEqual(Array.from(mock.wave(5000 + 8000)), a, "eight seconds later it repeats");
  // A window straddling the loop's end is still 1024 contiguous samples.
  const atEnd = mock.wave(8000 + 1000 * (512 / 44100));
  assert.equal(atEnd.length, 1024);
  assert.ok(Array.from(atEnd).some((v) => v !== 128));
});
