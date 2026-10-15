// OLED burn-in guard: nudges the picture a few pixels every couple of
// minutes so no element sits on the same pixels for hours. Stopped while the
// app is hidden or signed out.

const OFFSETS = [[0, 0], [-6, -4], [6, -4], [6, 4], [-6, 4]];
const STEP_MS = 120000;

export function createDrift(elements) {
  let step = 0;
  let timer = 0;
  function nudge() {
    step = (step + 1) % OFFSETS.length;
    const transform = "translate(" + OFFSETS[step][0] + "px," + OFFSETS[step][1] + "px)";
    for (const element of elements) if (element) element.style.transform = transform;
  }
  return {
    start() {
      if (!timer) timer = setInterval(nudge, STEP_MS);
    },
    stop() {
      clearInterval(timer);
      timer = 0;
    },
  };
}
