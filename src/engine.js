// Render loop. Drives one renderer (MilkDrop) on a WebGL canvas: paces frames
// to the cap, blanks the picture while nothing plays, and keeps a frame-rate
// figure for the readout and the preset scan.
//
// A renderer is { scale, create({canvas}) -> { draw(frame) } }; `scale` is its
// render size relative to the window.
//
// Resting (visual style Off) stops the animation-frame loop altogether: a
// slow tick only reads the waveform, which keeps "is anything playing" current
// and drains the feed. A preset scan always runs the loop and draws.

const FPS_WINDOW_MS = 1000;
const DEFAULT_SCALE = 0.5;
const REST_TICK_MS = 250;

export function createEngine({ canvas, analysis, source }) {
  const afterRender = [];
  const idleListeners = [];
  let feed = source;
  let idle = false;
  let instance = null;
  let raf = 0;
  let running = false;
  let drawing = true;
  let resting = false;
  let scanning = false;
  let restTimer = 0;
  let lastFrameMs = 0;
  let fpsCap = 60;
  let fps = 0;
  let fpsFrames = 0;
  let fpsSince = 0;
  let renderCount = 0;
  let renderTotalMs = 0;
  let renderMaxMs = 0;
  let renderOver50Ms = 0;
  let maxFrameGapMs = 0;
  let frameGapsOver100Ms = 0;

  const draws = () => drawing || scanning;
  const rests = () => resting && !scanning;

  // Nothing is playing: blank the picture once and wait.
  function noteWave(wave) {
    if ((wave === null) === idle) return;
    idle = wave === null;
    canvas.style.visibility = idle ? "hidden" : "visible";
    for (const fn of idleListeners) fn(idle);
  }

  function restTick() {
    noteWave(feed.wave(performance.now()));
  }

  // The loop that suits the moment: animation frames, the rest tick, or neither.
  function schedule() {
    if (running && rests()) {
      cancelAnimationFrame(raf);
      raf = 0;
      fps = 0;
      if (!restTimer) restTimer = setInterval(restTick, REST_TICK_MS);
      return;
    }
    clearInterval(restTimer);
    restTimer = 0;
    if (running && !raf) {
      lastFrameMs = 0;
      fpsSince = performance.now();
      fpsFrames = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function applyCanvas() {
    canvas.style.display = draws() ? "" : "none";
  }

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    const minInterval = 1000 / fpsCap - 2;
    if (nowMs - lastFrameMs < minInterval) return;
    if (lastFrameMs) {
      const gap = nowMs - lastFrameMs;
      maxFrameGapMs = Math.max(maxFrameGapMs, gap);
      if (gap > 100) frameGapsOver100Ms++;
    }
    const dt = lastFrameMs ? Math.min((nowMs - lastFrameMs) / 1000, 0.25) : 1 / 60;
    lastFrameMs = nowMs;

    if (nowMs - fpsSince >= FPS_WINDOW_MS) {
      fps = Math.round((fpsFrames * 1000) / (nowMs - fpsSince));
      fpsFrames = 0;
      fpsSince = nowMs;
    }
    fpsFrames++;

    const wave = feed.wave(nowMs);
    noteWave(wave);
    if (wave !== null) {
      const drawNow = draws();
      if (drawNow) analysis.setWave(wave, dt);
      if (instance && drawNow) {
        const began = performance.now();
        instance.draw({ t: nowMs / 1000, dt, analysis });
        const cost = performance.now() - began;
        renderCount++;
        renderTotalMs += cost;
        renderMaxMs = Math.max(renderMaxMs, cost);
        if (cost > 50) renderOver50Ms++;
      }
    }
    for (const fn of afterRender) fn(canvas);
  }

  return {
    setDrawing(on) { drawing = !!on; applyCanvas(); },
    get drawing() { return draws(); },
    // Visual style Off: no animation frames, only the slow waveform tick.
    setResting(on) { resting = !!on; schedule(); },
    get resting() { return running && rests(); },
    // A preset scan draws and runs the loop whatever the view wants.
    setScanning(on) { scanning = !!on; applyCanvas(); schedule(); },
    setRenderer(renderer) {
      const scale = renderer.scale || DEFAULT_SCALE;
      const w = Math.round(window.innerWidth * scale);
      const h = Math.round(window.innerHeight * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      instance = renderer.create({ canvas });
    },
    // Where the waveform comes from; swapped by the preset scan so it can run
    // on a synthetic signal while nothing plays.
    setSource(next) {
      feed = next;
    },
    start() {
      if (running) return;
      running = true;
      schedule();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      clearInterval(restTimer);
      restTimer = 0;
    },
    setFpsCap(cap) {
      fpsCap = cap;
    },
    onAfterRender(fn) {
      afterRender.push(fn);
    },
    onIdleChange(fn) {
      idleListeners.push(fn);
    },
    get idle() {
      return idle;
    },
    get running() {
      return running;
    },
    get fps() {
      return fps;
    },
    get fpsCap() {
      return fpsCap;
    },
    get metrics() {
      return { frames: renderCount, averageMs: renderCount ? renderTotalMs / renderCount : 0,
        maxMs: renderMaxMs, over50Ms: renderOver50Ms, maxFrameGapMs, frameGapsOver100Ms };
    },
  };
}
