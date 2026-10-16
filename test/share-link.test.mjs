import test from "node:test";
import assert from "node:assert/strict";
import { isPublicUrl, qrModules, qrSvg, QUIET, shareLink } from "../src/share-link.js";

const map = (domain, instance, url) => ({ provider_domain: domain, provider_instance: instance, item_id: "1", url });
const item = (mappings, played) => ({ media_item: { provider_mappings: mappings }, streamdetails: played ? { provider: played } : {} });

test("only a public service's own https page qualifies", () => {
  assert.ok(isPublicUrl("https://open.spotify.com/track/abc", "spotify.com"));
  assert.ok(isPublicUrl("https://tidal.com/browse/track/1", "tidal.com"));
  assert.ok(isPublicUrl("https://music.youtube.com/watch?v=abc", "youtube.com"));
  assert.ok(!isPublicUrl("http://open.spotify.com/track/abc", "spotify.com"), "not https");
  assert.ok(!isPublicUrl("https://192.168.1.4:8095/track/1", "spotify.com"), "a LAN address");
  assert.ok(!isPublicUrl("https://open.spotify.com:8443/track/abc", "spotify.com"), "a port");
  assert.ok(!isPublicUrl("https://user:pw@open.spotify.com/track/abc", "spotify.com"), "user info");
  assert.ok(!isPublicUrl("https://evilspotify.com/track/abc", "spotify.com"), "a look-alike host");
  assert.ok(!isPublicUrl("https://open.spotify.com.evil.example/track", "spotify.com"), "a host that only starts like it");
  assert.ok(!isPublicUrl("https://music.youtube.com/watch?v=abc&access_token=x", "youtube.com"), "a token in the query");
  assert.ok(!isPublicUrl("library://track/12", "spotify.com"));
  assert.ok(!isPublicUrl("https://open.spotify.com/" + "a".repeat(300), "spotify.com"), "too long");
  assert.ok(!isPublicUrl(null, "spotify.com"));
});

test("the service the song played from comes first", () => {
  const mappings = [map("tidal", "tidal--a", "https://tidal.com/browse/track/1"), map("spotify", "spotify--b", "https://open.spotify.com/track/x")];
  assert.deepEqual(shareLink(item(mappings, "spotify--b")), { url: "https://open.spotify.com/track/x", service: "Spotify" });
  assert.deepEqual(shareLink(item(mappings, "tidal--a")), { url: "https://tidal.com/browse/track/1", service: "Tidal" });
});

test("then the same service on another account, then a stable order", () => {
  const mappings = [
    map("deezer", "deezer--z", "https://www.deezer.com/track/9"),
    map("tidal", "tidal--b", "https://tidal.com/browse/track/2"),
    map("tidal", "tidal--a", "https://tidal.com/browse/track/1"),
  ];
  assert.equal(shareLink(item(mappings, "tidal--gone")).url, "https://tidal.com/browse/track/1", "same domain, then instance order");
  // A local file played: Tidal before Deezer by the table's order, whatever the list's order.
  assert.equal(shareLink(item(mappings, "filesystem_local--x")).url, "https://tidal.com/browse/track/1");
  assert.equal(shareLink(item(mappings.slice().reverse(), "")).url, "https://tidal.com/browse/track/1");
});

test("no public link: nothing to show", () => {
  assert.equal(shareLink(null), null);
  assert.equal(shareLink({}), null);
  assert.equal(shareLink(item([map("filesystem_local", "filesystem--a", null)], "filesystem--a")), null);
  assert.equal(shareLink(item([map("plex", "plex--a", "https://plex.example/library/1")], "plex--a")), null, "not a listed service");
  assert.equal(shareLink(item([map("spotify", "spotify--a", "http://10.0.0.9/track")], "spotify--a")), null);
});

// The same url gives this grid in both apps (PS5 tests/unit/share_link_test.cpp).
const FIXTURE_URL = "https://open.spotify.com/track/afterglowdemo0001";
const FIXTURE = [
  "#######...#.#...#####.#######",
  "#.....#.#.#..###.#..#.#.....#",
  "#.###.#.....#.#....#..#.###.#",
  "#.###.#.###.######....#.###.#",
  "#.###.#..#...#..#####.#.###.#",
  "#.....#.##.##.###.....#.....#",
  "#######.#.#.#.#.#.#.#.#######",
  ".........###...##..##........",
  "#####.####.#####.###.#.#.#.#.",
  "##.###....#.##..####.##.#...#",
  "#.#..####.#..###.#..#.#......",
  ".##.#..##...#.###....###.#.#.",
  "##.#.######..#####.##....##..",
  ".#.....##..##.#.#..##.###...#",
  "..##..##..#.####.....#.####..",
  "..##.....#..#.#.#.###.###..#.",
  "##.####...#..###.#.......##..",
  "####.#..#..##...#..##.###.#.#",
  "#.#...#.###.#.#####.##..#.#..",
  "#..#...#.##.#..#..#..#..#..#.",
  "#.#.#######..###.#.######.###",
  "........#.###...#.#.#...#####",
  "#######.##..#.###.###.#.###..",
  "#.....#...#.#.#.#..##...#..#.",
  "#.###.#.##...##..#..#####.##.",
  "#.###.#.#.####....#....#.##.#",
  "#.###.#.#.#...######.#######.",
  "#.....#.####..#....##.##.#.#.",
  "#######.##.####..#.#..##..#.."
];

test("QR encode gives the shared module grid", () => {
  const grid = qrModules(FIXTURE_URL);
  assert.equal(grid.size, 29);
  const rows = [];
  for (let y = 0; y < grid.size; y++) {
    let row = "";
    for (let x = 0; x < grid.size; x++) row += grid.dark(x, y) ? "#" : ".";
    rows.push(row);
  }
  assert.deepEqual(rows, FIXTURE);
});

test("the drawing is flat squares on paper with a quiet zone", () => {
  const svg = qrSvg(FIXTURE_URL);
  const n = 29 + 2 * QUIET;
  assert.match(svg, new RegExp('viewBox="0 0 ' + n + " " + n + '"'));
  assert.match(svg, /<rect width="37" height="37" style="fill:var\(--paper\)"\/>/);
  assert.match(svg, /^<svg[^>]*shape-rendering="crispEdges"/);
  assert.match(svg, /M4 4h7v1h-7z/, "the top-left finder's first row starts inside the quiet zone");
  assert.doesNotMatch(svg, /rx=|gradient|filter/);
});
