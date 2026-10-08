// Render loop. Drives one renderer (MilkDrop) on a WebGL canvas: paces frames
// to the cap, blanks the picture while nothing plays, and keeps a frame-rate
// figure for the readout and the preset scan.
//
// A renderer is { scale, create({canvas}) -> { draw(frame) } }; `scale` is its
// render size relative to the window.

const FPS_WINDOW_MS = 1000;
const DEFAULT_SCALE = 0.5;

export function createEngine({ canvas, analysis, source }) {
  const afterRender = [];
  const idleListeners = [];
  let feed = source;
  let idle = false;
  let instance = null;
  let raf = 0;
  let running = false;
  let lastFrameMs = 0;
  let fpsCap = 60;
  let fps = 0;
  let fpsFrames = 0;
  let fpsSince = 0;

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    const minInterval = 1000 / fpsCap - 2;
    if (nowMs - lastFrameMs < minInterval) return;
    const dt = lastFrameMs ? Math.min((nowMs - lastFrameMs) / 1000, 0.25) : 1 / 60;
    lastFrameMs = nowMs;

    if (nowMs - fpsSince >= FPS_WINDOW_MS) {
      fps = Math.round((fpsFrames * 1000) / (nowMs - fpsSince));
      fpsFrames = 0;
      fpsSince = nowMs;
    }
    fpsFrames++;

    const wave = feed.wave(nowMs);
    if (wave === null) {
      // Nothing is playing: blank the picture once and wait.
      if (!idle) {
        idle = true;
        canvas.style.visibility = "hidden";
        for (const fn of idleListeners) fn(true);
      }
    } else {
      if (idle) {
        idle = false;
        canvas.style.visibility = "visible";
        for (const fn of idleListeners) fn(false);
      }
      analysis.setWave(wave, dt);
      if (instance) instance.draw({ t: nowMs / 1000, dt, analysis });
    }
    for (const fn of afterRender) fn(canvas);
  }

  return {
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
      lastFrameMs = 0;
      fpsSince = performance.now();
      fpsFrames = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
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
  };
}
