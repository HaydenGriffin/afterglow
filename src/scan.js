// The preset scan: shows every preset for a few seconds and records the frame
// rate this TV manages, which decides the validated list (validation.js). It
// always runs on the built-in signal (mock.js), so every preset is measured on
// the same input whether or not music plays and whatever is playing costs the
// same; it can be paused with Back and continued later from where it stopped, and
// survives a preset that takes the TV down: the one being measured is noted
// first, so the next launch can mark it and move on.
import { createMock } from "./mock.js";
import { clearPref, loadPref, savePref } from "./settings.js";

const SETTLE_MS = 3000; // shader compile and the first frames (as the shipped benchmark waited)
const SAMPLE_MS = 1000; // the engine's frame-rate figure covers one second
const SAMPLES = 2;
const COMMIT_MS = 30000; // how often measurements go to the preferences while scanning
const READY_POLL_MS = 200;
const READY_WAIT_MS = 30000; // for MilkDrop to load when the scan starts it

export function createScan({ milkdrop, engine, source, overlay, onDone, onNotice }) {
  const mock = createMock();
  let running = false;
  let queue = [];
  let total = 0;
  let timer = 0;
  let commitTimer = 0;
  let savedCap = 60;
  let startedAt = 0;
  let measured = 0; // this run

  const feed = mock;

  function render() {
    if (!overlay) return;
    const done = total - queue.length;
    const left = queue.length;
    const pace = measured ? (Date.now() - startedAt) / measured : (SETTLE_MS + SAMPLE_MS * SAMPLES + 200);
    const minutes = Math.max(1, Math.round((left * pace) / 60000));
    overlay.querySelector(".scan-title").textContent = "Scanning presets " + done + " / " + total;
    overlay.querySelector(".scan-detail").textContent =
      milkdrop.validatedCount + " validated so far · about " + minutes + " min left · " + (queue[0] || "");
    overlay.querySelector(".scan-hint").textContent = "Back pauses the scan; you can continue it later from the menu";
  }

  // MilkDrop loads on the first frame it is handed, so a scan started while
  // nothing plays brings it up itself and waits for it.
  function waitReady(waited) {
    if (!running) return;
    if (milkdrop.ready) {
      const saved = loadPref("scanCursor", null);
      queue = Array.isArray(saved) && saved.length ? saved : milkdrop.scanOrder();
      total = milkdrop.presetCount;
      startedAt = Date.now();
      commitLater();
      next();
      return;
    }
    if (milkdrop.failed || waited >= READY_WAIT_MS) {
      if (onNotice) onNotice("Scan: MilkDrop did not start");
      return finish(false);
    }
    timer = setTimeout(() => waitReady(waited + READY_POLL_MS), READY_POLL_MS);
  }

  function finish(complete) {
    clearTimeout(timer);
    clearTimeout(commitTimer);
    timer = commitTimer = 0;
    running = false;
    milkdrop.scanning = false;
    milkdrop.commitRatings();
    clearPref("scanCurrent");
    if (complete) {
      clearPref("scanCursor");
      savePref("scanDone", Date.now());
    } else savePref("scanCursor", queue);
    engine.setFpsCap(savedCap);
    engine.setSource(source);
    if (overlay) overlay.style.display = "none";
    milkdrop.resume();
    if (onDone) onDone(complete);
  }

  function measure(name, samples) {
    if (samples.length < SAMPLES) {
      timer = setTimeout(() => measure(name, samples.concat(engine.fps)), SAMPLE_MS);
      return;
    }
    const fps = samples.reduce((a, b) => a + b, 0) / samples.length;
    milkdrop.rate(name, fps);
    measured++;
    queue.shift();
    savePref("scanCursor", queue);
    clearPref("scanCurrent");
    next();
  }

  function next() {
    if (!running) return;
    if (!queue.length) return finish(true);
    const name = queue[0];
    render();
    savePref("scanCurrent", name);
    if (!milkdrop.showForScan(name)) {
      // Not in the package any more (an old cursor): skip it.
      queue.shift();
      return next();
    }
    timer = setTimeout(() => measure(name, []), SETTLE_MS);
  }

  function commitLater() {
    commitTimer = setTimeout(() => {
      milkdrop.commitRatings();
      commitLater();
    }, COMMIT_MS);
  }

  return {
    // Starts, or continues a paused scan. False when one is already running.
    start() {
      if (running) return false;
      running = true;
      measured = 0;
      queue = [];
      total = milkdrop.presetCount;
      milkdrop.scanning = true;
      savedCap = engine.fpsCap;
      engine.setFpsCap(60);
      engine.setSource(feed);
      if (overlay) {
        overlay.style.display = "block";
        overlay.querySelector(".scan-title").textContent = "Scanning presets";
        overlay.querySelector(".scan-detail").textContent = milkdrop.ready ? "" : "Starting MilkDrop…";
        overlay.querySelector(".scan-hint").textContent = "";
      }
      waitReady(0);
      return true;
    },
    // Pauses; the position is kept for next time.
    stop() {
      if (running) finish(false);
    },
    get running() {
      return running;
    },
    // For the menu row.
    describe() {
      const saved = loadPref("scanCursor", null);
      const count = milkdrop.presetCount;
      if (Array.isArray(saved) && saved.length && saved.length < count) return count - saved.length + " of " + count + " done (OK to continue)";
      if (loadPref("scanDone", 0)) return "done: " + milkdrop.validatedCount + " of " + count + " validated (OK to scan again)";
      return "not run (OK to start)";
    },
    status() {
      return running ? total - queue.length + "/" + total + " (" + (queue[0] || "") + ")" : "idle";
    },
  };
}

// Called once at launch, before MilkDrop starts: if a scan was measuring a
// preset when the page last died, that preset is marked as unusable and taken
// off the queue. Returns its name, or "".
export function recoverScan() {
  const name = loadPref("scanCurrent", "");
  if (!name) return "";
  const rated = Object.assign({}, loadPref("rated", {}));
  rated[name] = 0;
  savePref("rated", rated);
  const cursor = loadPref("scanCursor", null);
  if (Array.isArray(cursor)) savePref("scanCursor", cursor.filter((n) => n !== name));
  clearPref("scanCurrent");
  // Whatever Butterchurn was doing is not held against the next start.
  savePref("milkdropPending", false);
  return name;
}
