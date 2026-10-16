// The Check my setup sheet (setup-check.js runs the checks), and the offer
// "Something not right? Check my setup" for a screen with nothing on it.
// The sheet sits where Settings does; up/down move along the rows (so a long
// list scrolls), OK on Check again runs it again, Back goes back.
import { createScrollCue } from "./scroll-cue.js";
import { setupNote } from "./setup-check.js";

const KEYS = ["back", "up", "down", "left", "right", "ok"];
export const OFFER_AFTER_MS = 20000;
export const OFFER_TEXT = "Something not right? Check my setup in Settings.";

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

export function createSetupView(element, check) {
  let open = false, focus = 0, onBack = null;
  element.textContent = "";
  const body = make("div", "setup-body", element);
  make("h2", "", body).textContent = "Check my setup";
  const note = make("p", "setup-note", body);
  const frame = make("div", "scroll-frame", body);
  const list = make("div", "setup-rows", frame);
  const cue = createScrollCue(list, frame);

  function render() {
    if (!open) return;
    const rows = check.rows || [];
    note.textContent = setupNote(rows);
    list.textContent = "";
    rows.concat([{ id: "again", label: "Check again", state: "again", value: "" }]).forEach((row, i) => {
      const line = make("div", "setup-row " + row.state + (i === focus ? " focus" : ""), list);
      const head = make("div", "setup-line", line);
      make("span", "", head).textContent = row.label;
      make("span", "", head).textContent = row.value;
      if (row.next) make("p", "setup-next", line).textContent = row.next;
      line.addEventListener("click", () => { focus = i; activate(); });
    });
    focus = Math.min(focus, list.children.length - 1);
    cue.reveal(list.querySelector(".focus"));
  }
  function run() {
    check.run(render);
    render();
  }
  function activate() {
    const rows = check.rows || [];
    if (focus === rows.length && !check.running) run();
    else render();
  }
  function close() {
    open = false;
    element.style.display = "none";
  }
  return {
    get isOpen() { return open; },
    // Opens and runs the checks; back is called when Back leaves the sheet.
    open(back) {
      open = true; focus = 0; onBack = back || null;
      element.style.display = "block";
      run();
    },
    close,
    handleKey(name) {
      if (!open || KEYS.indexOf(name) < 0) return false;
      const count = (check.rows || []).length + 1;
      if (name === "back") {
        close();
        if (onBack) onBack();
      } else if (name === "up" || name === "down") {
        focus = (focus + (name === "up" ? -1 : 1) + count) % count;
        render();
      } else if (name === "ok") activate();
      return true;
    },
  };
}

// The offer under the "Waiting for music" line: only once the screen has
// shown nothing useful for a while, so a normal start never sees it.
export function createSetupOffer(now = Date.now) {
  let since = null;
  return {
    // shown: whether the line shows now. Returns whether the offer is added.
    show(element, shown) {
      if (!shown) { since = null; return false; }
      if (since === null) since = now();
      if (now() - since < OFFER_AFTER_MS) return false;
      if (!element.querySelector || !element.querySelector(".setup-offer")) make("span", "setup-offer", element).textContent = OFFER_TEXT;
      return true;
    },
  };
}
