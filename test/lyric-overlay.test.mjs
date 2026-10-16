import test from "node:test";
import assert from "node:assert/strict";
import { LAYOUT, LOOK_ROWS, overlayKind, overlayLook, placeOverlay, stepKind, stepLook } from "../src/lyric-overlay.js";

test("the overlay preference reads the old On/Off and the three overlays", () => {
  assert.equal(overlayKind(true), "line", "On before Stage existed was One line");
  assert.equal(overlayKind(false), "off");
  assert.equal(overlayKind(undefined), "off");
  assert.equal(overlayKind("stage"), "stage");
  assert.equal(overlayKind("line"), "line");
  assert.equal(overlayKind("karaoke"), "off", "an unknown value is Off");
});

test("each overlay has its own defaults: One line at Bottom, Stage at Middle, both Box and Medium", () => {
  assert.deepEqual(overlayLook("line", null), { position: "bottom", background: "box", size: "medium" });
  assert.deepEqual(overlayLook("stage", undefined), { position: "middle", background: "box", size: "medium" });
});

test("a stored look keeps its known values and falls back for the rest", () => {
  assert.deepEqual(overlayLook("line", { position: "top", background: "glow", size: "large" }), { position: "top", background: "box", size: "large" });
  assert.deepEqual(overlayLook("stage", "middle"), { position: "middle", background: "box", size: "medium" }, "not an object: defaults");
});

test("left and right step through the values and wrap, without touching the other fields", () => {
  const look = overlayLook("line", null);
  assert.deepEqual(stepLook(look, "position", 1), { position: "top", background: "box", size: "medium" });
  assert.deepEqual(stepLook(look, "position", -1), { position: "middle", background: "box", size: "medium" });
  assert.equal(stepLook(look, "background", 1).background, "shade");
  assert.equal(stepLook(stepLook(look, "background", 1), "background", 1).background, "none");
  assert.equal(stepLook(look, "size", 1).size, "large");
  assert.equal(stepLook(look, "size", -1).size, "small");
  assert.equal(look.position, "bottom", "the look given is not changed");
  assert.equal(stepKind("off", 1), "line");
  assert.equal(stepKind("line", 1), "stage");
  assert.equal(stepKind("stage", 1), "off");
  assert.equal(stepKind("off", -1), "stage");
});

test("the rows use the shared wording", () => {
  assert.deepEqual(LOOK_ROWS.map((r) => r[1]), ["Position", "Background", "Size"]);
  assert.deepEqual(LOOK_ROWS.map((r) => r[2].map((v) => r[3][v])), [["Top", "Middle", "Bottom"], ["Box", "Shade", "None"], ["Small", "Medium", "Large"]]);
});

test("Top sits below the notices and Bottom on the safe margin", () => {
  assert.deepEqual(placeOverlay({ position: "top", height: 8 }), { top: LAYOUT.top });
  assert.deepEqual(placeOverlay({ position: "bottom", height: 8 }), { bottom: LAYOUT.bottom });
});

test("Bottom stacks above the track card while it shows, a gutter above it", () => {
  assert.deepEqual(placeOverlay({ position: "bottom", height: 8, card: 20 }), { bottom: LAYOUT.bottom + 20 + LAYOUT.gap });
});

test("Middle is the screen's vertical centre", () => {
  assert.deepEqual(placeOverlay({ position: "middle", height: 10 }), { top: 45 });
  assert.deepEqual(placeOverlay({ position: "middle", height: 10, card: 20 }), { top: 45 }, "a card well below leaves it alone");
});

test("Middle moves up off a tall track card, never above the notices", () => {
  // card 30vh: its top is at 64vh; the box (30vh) would run to 65vh.
  const at = placeOverlay({ position: "middle", height: 30, card: 30 });
  assert.equal(at.top + 30, 100 - LAYOUT.bottom - 30 - LAYOUT.gap);
  assert.equal(placeOverlay({ position: "middle", height: 80, card: 30 }).top, LAYOUT.top);
});

test("Middle keeps off the Waiting for music line: beneath it, or above when the card is in the way", () => {
  const below = placeOverlay({ position: "middle", height: 10, message: true });
  assert.equal(below.top, LAYOUT.messageBottom + LAYOUT.gap);
  const above = placeOverlay({ position: "middle", height: 14, card: 30, message: true });
  assert.equal(above.top + 14, LAYOUT.messageTop - LAYOUT.gap);
  assert.deepEqual(placeOverlay({ position: "bottom", height: 10, message: true }), { bottom: LAYOUT.bottom }, "Bottom is clear of it anyway");
});
