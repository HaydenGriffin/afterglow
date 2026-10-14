// Settings sheet. It keeps its own focus index because webOS does not move DOM
// focus on arrow keys.

const AUTO_CLOSE_MS = 12000;

// rows: [{ label, value(), change(direction), visible?() }], plus
//   { section: "Name" } headings and { figure(element), visible?() } drawings,
// which are shown but never focused.
// `change` gets -1 / +1 for left / right, and +1 for OK or a click.
export function createMenu(element, rows, { title = "Settings", onBack } = {}) {
  let open = false;
  let focus = 0;
  let timer = 0;
  let shown = [];

  function render() {
    const visible = rows.filter((row) => !row.visible || row.visible());
    // a heading with nothing under it before the next heading is dropped
    const listed = visible.filter((row, i) => !row.section || (visible[i + 1] && !visible[i + 1].section));
    shown = listed.filter((row) => !row.section && !row.figure);
    if (focus >= shown.length) focus = shown.length - 1;
    element.textContent = "";
    const heading = document.createElement("h2");
    heading.textContent = title;
    element.appendChild(heading);
    listed.forEach((row) => {
      if (row.section) {
        const h = document.createElement("h3");
        h.textContent = row.section;
        element.appendChild(h);
        return;
      }
      if (row.figure) {
        const box = document.createElement("div");
        box.className = "figure";
        row.figure(box);
        element.appendChild(box);
        return;
      }
      const i = shown.indexOf(row);
      const line = document.createElement("div");
      line.className = i === focus ? "row focus" : "row";
      const label = document.createElement("span");
      label.textContent = row.label;
      const value = document.createElement("span");
      value.textContent = row.value ? row.value() : "";
      line.appendChild(label);
      line.appendChild(value);
      line.addEventListener("click", () => {
        focus = i;
        activate(1);
      });
      element.appendChild(line);
    });
    const selected = element.querySelector(".focus");
    if (selected) selected.scrollIntoView({ block: "nearest" });
    if (focus === 0) element.scrollTop = 0;
  }

  function touch() {
    clearTimeout(timer);
    timer = setTimeout(close, AUTO_CLOSE_MS);
  }

  function close() {
    open = false;
    clearTimeout(timer);
    element.style.display = "none";
  }

  function activate(direction) {
    const row = shown[focus];
    if (row && row.change) row.change(direction);
    if (open) render();
  }

  return {
    get isOpen() {
      return open;
    },
    open() {
      open = true;
      focus = 0;
      element.style.display = "block";
      render();
      touch();
    },
    close,
    // Returns true when the key was used by the menu.
    handleKey(name) {
      if (!open) return false;
      touch();
      if (name === "back") {
        close();
        if (onBack) onBack();
      } else if (name === "up") focus = (focus + shown.length - 1) % shown.length;
      else if (name === "down") focus = (focus + 1) % shown.length;
      else if (name === "left") activate(-1);
      else if (name === "right" || name === "ok") activate(1);
      if (open) render();
      return true;
    },
    describe() {
      if (!open) return "closed";
      return shown.map((row, i) => (i === focus ? "> " : "") + row.label + (row.value ? "=" + row.value() : "")).join(" | ");
    },
  };
}
