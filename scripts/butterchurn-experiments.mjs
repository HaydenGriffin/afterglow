// Diagnostic-only Butterchurn patch for the C1 native graphics growth.
// Built only with AFTERGLOW_GL_EXPERIMENTS=1; never part of a release package.
// Frame switches are read live from window.afterglowGL. directCanvas and
// preserveBuffer apply at context creation: set them before starting graphics.
const helpers = `
const agFlag = (k) => { const f = window.afterglowGL; return !!(f && f[k]); };
function agRenderFrame(gl, render) {
  if (agFlag("skipRender")) return null;
  if (!agFlag("glcheck")) return render();
  window.afterglowGL.glcheck = false;
  // This is an intrusive, one-frame probe, never soak telemetry. Finish old
  // GPU work and drain every queued error: clearing just one can blame the
  // first innocent bindTexture of this frame for an earlier operation.
  gl.finish();
  const report = { stale: 0, staleErrors: [], preflightDrained: false, first: null, calls: 0 };
  for (let i = 0; i < 32; i++) {
    const error = gl.getError();
    if (!error) { report.preflightDrained = true; break; }
    if (!report.stale) report.stale = error;
    report.staleErrors.push(error);
  }
  if (!report.preflightDrained) {
    window.afterglowGLError = report;
    return render();
  }
  const originals = {};
  const proto = Object.getPrototypeOf(gl);
  for (const name of Object.getOwnPropertyNames(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (name === "getError" || name === "constructor" || !d || typeof d.value !== "function") continue;
    originals[name] = d.value;
    gl[name] = function () {
      const out = originals[name].apply(gl, arguments);
      report.calls++;
      if (!report.first) {
        const err = originals.getError.call(gl);
        if (err) report.first = { name, err, args: Array.prototype.map.call(arguments, (a) => typeof a === "number" ? a : (a && a.constructor && a.constructor.name) || String(a)), program: originals.getParameter.call(gl, gl.CURRENT_PROGRAM) ? "bound" : "none" };
      }
      return out;
    };
  }
  originals.getError = proto.getError;
  try { return render(); } finally {
    for (const name of Object.keys(originals)) delete gl[name];
    window.afterglowGLError = report;
  }
}
`;

const changes = [
  ['    this.gl = this.internalCanvas.getContext("webgl2", {', '    this.gl = this.internalCanvas.getContext("webgl2", {\n      preserveDrawingBuffer: agFlag("preserveBuffer"),'],
  ['    if (window.OffscreenCanvas) {', '    if (agFlag("directCanvas")) {\n      this.internalCanvas = canvas;\n    } else if (window.OffscreenCanvas) {'],
  ['    this.outputGl = canvas.getContext("2d", { willReadFrequently: false });', '    this.outputGl = agFlag("directCanvas") ? null : canvas.getContext("2d", { willReadFrequently: false });'],
  ["    this.gl.bindTexture(this.gl.TEXTURE_2D, this.prevTexture);\n    this.gl.generateMipmap(this.gl.TEXTURE_2D);\n",
    "    this.gl.bindTexture(this.gl.TEXTURE_2D, this.prevTexture);\n    if (!agFlag(\"noMipsPrev\")) this.gl.generateMipmap(this.gl.TEXTURE_2D);\n"],
  ["    this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurHorizontalTexture);\n    this.gl.generateMipmap(this.gl.TEXTURE_2D);\n",
    "    this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurHorizontalTexture);\n    if (!agFlag(\"noMipsBlur\")) this.gl.generateMipmap(this.gl.TEXTURE_2D);\n"],
  ["    this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurVerticalTexture);\n    this.gl.generateMipmap(this.gl.TEXTURE_2D);\n",
    "    this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurVerticalTexture);\n    if (!agFlag(\"noMipsBlur\")) this.gl.generateMipmap(this.gl.TEXTURE_2D);\n"],
  ["    this.gl.bufferData(this.gl.ARRAY_BUFFER, warpUVs, this.gl.STATIC_DRAW);\n",
    "    if (!(agFlag(\"freezeUploads\") && this.agUvSent)) { this.gl.bufferData(this.gl.ARRAY_BUFFER, warpUVs, this.gl.STATIC_DRAW); this.agUvSent = true; }\n"],
  ["    this.gl.bufferData(this.gl.ARRAY_BUFFER, warpColor, this.gl.STATIC_DRAW);\n",
    "    if (!(agFlag(\"freezeUploads\") && this.agColorSent)) { this.gl.bufferData(this.gl.ARRAY_BUFFER, warpColor, this.gl.STATIC_DRAW); this.agColorSent = true; }\n"],
  ["    this.gl.bufferData(this.gl.ARRAY_BUFFER, compColors, this.gl.STATIC_DRAW);\n",
    "    if (!(agFlag(\"freezeUploads\") && this.agCompSent)) { this.gl.bufferData(this.gl.ARRAY_BUFFER, compColors, this.gl.STATIC_DRAW); this.agCompSent = true; }\n"],
  ["    if (this.outputGl) {\n      this.outputGl.drawImage(this.internalCanvas, 0, 0);",
    "    if (this.outputGl && !agFlag(\"skipCopy\")) {\n      this.outputGl.drawImage(this.internalCanvas, 0, 0);"],
  ["  render(opts) {\n    const renderOutput = this.renderer.render(opts);\n",
    "  render(opts) {\n    window.afterglowVisualizer = this;\n    const renderOutput = agRenderFrame(this.gl, () => this.renderer.render(opts));\n"],
];

export function glExperimentSource(source) {
  for (const [before, after] of changes) {
    if (source.split(before).length !== 2) throw new Error("Butterchurn changed: review the GL experiment patch (" + before.trim() + ")");
    source = source.replace(before, after);
  }
  return helpers + source;
}
