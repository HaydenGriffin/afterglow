import assert from "node:assert/strict";
import { test } from "node:test";
import { createPresetHistory } from "../src/preset-history.js";

const any = () => true;

test("Previous returns to the presets shown, newest first; Next walks forward again", () => {
  const history = createPresetHistory();
  history.shown("a"); // a -> b
  history.shown("b"); // b -> c
  assert.equal(history.back("c", any), "b");
  assert.equal(history.back("b", any), "a");
  assert.equal(history.back("a", any), null, "nothing before the first");
  assert.equal(history.forward("a", any), "b");
  assert.equal(history.forward("b", any), "c");
  assert.equal(history.forward("c", any), null, "at the newest Next picks a new one");
});

test("a new preset after going back drops what was ahead", () => {
  const history = createPresetHistory();
  history.shown("a");
  history.shown("b");
  assert.equal(history.back("c", any), "b");
  history.shown("b"); // b -> d
  assert.equal(history.forward("d", any), null);
  assert.equal(history.back("d", any), "b");
  assert.equal(history.back("b", any), "a");
});

test("presets no longer available are skipped", () => {
  const history = createPresetHistory();
  history.shown("a");
  history.shown("slow");
  history.shown("b");
  const available = (name) => name !== "slow";
  assert.equal(history.back("c", available), "b");
  assert.equal(history.back("b", available), "a");
});

test("the history is bounded", () => {
  const history = createPresetHistory(3);
  for (const name of ["a", "b", "c", "d", "e"]) history.shown(name);
  assert.equal(history.size, 3);
  assert.equal(history.back("f", any), "e");
  assert.equal(history.back("e", any), "d");
  assert.equal(history.back("d", any), "c");
  assert.equal(history.back("c", any), null);
});
