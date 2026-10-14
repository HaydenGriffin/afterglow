import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { glExperimentSource } from "../scripts/butterchurn-experiments.mjs";

const upstream = readFileSync(new URL("../node_modules/butterchurn/dist/butterchurn.js", import.meta.url), "utf8");
const patched = glExperimentSource(upstream);

function frame(flags) {
  const helpers = patched.slice(0, patched.indexOf("function agRenderFrame"));
  const body = patched.slice(patched.indexOf("function agRenderFrame"), patched.indexOf("\n}\n", patched.indexOf("function agRenderFrame")) + 3);
  const ctx = { window: { afterglowGL: flags } };
  vm.runInNewContext(helpers + body + "\nglobalThis.run = agRenderFrame;", ctx);
  return ctx;
}

class FakeGL {
  constructor() { this.pending = 0; this.CURRENT_PROGRAM = 1; }
  getError() { if (this.stuck) return 1282; if (this.old && this.old.length) return this.old.shift(); const e = this.pending; this.pending = 0; return e; }
  finish() { this.finished = (this.finished || 0) + 1; }
  getParameter() { return {}; }
  bindTexture() {}
  useProgram() { this.pending = 1282; }
  get canvas() { throw new TypeError("Illegal invocation"); }
}

test("every experiment anchors exactly once in the pinned Butterchurn", () => {
  for (const flag of ["noMipsPrev", "noMipsBlur", "freezeUploads", "skipCopy"]) assert.ok(patched.includes(`agFlag("${flag}")`));
  assert.equal(patched.split("agRenderFrame(this.gl").length, 2);
  assert.throws(() => glExperimentSource(upstream.replace("this.prevTexture);\n    this.gl.generateMipmap", "x")), /Butterchurn changed/);
});

test("no switches set renders normally", () => {
  const ctx = frame(undefined);
  assert.equal(ctx.run(new FakeGL(), () => "drawn"), "drawn");
});

test("skipRender keeps the loop but draws nothing", () => {
  const ctx = frame({ skipRender: true });
  let drawn = false;
  assert.equal(ctx.run(new FakeGL(), () => { drawn = true; }), null);
  assert.equal(drawn, false);
});

test("glcheck records the first failing call for one frame, then unwraps", () => {
  const ctx = frame({ glcheck: true });
  const gl = new FakeGL();
  gl.pending = 1280;
  ctx.run(gl, () => { gl.bindTexture(3553, null); gl.useProgram({}); gl.bindTexture(3553, null); });
  const report = ctx.window.afterglowGLError;
  assert.equal(report.stale, 1280);
  assert.equal(report.first.name, "useProgram");
  assert.equal(report.first.err, 1282);
  assert.equal(report.calls, 3);
  assert.equal(ctx.window.afterglowGL.glcheck, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(gl, "useProgram"));
});

for (const [skipRender, skipCopy] of [[false, false], [true, false], [false, true], [true, true]]) {
  test(`render/copy isolation: draw skipped=${skipRender}, copy skipped=${skipCopy}`, () => {
    const start = patched.indexOf('  render(opts) {\n    window.afterglowVisualizer');
    const end = patched.indexOf('\n  getGpuTimings()', start);
    const ctx = frame({ skipRender, skipCopy });
    vm.runInNewContext('globalThis.Visualizer = class {' + patched.slice(start, end) + '}', ctx);
    const v = new ctx.Visualizer();
    let draws = 0, copies = 0;
    v.renderer = { render() { draws++; return 42; } };
    v.gl = new FakeGL();
    v.outputGl = { drawImage() { copies++; } };
    assert.equal(v.render({}), skipRender ? null : 42);
    assert.equal(draws, skipRender ? 0 : 1);
    assert.equal(copies, skipCopy ? 0 : 1);
    assert.equal(ctx.window.afterglowVisualizer, v);
  });
}

test("direct-canvas diagnostic draws on the supplied canvas without a 2D context", () => {
  const start = patched.indexOf('    const vizWidth = opts.width || 1200;');
  const end = patched.indexOf('\n    this.baseValsDefaults =', start);
  for (const directCanvas of [false, true]) {
    const requests = [];
    const supplied = { getContext(type, attrs) { requests.push(['supplied', type]); return { type, attrs }; } };
    const internal = { getContext(type, attrs) { requests.push(['internal', type]); return { type, attrs }; } };
    const ctx = frame({ directCanvas, preserveBuffer: true });
    ctx.document = { createElement() { return internal; } };
    vm.runInNewContext('globalThis.make = function(canvas,opts){' + patched.slice(start, end) + '}', ctx);
    const v = {};
    ctx.make.call(v, supplied, { width: 960, height: 540 });
    assert.equal(v.internalCanvas, directCanvas ? supplied : internal);
    assert.deepEqual(requests, directCanvas ? [['supplied', 'webgl2']] : [['internal', 'webgl2'], ['supplied', '2d']]);
    assert.equal(v.outputGl === null, directCanvas);
    assert.equal(v.gl.attrs.preserveDrawingBuffer, true);
  }
});

test("GL probe drains queued old errors before attributing a new frame's first error", () => {
  const ctx = frame({ glcheck: true });
  const gl = new FakeGL();
  gl.old = [1280, 1282];
  ctx.run(gl, () => { gl.bindTexture(3553, null); gl.useProgram({}); });
  const report = ctx.window.afterglowGLError;
  assert.equal(report.first.name, "useProgram");
  assert.deepEqual(Array.from(report.staleErrors), [1280, 1282]);
  assert.equal(report.preflightDrained, true);
  assert.equal(gl.finished, 1);
});

test("a GL probe that cannot drain old errors reports uncertainty and still renders", () => {
  const ctx = frame({ glcheck: true });
  const gl = new FakeGL();
  gl.stuck = true;
  let frames = 0;
  ctx.run(gl, () => frames++);
  const report = ctx.window.afterglowGLError;
  assert.equal(report.preflightDrained, false);
  assert.equal(report.first, null);
  assert.equal(report.staleErrors.length, 32);
  assert.equal(frames, 1);
});
