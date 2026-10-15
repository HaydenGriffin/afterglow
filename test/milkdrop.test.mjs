import assert from "node:assert/strict";
import { test } from "node:test";

// A page just big enough for MilkDrop to start: scripts "load" at once and
// Butterchurn is a fake whose GL context can be lost and restored.
class FakeCanvas {
  constructor() {
    this.width = 960;
    this.height = 540;
    this.listeners = {};
  }
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  emit(name) {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    this.listeners[name](event);
    return event;
  }
}

function page() {
  const internal = new FakeCanvas();
  const gl = {
    lost: 0,
    getExtension: (name) => (name === "WEBGL_lose_context" ? { loseContext: () => { gl.lost++; internal.emit("webglcontextlost"); } } : null),
  };
  const visualizer = { gl, internalCanvas: internal, rendered: 0, render() { this.rendered++; }, loadPreset() {}, setRendererSize() {} };
  globalThis.window = { butterchurn: { createVisualizer: () => visualizer }, afterglowPresets: { a: {}, b: {} } };
  globalThis.document = { createElement: () => ({}), head: { appendChild: (tag) => setTimeout(tag.onload, 0) } };
  return { gl, internal, visualizer };
}

async function started(mode, canvas) {
  const renderer = mode.create({ canvas });
  const frame = { analysis: { wave: new Uint8Array(4) }, dt: 1 / 30 };
  renderer.draw(frame);
  await new Promise((r) => setTimeout(r, 5));
  renderer.draw(frame);
  return () => renderer.draw(frame);
}

const { createMilkdropMode } = await import("../src/milkdrop.js");

test("release loses the GL context on purpose, shrinks both canvases and draws no more", async () => {
  const { gl, internal, visualizer } = page();
  const failures = [];
  const mode = createMilkdropMode((reason) => failures.push(reason), () => {});
  const canvas = new FakeCanvas();
  const draw = await started(mode, canvas);
  assert.equal(visualizer.rendered, 1);
  mode.release();
  assert.equal(gl.lost, 1);
  assert.deepEqual([internal.width, internal.height, canvas.width, canvas.height], [0, 0, 0, 0]);
  assert.deepEqual(failures, [], "a release is not a failure");
  draw();
  assert.equal(visualizer.rendered, 1);
  mode.release(); // twice is harmless
  assert.equal(gl.lost, 1);
});

test("release before MilkDrop ever started only shrinks the canvas", () => {
  page();
  const mode = createMilkdropMode(() => {}, () => {});
  const canvas = new FakeCanvas();
  mode.create({ canvas });
  mode.release();
  assert.deepEqual([canvas.width, canvas.height], [0, 0]);
});

test("a lost context stops MilkDrop; its restoration is reported so the page can start afresh", async () => {
  const { internal } = page();
  const failures = [];
  let restored = 0;
  const mode = createMilkdropMode((reason) => failures.push(reason), () => {});
  mode.onRestored(() => restored++);
  await started(mode, new FakeCanvas());
  assert.equal(internal.emit("webglcontextlost").prevented, true, "restoration is asked for");
  assert.deepEqual(failures, ["graphics context lost"]);
  internal.emit("webglcontextrestored");
  assert.equal(restored, 1);
});

