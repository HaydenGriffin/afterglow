import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { createSetupCheck } from "../src/setup-check.js";
import { createSetupOffer, createSetupView, OFFER_AFTER_MS, OFFER_TEXT } from "../src/setup-view.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
const FACTS = { host: "ma.local", plays: false, onlineLyrics: true, milkdropOn: false };

function harness(t, lyricsStatus = 503) {
  const doc = useFakeDocument(t);
  let runs = 0;
  const probes = {
    server: async () => { runs++; return { reached: true, version: "2.10.6", authed: true, playerFound: true }; },
    relay: async () => ({ ok: false }),
    lyrics: async () => ({ status: lyricsStatus }),
  };
  const element = doc.createElement("div");
  const view = createSetupView(element, createSetupCheck({ facts: () => FACTS, probes }));
  return { view, element, runs: () => runs,
    labels: () => element.querySelectorAll(".setup-row").map(r => r.querySelector(".setup-line").children[0].textContent),
    note: () => element.querySelector(".setup-note").textContent };
}

test("opening runs the checks once; Check again runs them again", async t => {
  const h = harness(t);
  h.view.open();
  assert.equal(h.note(), "Checking…");
  await settle();
  assert.equal(h.runs(), 1);
  assert.deepEqual(h.labels(), ["Music Assistant", "Signed in", "MilkDrop Visualizer", "Online lyrics", "Check again"]);
  assert.equal(h.note(), "1 thing needs a look.", "busy lyrics are not counted");
  const failed = h.element.querySelectorAll(".setup-row.fail");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].querySelector(".setup-next").textContent, "Add MilkDrop Visualizer in Music Assistant: Settings, Plugins.");
  h.view.handleKey("ok"); // on the first row: nothing
  await settle();
  assert.equal(h.runs(), 1);
  h.view.handleKey("up"); // wraps to Check again
  assert.ok(h.element.querySelectorAll(".setup-row")[4].className.indexOf("focus") >= 0);
  h.view.handleKey("ok");
  await settle();
  assert.equal(h.runs(), 2);
});

test("Back leaves the sheet and goes where it came from", t => {
  const h = harness(t);
  let back = 0;
  h.view.open(() => back++);
  assert.ok(h.view.isOpen);
  assert.equal(h.view.handleKey("back"), true);
  assert.ok(!h.view.isOpen);
  assert.equal(back, 1);
  assert.equal(h.view.handleKey("ok"), false, "closed, it takes no keys");
});

test("the offer comes only after the empty screen has stayed a while", t => {
  const doc = useFakeDocument(t);
  let time = 0;
  const offer = createSetupOffer(() => time);
  const message = doc.createElement("div");
  assert.equal(offer.show(message, true), false);
  time += OFFER_AFTER_MS - 1;
  assert.equal(offer.show(message, true), false);
  time += 1;
  assert.equal(offer.show(message, true), true);
  assert.equal(message.querySelector(".setup-offer").textContent, OFFER_TEXT);
  offer.show(message, true);
  assert.equal(message.querySelectorAll(".setup-offer").length, 1, "added once");
  assert.equal(offer.show(message, false), false);
  time += 1000;
  assert.equal(offer.show(message, true), false, "music in between starts the wait again");
});
