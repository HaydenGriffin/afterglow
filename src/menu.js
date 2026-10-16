// Settings sheet. It keeps its own focus index because webOS does not move DOM
// focus on arrow keys. The title stays put; the rows scroll beneath it with
// the "More" cue (scroll-cue.js) while some are out of sight.
import { createScrollCue } from "./scroll-cue.js";

const IDLE_CLOSE_MS = 45000; // closes after this long without a key
const REFRESH_MS = 1000; // values are re-read this often while open
const MENU_KEYS = ["back", "up", "down", "left", "right", "ok"];

const REAL_TIMERS = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clear: (id) => {
    clearTimeout(id);
    clearInterval(id);
  },
};

// rows: [{ label, value(), change(direction), visible?() }], plus
//   { section: "Name" } headings and { figure(element), visible?() } drawings,
// which are shown but never focused. `label` may be a function.
// `change` gets -1 / +1 for left / right, and +1 for OK or a click.
export function createMenu(element, rows, { title = "Settings", onBack, timers = REAL_TIMERS } = {}) {
  let open = false;
  let focus = 0;
  let focusRow = null; // the focused row, kept across rows appearing and going
  let idleTimer = 0;
  let tickTimer = 0;
  let shown = [];
  let listed = [];
  let cells = []; // [row, label span, value span] for every focusable row on screen

  const body = document.createElement("div");
  body.className = "menu-body";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const frame = document.createElement("div");
  frame.className = "scroll-frame";
  const list = document.createElement("div");
  list.className = "menu-rows";
  frame.appendChild(list);
  body.appendChild(heading);
  body.appendChild(frame);
  element.textContent = "";
  element.appendChild(body);
  const cue = createScrollCue(list, frame);

  const labelOf = (row) => (typeof row.label === "function" ? row.label() : row.label);
  const valueOf = (row) => (row.value ? row.value() : "");

  function listRows() {
    const visible = rows.filter((row) => !row.visible || row.visible());
    // a heading with nothing under it before the next heading is dropped
    return visible.filter((row, i) => !row.section || (visible[i + 1] && !visible[i + 1].section));
  }

  function render() {
    listed = listRows();
    shown = listed.filter((row) => !row.section && !row.figure);
    const kept = focusRow ? shown.indexOf(focusRow) : -1;
    if (kept >= 0) focus = kept;
    if (focus >= shown.length) focus = shown.length - 1;
    if (focus < 0) focus = 0;
    focusRow = shown[focus] || null;
    cells = [];
    list.textContent = "";
    listed.forEach((row) => {
      if (row.section) {
        const h = document.createElement("h3");
        h.textContent = row.section;
        list.appendChild(h);
        return;
      }
      if (row.figure) {
        const box = document.createElement("div");
        box.className = "figure";
        row.figure(box);
        list.appendChild(box);
        return;
      }
      const i = shown.indexOf(row);
      const line = document.createElement("div");
      line.className = i === focus ? "row focus" : "row";
      const label = document.createElement("span");
      label.textContent = labelOf(row);
      const value = document.createElement("span");
      value.textContent = valueOf(row);
      line.appendChild(label);
      line.appendChild(value);
      line.addEventListener("click", () => {
        focus = i;
        focusRow = row;
        activate(1);
      });
      list.appendChild(line);
      cells.push([row, label, value]);
    });
    if (focus === 0) list.scrollTop = 0;
    cue.reveal(list.querySelector(".focus"));
  }

  // Re-read labels and values in place; rebuild only when the rows changed.
  // Focus stays on the same row either way.
  function refresh() {
    if (!open) return;
    const next = listRows();
    if (next.length !== listed.length || next.some((row, i) => row !== listed[i])) return render();
    for (const [row, label, value] of cells) {
      const l = String(labelOf(row));
      const v = String(valueOf(row));
      if (label.textContent !== l) label.textContent = l;
      if (value.textContent !== v) value.textContent = v;
    }
    cue.update();
  }

  function touch() {
    timers.clear(idleTimer);
    idleTimer = timers.setTimeout(close, IDLE_CLOSE_MS);
  }

  function close() {
    open = false;
    timers.clear(idleTimer);
    timers.clear(tickTimer);
    tickTimer = 0;
    element.style.display = "none";
  }

  function activate(direction) {
    const row = shown[focus];
    if (row && row.change) row.change(direction);
    if (open) render();
  }

  function move(by) {
    if (!shown.length) return;
    focus = (focus + by + shown.length) % shown.length;
    focusRow = shown[focus];
  }

  return {
    get isOpen() {
      return open;
    },
    // Opens on the row it was left at.
    open() {
      open = true;
      element.style.display = "block";
      render();
      touch();
      timers.clear(tickTimer);
      tickTimer = timers.setInterval(refresh, REFRESH_MS);
    },
    close,
    refresh,
    // Rebuild at once (figures included), keeping focus: after something the
    // menu did not do itself changed what it shows.
    redraw() {
      if (open) render();
    },
    // Returns true when the key was used by the menu; anything else (play,
    // the colour keys) is left for the rest of the app.
    handleKey(name) {
      if (!open || MENU_KEYS.indexOf(name) < 0) return false;
      touch();
      if (name === "back") {
        close();
        if (onBack) onBack();
      } else if (name === "up") move(-1);
      else if (name === "down") move(1);
      else if (name === "left") activate(-1);
      else if (name === "right" || name === "ok") activate(1);
      if (open) render();
      return true;
    },
    describe() {
      if (!open) return "closed";
      return shown.map((row, i) => (i === focus ? "> " : "") + labelOf(row) + (row.value ? "=" + row.value() : "")).join(" | ");
    },
  };
}
