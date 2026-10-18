// The line in the middle of the screen in the Visuals modes: why MilkDrop
// cannot run, what is wrong with the connection, or "Waiting for music".
// With the visual style Off nothing is meant to be drawn, so MilkDrop's
// troubles are not news: the screen stays blank.

// Why MilkDrop cannot run, as far as the screen should say, or "".
export function milkdropProblem(milkdropOff, visualStyle) {
  return visualStyle === "off" ? "" : milkdropOff || "";
}

// { text, waiting } to show, or null for none. webgl2() is asked only when
// the MilkDrop line shows.
export function screenMessage({ poster, milkdropOff, visualStyle, webgl2, idle, problem }) {
  if (poster) return null;
  const why = milkdropProblem(milkdropOff, visualStyle);
  if (why) return { text: "MilkDrop can't run on this TV: " + why + (webgl2() ? " (OK, then MilkDrop, to retry)" : ""), waiting: false };
  if (!idle) return null;
  return { text: problem || "Waiting for music", waiting: !problem };
}
