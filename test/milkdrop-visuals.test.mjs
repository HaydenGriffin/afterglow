import assert from "node:assert/strict";
import { test } from "node:test";

// MilkDrop on a fake Butterchurn and a fake GL that counts what it is asked
// for: the preset history, the song and moment changes, and the cover texture.
function page(presetNames) {
  const calls = { createTexture: 0, deleteTexture: 0, texImage2D: 0, texSubImage2D: 0 };
  const gl = {
    TEXTURE_2D: 1, TEXTURE_BINDING_2D: 2, RGBA: 3, UNSIGNED_BYTE: 4,
    createTexture: () => ({ id: ++calls.createTexture }),
    deleteTexture: () => calls.deleteTexture++,
    bindTexture() {}, texParameteri() {}, generateMipmap() {},
    texImage2D: () => calls.texImage2D++,
    texSubImage2D: () => calls.texSubImage2D++,
    getParameter: () => null,
    getExtension: () => null,
  };
  const clouds2 = { clouds: true };
  const image = { samplers: { clouds2 }, clouds2Image: { complete: true, naturalWidth: 128 }, getTexture(name) { return this.samplers[name] || this.samplers.clouds2; } };
  const loaded = [];
  const visualizer = { gl, renderer: { image }, internalCanvas: { addEventListener() {} }, render() {}, loadPreset(preset) { loaded.push(preset.name); }, setRendererSize() {} };
  const presets = {};
  for (const name of presetNames) presets[name] = { name };
  globalThis.window = { butterchurn: { createVisualizer: () => visualizer }, afterglowPresets: presets };
  const canvas2d = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, fillRect() {} }) });
  globalThis.document = { createElement: (tag) => (tag === "canvas" ? canvas2d() : {}), head: { appendChild: (tag) => setTimeout(tag.onload, 0) } };
  globalThis.Image = class { set src(url) { this.url = url; setTimeout(() => this.onload && this.onload(), 0); } };
  globalThis.localStorage = undefined;
  return { calls, image, clouds2, loaded, visualizer };
}

const { createMilkdropMode } = await import("../src/milkdrop.js");

async function started(mode) {
  let t = 1000;
  const renderer = mode.create({ canvas: { width: 960, height: 540 } });
  const quiet = new Uint8Array(1024).fill(128);
  const draw = (seconds = 1 / 30, wave = quiet) => {
    t += seconds * 1000;
    renderer.draw({ analysis: { wave, raw: wave }, dt: seconds, t: t / 1000 });
  };
  draw();
  await new Promise((r) => setTimeout(r, 5));
  return { draw, now: () => t };
}

test("in shuffled order Previous goes back to the presets shown, Next forward again", async () => {
  const { loaded } = page(["a", "b", "c", "d", "e", "f"]);
  const mode = createMilkdropMode(() => {}, () => {});
  mode.randomOrder = true;
  mode.list = "all";
  await started(mode);
  mode.step(1);
  mode.step(1);
  mode.step(1);
  const shown = loaded.slice();
  assert.equal(shown.length, 4);
  mode.step(-1);
  mode.step(-1);
  assert.deepEqual(loaded.slice(4), [shown[2], shown[1]], "back through what was shown");
  mode.step(1);
  assert.equal(loaded[loaded.length - 1], shown[2], "Next walks forward again");
  mode.step(1);
  assert.equal(loaded[loaded.length - 1], shown[3]);
});

test("a cover fills one texture, handed to every picture a preset asks for", async () => {
  const { calls, image, clouds2 } = page(["a", "b"]);
  const mode = createMilkdropMode(() => {}, () => {});
  const { draw } = await started(mode);
  assert.equal(image.getTexture("worms"), clouds2, "Butterchurn's clouds until a cover arrives");
  mode.setSong("q1", "http://ma.example/imageproxy/1?size=512");
  await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < 30 * 4; i++) draw();
  const texture = image.getTexture("worms");
  assert.notEqual(texture, clouds2);
  assert.equal(image.getTexture("clouds2"), texture, "Butterchurn's own clouds image too");
  assert.equal(calls.createTexture, 1);
  const uploads = calls.texSubImage2D;
  assert.ok(uploads >= 2 && uploads <= 40, "a fade is a bounded number of uploads, not one per frame: " + uploads);
  mode.setSong("q2", "http://ma.example/imageproxy/2?size=512");
  await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < 30 * 6; i++) draw();
  assert.equal(calls.createTexture, 1, "the same texture for the next song");
  assert.equal(calls.texImage2D, 1, "allocated once");
  assert.ok(calls.texSubImage2D > uploads);
  for (let i = 0; i < 30 * 6; i++) draw();
  const settled = calls.texSubImage2D;
  for (let i = 0; i < 30 * 6; i++) draw();
  assert.equal(calls.texSubImage2D, settled, "nothing is uploaded once the fade is done");
  mode.release();
  assert.equal(calls.deleteTexture, 1);
});

test("Each song changes the preset after the song has settled", async () => {
  const { loaded } = page(["a", "b", "c", "d"]);
  const mode = createMilkdropMode(() => {}, () => {});
  mode.change = "song";
  mode.list = "all";
  const { draw } = await started(mode);
  mode.setSong("q1", "");
  for (let i = 0; i < 30 * 12; i++) draw();
  assert.equal(loaded.length, 1, "the first song keeps the preset");
  mode.setSong("q2", "");
  for (let i = 0; i < 30; i++) draw();
  assert.equal(loaded.length, 1, "not before 2 s");
  for (let i = 0; i < 40; i++) draw();
  assert.equal(loaded.length, 2);
  for (let i = 0; i < 30 * 200; i += 30) draw(1);
  assert.equal(loaded.length, 2, "no timer in Each song");
});
