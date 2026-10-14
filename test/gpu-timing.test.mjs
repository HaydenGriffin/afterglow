import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { gpuTimingSource } from "../scripts/butterchurn-source.mjs";

const upstream = readFileSync(new URL("../node_modules/butterchurn/dist/butterchurn.js", import.meta.url), "utf8");
function timer(enabled) {
  const source = gpuTimingSource(upstream);
  const start = source.indexOf("class GpuTimer {");
  const end = source.indexOf("// blended frame values", start);
  assert.ok(start >= 0 && end > start);
  const ctx = {};
  vm.runInNewContext(source.slice(start, end) + "\nglobalThis.Timer = GpuTimer;", ctx);
  const calls = { extensions: 0, created: 0, deleted: 0 };
  const gl = {
    getExtension() { calls.extensions++; return { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }; },
    createQuery() { calls.created++; return {}; },
    deleteQuery() { calls.deleted++; },
    beginQuery() {}, endQuery() {}, getQueryParameter() { return true; }, getParameter() { return false; },
  };
  return { value: new ctx.Timer(gl, enabled), calls };
}

test("normal playback does not allocate unused GPU profiling queries", () => {
  const { value, calls } = timer();
  for (let f = 0; f < 300; f++) {
    for (const section of ["warp", "blur", "comp"]) value.section(section);
    value.frameEnd();
  }
  assert.deepEqual(calls, { extensions: 0, created: 0, deleted: 0 });
  assert.equal(value.timings(), null);
});

test("an explicit profiling run can still enable queries and releases completed queries", () => {
  const { value, calls } = timer(true);
  for (let f = 0; f < 3; f++) {
    value.section("warp"); value.section("comp"); value.frameEnd();
  }
  assert.deepEqual(calls, { extensions: 1, created: 6, deleted: 6 });
  assert.equal(value.pending.length, 0);
  assert.ok(value.timings());
});

test("dependency drift refuses the GPU timing patch", () => {
  assert.throws(() => gpuTimingSource(upstream.replace("new GpuTimer(gl)", "new GpuTimer(gl, true)")), /Butterchurn changed/);
});
