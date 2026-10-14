// Settings overlay, opened with OK. It keeps its own focus index because
// webOS does not move DOM focus on arrow keys.

const AUTO_CLOSE_MS = 12000;

// rows: [{ label, value(), change(direction), visible?() }]
// `change` gets -1 / +1 for left / right, and +1 for OK or a click.
export function createMenu(element, rows) {
  let open = false;
  let focus = 0;
  let timer = 0;
  let shown = [];

  function render() {
    shown = rows.filter((row) => !row.visible || row.visible());
    if (focus >= shown.length) focus = shown.length - 1;
    element.textContent = "";
    shown.forEach((row, i) => {
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
      if (name === "back") close();
      else if (name === "up") focus = (focus + shown.length - 1) % shown.length;
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
