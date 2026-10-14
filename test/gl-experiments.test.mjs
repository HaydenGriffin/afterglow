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
  getError() { const e = this.pending; this.pending = 0; return e; }
  getParameter() { return {}; }
  bindTexture() {}
  useProgram() { this.pending = 1282; }
  get canvas() { throw new TypeError("Illegal invocation"); }
}

test("every experiment anchors exactly once in the pinned Butterchurn", () => {
  for (const flag of ["noMipsPrev", "noMipsBlur", "freezeUploads"]) assert.ok(patched.includes(`agFlag("${flag}")`));
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
