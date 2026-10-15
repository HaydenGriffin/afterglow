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

test("resting (bedtime's black picture) drains the waveform but neither draws nor copies the picture", (t) => {
  let tick, waves = 0, draws = 0, copies = 0;
  const previous = Object.fromEntries(["window", "requestAnimationFrame", "cancelAnimationFrame"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => { for (const [k, d] of Object.entries(previous)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
  globalThis.requestAnimationFrame = fn => { tick = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const engine = createEngine({ canvas: { style: {} }, analysis: { setWave() {} }, source: { wave() { waves++; return new Uint8Array(2); } } });
  engine.setRenderer({ create: () => ({ draw() { draws++; } }) });
  engine.onAfterRender(() => copies++);
  engine.start(); tick(34);
  engine.setResting(true); tick(68); tick(102);
  assert.deepEqual({ waves, draws, copies }, { waves: 3, draws: 1, copies: 1 });
  engine.setResting(false); tick(136);
  assert.deepEqual({ draws, copies }, { draws: 2, copies: 2 });
  engine.stop();
});
