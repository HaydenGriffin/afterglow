import test from "node:test";
import assert from "node:assert/strict";
import { milkdropProblem, screenMessage } from "../src/screen-message.js";

const at = (over) => Object.assign({ poster: false, milkdropOff: "", visualStyle: "milkdrop", webgl2: () => true, idle: false, problem: "" }, over);

test("MilkDrop's trouble is said in the Visuals modes, and the connection's, or Waiting for music", () => {
  assert.deepEqual(screenMessage(at({ milkdropOff: "too slow on this TV" })), { text: "MilkDrop can't run on this TV: too slow on this TV (OK, then MilkDrop, to retry)", waiting: false });
  assert.deepEqual(screenMessage(at({ milkdropOff: "no WebGL2", webgl2: () => false })).text, "MilkDrop can't run on this TV: no WebGL2");
  assert.equal(screenMessage(at({})), null, "playing: nothing");
  assert.deepEqual(screenMessage(at({ idle: true })), { text: "Waiting for music", waiting: true });
  assert.deepEqual(screenMessage(at({ idle: true, problem: "No answer from ma.local" })), { text: "No answer from ma.local", waiting: false });
  assert.equal(screenMessage(at({ poster: true, milkdropOff: "lost", idle: true })), null, "Album and Lyrics say nothing here");
});

test("visual style Off: a saved Off with a start that never finished keeps the screen blank", () => {
  let asked = 0;
  // milkdropBlocker() after a start that did not finish (milkdropPending: true)
  const pending = at({ visualStyle: "off", milkdropOff: "did not survive its last start", webgl2: () => { asked++; return true; } });
  assert.equal(screenMessage(pending), null, "playing: blank");
  assert.deepEqual(screenMessage(Object.assign({}, pending, { idle: true })), { text: "Waiting for music", waiting: true }, "nothing playing still says so");
  assert.equal(asked, 0, "no WebGL probe for a line not shown");
});

test("visual style Off after a failure at run time: the line goes; MilkDrop again brings it back", () => {
  for (const reason of ["too slow on this TV", "the GPU context was lost", "did not start in time"]) {
    assert.equal(milkdropProblem(reason, "off"), "");
    assert.equal(screenMessage(at({ milkdropOff: reason, visualStyle: "off" })), null, reason);
    assert.equal(milkdropProblem(reason, "milkdrop"), reason);
    assert.match(screenMessage(at({ milkdropOff: reason })).text, /^MilkDrop can't run on this TV/);
  }
  assert.equal(milkdropProblem("", "milkdrop"), "");
});
