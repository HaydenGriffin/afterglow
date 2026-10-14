import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { normalizeParams } from "../src/settings.js";

// Exercise the registered production handler without booting WebGL or a TV.
const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const handler = source.match(/  document\.addEventListener\("webOSRelaunch", \(relaunch\) => \{[\s\S]*?\n  \}\);/)[0];
function app(running = true) {
  let callback;
  const events = [];
  vm.runInNewContext(handler, {
    document: { addEventListener: (_name, fn) => { callback = fn; } },
    normalizeParams,
    location: { reload: () => events.push("reload") },
    suspend: () => { events.push("disconnect"); running = false; },
    resume: () => { if (!running) { events.push("connect"); running = true; } },
  });
  return { events, launch: (detail) => callback({ detail }) };
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
  assert.deepEqual(tv.events, ["reload"]);
});
