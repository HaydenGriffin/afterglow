import test from "node:test";
import assert from "node:assert/strict";
import { createRelaunchHandler } from "../src/relaunch.js";

function app(running = true) {
  const events = [];
  const handler = createRelaunchHandler({
    reload: () => events.push("reload"),
    resume: () => { if (!running) { events.push("connect"); running = true; } },
  });
  return { events, launch: (detail) => handler({ detail }) };
}

test("opening an already-playing app repeatedly keeps its audio connection", () => {
  const tv = app();
  tv.launch(); tv.launch({}); tv.launch("{}");
  assert.deepEqual(tv.events, []);
});

test("opening a suspended app resumes once", () => {
  const tv = app(false);
  tv.launch({}); tv.launch({});
  assert.deepEqual(tv.events, ["connect"]);
});

test("launch parameters still reload to apply the new player", () => {
  const tv = app();
  tv.launch({ player: "another-speaker" });
  tv.launch('{"speaker":"Kitchen"}');
  assert.deepEqual(tv.events, ["reload", "reload"]);
});
