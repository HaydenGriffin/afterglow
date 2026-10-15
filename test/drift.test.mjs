import assert from "node:assert/strict";
import { test } from "node:test";
import { createDrift } from "../src/drift.js";

test("drift nudges the elements every two minutes only while started", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const element = { style: { transform: "" } };
  const drift = createDrift([element, null]);
  t.mock.timers.tick(120000);
  assert.equal(element.style.transform, "", "not started yet");
  drift.start();
  drift.start(); // twice: still one timer
  t.mock.timers.tick(120000);
  assert.equal(element.style.transform, "translate(-6px,-4px)");
  t.mock.timers.tick(120000);
  assert.equal(element.style.transform, "translate(6px,-4px)");
  drift.stop();
  t.mock.timers.tick(600000);
  assert.equal(element.style.transform, "translate(6px,-4px)", "stopped: no more nudges");
  drift.start();
  t.mock.timers.tick(120000);
  assert.equal(element.style.transform, "translate(6px,4px)", "carries on from where it was");
});
