// Browse's long lists: library lists are read a page at a time as the focus
// nears the end (Music Assistant's offset/limit, as the PS5 pages them);
// whole-list answers (an album's songs, a podcast's episodes) are kept whole.
// Items are slimmed to what Browse draws and plays, so thousands of them stay
// light on the TV, and only a window of rows is ever in the page.

export const PAGE = 60;
export const MAX_ITEMS = 10000;
export const NEAR_END = 10; // rows from the last loaded one that read the next page
export const WINDOW = 80; // list rows in the page at once
const MARGIN = 15; // rows from the window's edge that move it

// What Browse uses of an item: its identity, names, kind lines and one thumb.
export function slim(item) {
  const out = { item_id: item.item_id, provider: item.provider, media_type: item.media_type, uri: item.uri, name: item.name };
  const names = list => (Array.isArray(list) ? list : []).map(a => (typeof a === "string" ? { name: a } : { name: a && a.name })).filter(a => a.name);
  if (item.artists) out.artists = names(item.artists);
  if (item.authors) out.authors = names(item.authors);
  ["year", "duration", "publisher", "total_episodes", "image"].forEach(key => { if (item[key] != null) out[key] = item[key]; });
  const metadata = item.metadata || {}, images = metadata.images || [];
  const thumb = images.filter(i => i && i.type === "thumb")[0];
  if (thumb || metadata.release_date) out.metadata = {};
  if (thumb) out.metadata.images = [thumb];
  if (metadata.release_date) out.metadata.release_date = metadata.release_date;
  if (item.album) out.album = { name: item.album.name, image: item.album.image };
  return out;
}

// A list as Browse holds it. tail: what the list ends in: "" (nothing),
// "loading" (Loading more…), "error" (More couldn't load) or "cap".
export function emptyList() { return { items: [], received: 0, more: false, tail: "" }; }
export function pageArgs(args, offset) { return Object.assign({}, args, { limit: PAGE, offset }); }

// Adds an answer. paged: a library list read with offset/limit, where a full
// page means Music Assistant may have more; otherwise the answer is the whole list.
export function addPage(list, result, paged) {
  const page = Array.isArray(result) ? result : [];
  const kept = page.filter(x => x && x.uri).map(slim);
  const all = list.items.concat(kept);
  const more = paged && page.length >= PAGE;
  const over = all.length > MAX_ITEMS || (more && all.length >= MAX_ITEMS);
  return { items: all.slice(0, MAX_ITEMS), received: list.received + page.length, more: more && !over, tail: over ? "cap" : "" };
}
export function loadingMore(list) { return Object.assign({}, list, { tail: "loading" }); }
export function failedMore(list) { return Object.assign({}, list, { tail: "error" }); }
// True when the focus on item `index` should read the next page now.
export function wantsMore(list, index) { return list.more && list.tail === "" && index >= list.items.length - NEAR_END; }

// The rows [start, end) of `count` that are in the page, given the focused
// row and the window shown now; the window moves only near its edge.
export function windowFor(count, focus, current) {
  if (count <= WINDOW) return { start: 0, end: count };
  const fits = current && current.end - current.start === WINDOW && current.end <= count;
  if (fits && focus >= current.start + (current.start ? MARGIN : 0) && focus < current.end - (current.end < count ? MARGIN : 0)) return current;
  const start = Math.max(0, Math.min(count - WINDOW, focus - WINDOW / 2));
  return { start, end: start + WINDOW };
}
