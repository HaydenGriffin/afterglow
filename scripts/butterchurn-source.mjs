// A guarded compatibility patch for the pinned Music Assistant Butterchurn.
// Keep the installed dependency untouched; build from the returned source.
export function gpuTimingSource(source) {
  const changes = [
    ["class GpuTimer {\n  constructor(gl) {", "class GpuTimer {\n  constructor(gl, enabled = false) {"],
    ['this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");', 'this.ext = enabled ? gl.getExtension("EXT_disjoint_timer_query_webgl2") : null;'],
    ["this.gpuTimer = new GpuTimer(gl);", "this.gpuTimer = new GpuTimer(gl, opts.gpuTiming === true);"],
  ];
  for (const [before, after] of changes) {
    if (source.split(before).length !== 2) throw new Error("Butterchurn changed: review the GPU timing patch (" + before + ")");
    source = source.replace(before, after);
  }
  return source;
}

