// Word-by-word highlight of the current lyric line (enhanced LRC, see
// parseLyrics). Each word is a span; a word already sung carries "sung". The
// DOM is touched only when the sung word changes, and between the player
// view's 4 Hz ticks a timer lands on the next word so the highlight keeps time.

const LOOKAHEAD_S = 0.3; // a word further off than this waits for the next tick

const REAL_TIMERS = { setTimeout: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };

export function wordIndex(words, position) {
  let lo = 0, hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].at <= position) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// position(): the lyric clock in seconds (playback snapshot's lyricPosition).
export function createKaraoke(position, timers = REAL_TIMERS) {
  let words = null;
  let spans = [];
  let sungTo = -1; // index of the last word marked sung
  let timer = 0;

  function mark(index) {
    const from = Math.min(sungTo, index), to = Math.max(sungTo, index);
    for (let i = from + 1; i <= to; i++) spans[i].classList.toggle("sung", i <= index);
    sungTo = index;
  }

  function update() {
    timers.clear(timer);
    timer = 0;
    if (!words) return;
    const now = position();
    const index = wordIndex(words, now);
    if (index !== sungTo) mark(index);
    const next = words[index + 1];
    if (next && next.at - now <= LOOKAHEAD_S) timer = timers.setTimeout(update, Math.max(20, (next.at - now) * 1000));
  }

  return {
    // Set `line` into `element` (null stops). Lines without words are plain text.
    show(element, line) {
      timers.clear(timer);
      timer = 0;
      words = null;
      spans = [];
      sungTo = -1;
      if (!element) return;
      element.textContent = line ? line.text : "";
      if (!line || !line.words || !line.words.length) return;
      words = line.words;
      element.textContent = "";
      element.classList.toggle("karaoke", true);
      spans = words.map((word) => {
        const span = document.createElement("span");
        span.textContent = word.text;
        element.appendChild(span);
        return span;
      });
      update();
    },
    update,
  };
}
