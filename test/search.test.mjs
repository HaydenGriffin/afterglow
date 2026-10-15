import test from "node:test";
import assert from "node:assert/strict";
import { cleanQuery, flattenGroups, groupResults, searchArgs, SEARCH_LIMIT } from "../src/search.js";

const item = (kind, n) => ({ media_type: kind, uri: kind + "://" + n, name: kind + " " + n });

test("queries are trimmed, single-spaced and bounded", () => {
  assert.equal(cleanQuery("  daft   punk \n"), "daft punk");
  assert.equal(cleanQuery(null), "");
  assert.equal(cleanQuery("x".repeat(500)).length, 100);
});

test("search asks for artists, albums, songs and playlists, a few of each", () => {
  assert.deepEqual(searchArgs("low"), { search_query: "low", media_types: ["artist", "album", "track", "playlist"], limit: SEARCH_LIMIT });
});

test("results are grouped in a fixed order, bounded, and empty groups dropped", () => {
  const many = Array.from({ length: 20 }, (_, i) => item("track", i));
  const groups = groupResults({ tracks: many, artists: [item("artist", 1), { name: "no uri" }], albums: [], radio: [item("radio", 1)] });
  assert.deepEqual(groups.map(g => g.label), ["Artists", "Songs"]);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[1].items.length, SEARCH_LIMIT);
  assert.deepEqual(groupResults(null), []);
});

test("groups flatten into one list with headings at each group's start", () => {
  const { items, headings } = flattenGroups([{ label: "Artists", items: [item("artist", 1)] }, { label: "Songs", items: [item("track", 1), item("track", 2)] }]);
  assert.equal(items.length, 3);
  assert.deepEqual(headings, { 0: "Artists", 1: "Songs" });
});
