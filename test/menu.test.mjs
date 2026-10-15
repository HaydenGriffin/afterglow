import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeNode, fakeTimers, installDocument } from "./fake-dom.mjs";
import { createMenu } from "../src/menu.js";

installDocument();

function harness() {
  const element = new FakeNode("div");
  const timers = fakeTimers();
  const state = { status: "Connecting", level: 0 };
  const rows = [
    { section: "Sound" },
    { label: "Speaker", value: () => state.status },
    { label: "Level", value: () => String(state.level), change: (d) => (state.level += d) },
    { label: "Third", value: () => "x" },
  ];
  const menu = createMenu(element, rows, { timers });
  const focused = () => element.querySelector("focus").children[0].textContent;
  const valueOf = (label) => element.all().find((n) => n.className.indexOf("row") >= 0 && n.children[0].textContent === label).children[1].textContent;
  return { element, timers, state, menu, focused, valueOf };
}

test("keys the menu has no use for fall through to the rest of the app", () => {
  const h = harness();
  h.menu.open();
  for (const name of ["play", "pause", "playpause", "red", "green", "yellow", "blue"]) assert.equal(h.menu.handleKey(name), false, name);
  for (const name of ["up", "down", "left", "right", "ok"]) assert.equal(h.menu.handleKey(name), true, name);
  assert.equal(h.menu.handleKey("back"), true);
  assert.equal(h.menu.isOpen, false);
  assert.equal(h.menu.handleKey("up"), false);
});

test("the menu stays open while being read and closes after a long idle", () => {
  const h = harness();
  h.menu.open();
  h.timers.advance(30000);
  assert.equal(h.menu.isOpen, true, "still open after 30 s");
  h.menu.handleKey("down");
  h.timers.advance(44000);
  assert.equal(h.menu.isOpen, true, "a key restarts the idle time");
  h.timers.advance(2000);
  assert.equal(h.menu.isOpen, false);
});

test("the menu reopens on the row it was left at", () => {
  const h = harness();
  h.menu.open();
  h.menu.handleKey("down");
  h.menu.handleKey("down");
  assert.equal(h.focused(), "Third");
  h.menu.close();
  h.menu.open();
  assert.equal(h.focused(), "Third");
});

test("values follow the state while the menu is open, without moving focus", () => {
  const h = harness();
  h.menu.open();
  h.menu.handleKey("down");
  assert.equal(h.valueOf("Speaker"), "Connecting");
  h.state.status = "Playing";
  h.timers.advance(1000);
  assert.equal(h.valueOf("Speaker"), "Playing");
  assert.equal(h.focused(), "Level");
  // an unchanged value is not written again
  const span = h.element.all().find((n) => n.textContent === "Playing" && !n.children.length);
  const writes = span.writes;
  h.timers.advance(3000);
  assert.equal(span.writes, writes);
  h.menu.close();
  h.state.status = "Gone";
  h.timers.advance(2000);
  assert.equal(h.valueOf("Speaker"), "Playing", "no ticking while closed");
});

test("refresh keeps focus on the same row when rows appear above it", () => {
  const element = new FakeNode("div");
  const timers = fakeTimers();
  let extra = false;
  const menu = createMenu(element, [{ label: "Maybe", visible: () => extra }, { label: "A" }, { label: "B" }], { timers });
  menu.open();
  menu.handleKey("down");
  assert.equal(element.querySelector("focus").children[0].textContent, "B");
  extra = true;
  menu.refresh();
  assert.equal(element.querySelector("focus").children[0].textContent, "B");
});
