import test from "node:test";
import assert from "node:assert/strict";
import { addPage, emptyList, failedMore, loadingMore, MAX_ITEMS, PAGE, pageArgs, slim, wantsMore, WINDOW, windowFor } from "../src/browse-pages.js";

const item = n => ({ item_id: String(n), provider: "library", media_type: "album", uri: "library://album/" + n, name: "Album " + n,
  artists: [{ name: "Demo", item_id: "1", provider_mappings: [{}] }], year: 2020, provider_mappings: [{ big: "x".repeat(100) }],
  metadata: { images: [{ type: "fanart", path: "a" }, { type: "thumb", path: "b" }], description: "long" } });
const page = (from, count) => Array.from({ length: count }, (_, i) => item(from + i));

test("a library list asks for pages of 60 from the next offset", () => {
  assert.deepEqual(pageArgs({ favorite: true, order_by: "sort_name" }, 120), { favorite: true, order_by: "sort_name", limit: PAGE, offset: 120 });
});

test("a full page means more may follow; a short one ends the list", () => {
  let list = addPage(emptyList(), page(0, PAGE), true);
  assert.equal(list.items.length, PAGE);
  assert.equal(list.more, true);
  assert.equal(list.received, PAGE);
  list = addPage(list, page(PAGE, 12), true);
  assert.equal(list.items.length, PAGE + 12);
  assert.equal(list.more, false);
  assert.equal(list.tail, "");
});

test("items without a uri are dropped but still count towards the next offset", () => {
  const answer = page(0, PAGE); answer[3] = { name: "broken" };
  const list = addPage(emptyList(), answer, true);
  assert.equal(list.items.length, PAGE - 1);
  assert.equal(list.received, PAGE);
});

test("the next page is wanted only near the end, once, and not after a failure", () => {
  const list = addPage(emptyList(), page(0, PAGE), true);
  assert.equal(wantsMore(list, 10), false);
  assert.equal(wantsMore(list, PAGE - 10), true);
  assert.equal(wantsMore(loadingMore(list), PAGE - 1), false, "one read at a time");
  assert.equal(wantsMore(failedMore(list), PAGE - 1), false, "a failure waits for OK");
  assert.equal(wantsMore(addPage(emptyList(), page(0, PAGE), false), PAGE - 1), false, "a whole list has nothing more to read");
});

test("a whole list is kept beyond 200 items, up to the cap", () => {
  const list = addPage(emptyList(), page(0, 450), false);
  assert.equal(list.items.length, 450);
  assert.equal(list.tail, "");
  const huge = addPage(emptyList(), page(0, MAX_ITEMS + 5), false);
  assert.equal(huge.items.length, MAX_ITEMS);
  assert.equal(huge.tail, "cap");
});

test("paging stops at the cap and says so", () => {
  let list = { items: page(0, MAX_ITEMS - PAGE).map(slim), received: MAX_ITEMS - PAGE, more: true, tail: "" };
  list = addPage(list, page(MAX_ITEMS - PAGE, PAGE), true);
  assert.equal(list.items.length, MAX_ITEMS);
  assert.equal(list.more, false);
  assert.equal(list.tail, "cap");
});

test("items keep only what Browse draws and plays", () => {
  const s = slim(Object.assign(item(4), { authors: ["A Writer"], album: { name: "X", image: { path: "c" }, provider_mappings: [] } }));
  assert.deepEqual(s, { item_id: "4", provider: "library", media_type: "album", uri: "library://album/4", name: "Album 4",
    artists: [{ name: "Demo" }], authors: [{ name: "A Writer" }], year: 2020, metadata: { images: [{ type: "thumb", path: "b" }] }, album: { name: "X", image: { path: "c" } } });
});

test("the row window holds the focus and moves only near its edge", () => {
  assert.deepEqual(windowFor(30, 29, null), { start: 0, end: 30 }, "a short list is whole");
  let win = windowFor(1000, 0, null);
  assert.deepEqual(win, { start: 0, end: WINDOW });
  assert.equal(windowFor(1000, 50, win), win, "well inside: unchanged");
  win = windowFor(1000, WINDOW - 10, win);
  assert.ok(win.start > 0 && WINDOW - 10 >= win.start && WINDOW - 10 < win.end, "near the edge it moves around the focus");
  assert.deepEqual(windowFor(1000, 999, win), { start: 1000 - WINDOW, end: 1000 });
  const grown = windowFor(1060, 995, { start: 1000 - WINDOW, end: 1000 });
  assert.ok(grown.end > 1000, "more rows arriving below the focus extend the window");
});
