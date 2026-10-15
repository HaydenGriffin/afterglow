// The one focused row: the focus class (DESIGN.md: a class, not :focus-visible)
// and the browser's focus move together. A disabled button cannot take the
// browser's focus, so the previous one is let go of explicitly; otherwise it
// kept :focus and two rows looked chosen.
export const FIRST_ENABLED = -1; // an index meaning the first row that can be used

// Marks list[index] focused within root; returns the index used.
export function focusRow(root, list, index) {
  root.querySelectorAll("button.selected").forEach((b) => { b.classList.remove("selected"); b.tabIndex = -1; });
  if (index === FIRST_ENABLED) index = Math.max(0, list.findIndex((b) => !b.disabled));
  index = Math.max(0, Math.min(index, list.length - 1));
  const target = list[index];
  if (!target) return index;
  const active = document.activeElement;
  if (active && active !== target && root.contains(active)) active.blur();
  target.classList.add("selected"); target.tabIndex = 0; target.focus({ preventScroll: true });
  return index;
}
