import test from "node:test";
import assert from "node:assert/strict";
import { appendPage, QUEUE_MAX, queueHasMore, queuePageArgs, refreshFirst, songWindow } from "../src/queue-pages.js";

const q = (from, n) => Array.from({ length: n }, (_, i) => ({ queue_item_id: "q" + (from + i) }));
test("queue pages start after the playing song", () => {
  assert.deepEqual(queuePageArgs("tv", 4, 50), { queue_id: "tv", offset: 54, limit: 25 });
});
test("more follows a full page while the queue's length goes further, up to the cap", () => {
  assert.equal(queueHasMore(25, 25, 4, 0), true, "no length: a full page may have more");
  assert.equal(queueHasMore(25, 25, 4, 29), false);
  assert.equal(queueHasMore(25, 12, 4, 0), false);
  assert.equal(queueHasMore(QUEUE_MAX, 25, 0, 9999), false);
  assert.equal(appendPage(q(0, QUEUE_MAX - 5), q(0, 25)).length, QUEUE_MAX);
});
test("the first page read again keeps later pages only when unchanged", () => {
  assert.equal(refreshFirst(q(0, 60), q(0, 25)).length, 60);
  assert.equal(refreshFirst(q(0, 60), q(1, 25)).length, 25);
  assert.equal(refreshFirst([], q(0, 10)).length, 10);
});
test("the song window holds the focus and moves near its edge", () => {
  let win = songWindow(30, 0, null);
  assert.deepEqual(win, { start: 0, end: 30 });
  assert.equal(songWindow(30, 10, win), win);
  win = songWindow(200, 0, null);
  assert.deepEqual(win, { start: 0, end: 50 });
  assert.equal(songWindow(200, 40, win), win);
  win = songWindow(200, 46, win);
  assert.ok(win.start > 0 && win.start <= 46 && win.end > 46);
});
