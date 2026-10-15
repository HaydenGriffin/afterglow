// Sound & sync drawn as one timeline. Every speaker, this TV included, plays
// the group's music in step: the TV's audio delay only compensates its own
// output latency, so it is not an offset on this scale. The picture (MilkDrop
// and lyrics) is timed from the group clock, later by the trim. Earlier is left.
const SPAN_MS = 600;

// A timing in words that name what it is measured against: "75 ms after the
// music", "30 ms before the music".
export function timingLabel(ms, positive, negative, inStep) {
  if (ms === null || ms === undefined) return "…";
  if (!ms) return inStep;
  return Math.abs(ms) + " ms " + (ms > 0 ? positive : negative);
}

export function syncMarks(trimMs) {
  const at = ms => Math.max(2, Math.min(98, 50 + ms / (2 * SPAN_MS) * 100));
  return [
    { id: "music", label: "The music", at: 50, side: "below" },
    { id: "picture", label: "Picture & lyrics", at: at(trimMs || 0), side: "above" },
  ];
}

export function drawSync(box, trimMs) {
  box.className = "figure sync-figure";
  const scale = document.createElement("div");
  scale.className = "sync-scale";
  syncMarks(trimMs).forEach(m => {
    const mark = document.createElement("span");
    mark.className = "sync-mark sync-" + m.id + " " + m.side;
    mark.style.left = m.at + "%";
    const label = document.createElement("em");
    label.textContent = m.label;
    mark.appendChild(label);
    scale.appendChild(mark);
  });
  const ends = document.createElement("p");
  ends.className = "sync-ends";
  ends.innerHTML = "<span>Earlier</span><span>Later</span>";
  box.appendChild(scale);
  box.appendChild(ends);
}
