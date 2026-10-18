import test from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.js";

test("render telemetry distinguishes expensive draws from frame gaps and excludes time stopped", (t) => {
  let tick;
  let time = 0;
  let cost = 5;
  let wave = new Float32Array(2);
  t.mock.method(globalThis.performance, "now", () => time);
  const previous = Object.fromEntries(["window", "requestAnimationFrame", "cancelAnimationFrame"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => { for (const [k, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } });
  globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
  globalThis.requestAnimationFrame = fn => { tick = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const canvas = { style: {} };
  const engine = createEngine({ canvas, analysis: { setWave() {} }, source: { wave: () => wave } });
  engine.setRenderer({ create: () => ({ draw: () => { time += cost; } }) });
  engine.setFpsCap(30);
  engine.start();
  const frame = now => { time = now; tick(now); };
  frame(34); frame(50); // capped callback is not a rendered frame
  cost = 60; frame(68); frame(200);
  assert.deepEqual(engine.metrics, { frames: 3, averageMs: 125 / 3, maxMs: 60, over50Ms: 2, maxFrameGapMs: 132, frameGapsOver100Ms: 1 });
  wave = null; frame(234);
  assert.equal(engine.metrics.frames, 3);
  assert.equal(canvas.style.visibility, "hidden");
  engine.stop(); time = 10000; engine.start(); frame(10034);
  assert.equal(engine.metrics.maxFrameGapMs, 132);
});

test("artwork mode drains the waveform without analysis or GPU draws, and resumes without restarting audio", (t) => {
  let tick, waves = 0, analyses = 0, draws = 0;
  const previous = Object.fromEntries(["window", "requestAnimationFrame", "cancelAnimationFrame"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => { for (const [k,d] of Object.entries(previous)) { if(d) Object.defineProperty(globalThis,k,d); else delete globalThis[k]; } });
  globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
  globalThis.requestAnimationFrame = fn => { tick=fn; return 1; }; globalThis.cancelAnimationFrame=()=>{};
  const canvas={style:{}};
  const engine=createEngine({canvas,analysis:{setWave(){analyses++;}},source:{wave(){waves++;return new Uint8Array(2);}}});
  engine.setRenderer({create:()=>({draw(){draws++;}})});engine.start();tick(34);
  engine.setDrawing(false);tick(68);tick(102);
  assert.equal(waves,3);assert.equal(analyses,1);assert.equal(draws,1);assert.equal(canvas.style.display,'none');
  engine.setDrawing(true);tick(136);assert.equal(draws,2);assert.equal(canvas.style.display,'');engine.stop();
});

test("resting (visual style Off) stops animation frames; a slow tick keeps idle current; a scan runs the loop", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let tick = null, requested = 0, cancelled = 0, waves = 0, draws = 0, wave = new Uint8Array(2);
  const previous = Object.fromEntries(["window", "requestAnimationFrame", "cancelAnimationFrame"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => { for (const [k, d] of Object.entries(previous)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
  globalThis.requestAnimationFrame = fn => { tick = fn; return ++requested; };
  globalThis.cancelAnimationFrame = id => { if (id) cancelled++; };
  const canvas = { style: {} }, idles = [];
  const engine = createEngine({ canvas, analysis: { setWave() {} }, source: { wave() { waves++; return wave; } } });
  engine.setRenderer({ create: () => ({ draw() { draws++; } }) });
  engine.onIdleChange(on => idles.push(on));
  engine.setResting(true); engine.setDrawing(false);
  engine.start();
  assert.equal(requested, 0, "a start while resting asks for no animation frame");
  assert.equal(engine.resting, true);
  t.mock.timers.tick(1000);
  assert.equal(waves, 4, "four waveform reads a second, no more");
  assert.equal(draws, 0);
  wave = null; t.mock.timers.tick(250);
  assert.deepEqual(idles, [true], "nothing playing is still noticed");
  assert.equal(canvas.style.display, "none");

  // A preset scan runs the loop and draws, whatever the view wants.
  wave = new Uint8Array(2);
  engine.setScanning(true);
  assert.equal(requested, 1); assert.equal(canvas.style.display, ""); assert.equal(engine.drawing, true); assert.equal(engine.resting, false);
  const before = waves; t.mock.timers.tick(1000);
  assert.equal(waves, before, "the rest tick stopped");
  tick(34); tick(68);
  assert.equal(draws, 2);
  engine.setScanning(false);
  assert.equal(cancelled, 1, "back to resting: the pending frame is cancelled");
  assert.equal(canvas.style.display, "none");
  assert.equal(requested, 3, "only the frames the scan used were asked for");

  // MilkDrop again: the loop resumes; stopping ends both loops.
  engine.setResting(false);
  assert.equal(requested, 4); assert.equal(engine.resting, false);
  engine.setResting(true);
  engine.stop();
  const stopped = waves; t.mock.timers.tick(5000);
  assert.equal(waves, stopped, "no ticks while stopped");
  engine.start();
  t.mock.timers.tick(250);
  assert.equal(waves, stopped + 1);
  engine.stop();
});
