import test from "node:test";
import assert from "node:assert/strict";
import { createScan } from "../src/scan.js";

test("a scan asks the engine to run and draw for its length, and gives it back after", () => {
  const calls = [];
  const engine = { fpsCap: 30, fps: 0, setFpsCap() {}, setSource() {}, setScanning(on) { calls.push(on); } };
  // MilkDrop that cannot start: the scan begins, then ends at once.
  const milkdrop = { ready: false, failed: true, presetCount: 0, validatedCount: 0, scanning: false, commitRatings() {}, resume() {} };
  let done = null;
  const scan = createScan({ milkdrop, engine, source: {}, overlay: null, onDone: (complete) => { done = complete; } });
  assert.equal(scan.start(), true);
  assert.deepEqual(calls, [true, false]);
  assert.equal(done, false);
  assert.equal(scan.running, false);
});
