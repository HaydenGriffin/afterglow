// Up next in the Queue panel, past the first dozen songs: read 25 at a time
// from the song after the playing one as the focus nears the last loaded song,
// up to 500, with at most 50 song rows in the panel at once (the window moves
// with the focus). The 5-second refresh rereads the first page only; when that
// page changed, later pages are dropped and read again as the focus needs them.

export const QUEUE_PAGE = 25;
export const QUEUE_MAX = 500;
export const QUEUE_ROWS = 50;
export const QUEUE_NEAR_END = 3;
const MARGIN = 5;

// first: the queue index of the song after the playing one.
export function queuePageArgs(queueId, first, loaded) {
  return { queue_id: queueId, offset: first + loaded, limit: QUEUE_PAGE };
}
// Whether Music Assistant may have more after `loaded` songs: the last page
// was full and the queue's length (when it says) goes further.
export function queueHasMore(loaded, lastPage, first, total) {
  if (loaded >= QUEUE_MAX || lastPage < QUEUE_PAGE) return false;
  return !(total > 0) || first + loaded < total;
}
// The first page read again: later pages stay only when it did not change.
export function refreshFirst(items, page) {
  const same = page.length === Math.min(items.length, QUEUE_PAGE) && page.every((item, i) => items[i] && items[i].queue_item_id === item.queue_item_id);
  return same ? page.concat(items.slice(page.length)) : page.slice();
}
export function appendPage(items, page) { return items.concat(page).slice(0, QUEUE_MAX); }

// The songs [start, end) in the panel; it moves only when the focused song nears its edge.
export function songWindow(count, focus, current) {
  if (count <= QUEUE_ROWS) return current && current.start === 0 && current.end === count ? current : { start: 0, end: count };
  if (current && current.end - current.start === QUEUE_ROWS && current.end <= count &&
      focus >= current.start + (current.start ? MARGIN : 0) && focus < current.end - (current.end < count ? MARGIN : 0)) return current;
  const start = Math.max(0, Math.min(count - QUEUE_ROWS, focus - QUEUE_ROWS / 2));
  return { start, end: start + QUEUE_ROWS };
}
