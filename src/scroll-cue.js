// Lists longer than their sheet say so: a fade of the sheet's ground over
// the last visible row and "More" with a down chevron at the list's lower
// edge, and the same at the top (up chevron) once rows sit above. The focused
// row keeps one row of the list visible beyond it, so the cue never covers
// it. Any scrollbar stays; the cue is in addition to it.

const EDGE_PX = 2; // rounding slack: this close to an end counts as the end

// Whether rows sit above or below what the list shows.
export function overflowOf({ scrollTop, clientHeight, scrollHeight }) {
  return { above: scrollTop > EDGE_PX, below: scrollTop + clientHeight < scrollHeight - EDGE_PX };
}

// The scroll position that shows the row from `top` to `bottom` (list
// coordinates) with `context` more of the list above and below it, moving
// the list as little as possible. Near either end it simply reaches the end.
export function scrollFor({ top, bottom, context, scrollTop, clientHeight, scrollHeight }) {
  let want = scrollTop;
  if (bottom + context > want + clientHeight) want = bottom + context - clientHeight;
  if (top - context < want) want = top - context;
  return Math.max(0, Math.min(Math.max(0, scrollHeight - clientHeight), Math.round(want)));
}

const CHEVRONS = { up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>' };

function cue(direction) {
  const box = document.createElement("div");
  box.className = "scroll-cue scroll-cue-" + direction;
  box.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "scroll-cue-label";
  label.innerHTML = "More" + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">' + CHEVRONS[direction] + "</svg>";
  box.appendChild(label);
  return box;
}

// list: the element that scrolls; frame: its parent, which does not scroll
// and holds the cues (player.css .scroll-frame).
export function createScrollCue(list, frame) {
  const cues = [cue("up"), cue("down")];
  cues.forEach((c) => frame.appendChild(c));
  let gutter = "";
  function update() {
    if (list.scrollHeight === undefined) return; // no layout (tests)
    const o = overflowOf(list);
    frame.classList.toggle("more-above", o.above);
    frame.classList.toggle("more-below", o.below);
    // The cues stop short of the scrollbar, whatever width the browser gives it.
    const right = Math.max(0, list.offsetWidth - list.clientWidth) + "px";
    if (right !== gutter) { gutter = right; cues.forEach((c) => (c.style.right = right)); }
  }
  list.addEventListener("scroll", update);
  return {
    update,
    // Scroll so `row` shows with a row of context beyond it, then redraw the cues.
    reveal(row) {
      if (row && typeof row.getBoundingClientRect === "function" && typeof list.getBoundingClientRect === "function") {
        const box = list.getBoundingClientRect(), r = row.getBoundingClientRect();
        const top = r.top - box.top - list.clientTop + list.scrollTop;
        const next = scrollFor({ top, bottom: top + r.height, context: r.height, scrollTop: list.scrollTop, clientHeight: list.clientHeight, scrollHeight: list.scrollHeight });
        if (next !== list.scrollTop) list.scrollTop = next;
      } else if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
      update();
    },
  };
}
