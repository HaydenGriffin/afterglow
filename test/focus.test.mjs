import assert from "node:assert/strict";
import { test } from "node:test";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { FIRST_ENABLED, focusRow } from "../src/focus.js";

function rows(doc, disabled) {
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  const list = disabled.map((off) => {
    const b = doc.createElement("button");
    b.disabled = off;
    root.appendChild(b);
    return b;
  });
  return { root, list };
}
const highlighted = (doc, root) => root.querySelectorAll("button").filter((b) => b.classList.contains("selected") || doc.activeElement === b);

test("moving onto a disabled row leaves one highlighted row, not two", (t) => {
  const doc = useFakeDocument(t);
  const { root, list } = rows(doc, [false, true, false]);
  focusRow(root, list, 0);
  assert.equal(doc.activeElement, list[0]);
  assert.equal(focusRow(root, list, 1), 1);
  assert.deepEqual(highlighted(doc, root), [list[1]], "the previous row lets go of :focus");
  assert.equal(list[1].tabIndex, 0);
  assert.equal(list[0].tabIndex, -1);
});

test("FIRST_ENABLED starts on the first row that can be used", (t) => {
  const doc = useFakeDocument(t);
  const { root, list } = rows(doc, [true, true, false, false]);
  assert.equal(focusRow(root, list, FIRST_ENABLED), 2);
  assert.equal(doc.activeElement, list[2]);
  const all = rows(doc, [true, true]);
  assert.equal(focusRow(all.root, all.list, FIRST_ENABLED), 0, "all disabled: the first row");
});

test("an index past the end is clamped; an empty list focuses nothing", (t) => {
  const doc = useFakeDocument(t);
  const { root, list } = rows(doc, [false, false]);
  assert.equal(focusRow(root, list, 9), 1);
  assert.equal(focusRow(root, [], 3), 0);
});
