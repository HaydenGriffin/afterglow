// Sound & sync drawn as one timeline: the other speakers in the middle, this
// TV's sound moved earlier by its audio delay, and the picture (MilkDrop and
// lyrics) moved later from the TV's sound by the trim. Earlier is left.
const SPAN_MS = 600;

// A timing in words that name what it is measured against: "420 ms ahead of
// the other speakers", "75 ms after the TV's sound".
export function timingLabel(ms, positive, negative, inStep) {
  if (ms === null || ms === undefined) return "…";
  if (!ms) return inStep;
  return Math.abs(ms) + " ms " + (ms > 0 ? positive : negative);
}

export function syncMarks(audioMs, trimMs) {
  const at = ms => Math.max(2, Math.min(98, 50 + ms / (2 * SPAN_MS) * 100));
  const sound = audioMs === null || audioMs === undefined ? null : -audioMs;
  const picture = (sound === null ? 0 : sound) + (trimMs || 0);
  const marks = [{ id: "speakers", label: "Other speakers", at: 50, side: "above" }];
  if (sound !== null) marks.push({ id: "sound", label: "TV sound", at: at(sound), side: "below" });
  marks.push({ id: "picture", label: "Picture & lyrics", at: at(picture), side: sound === null ? "below" : "above" });
  return marks;
}

export function drawSync(box, audioMs, trimMs) {
  box.className = "figure sync-figure";
  const scale = document.createElement("div");
  scale.className = "sync-scale";
  syncMarks(audioMs, trimMs).forEach(m => {
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
