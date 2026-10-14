// Diagnostic-only Butterchurn patch for the C1 native graphics growth.
// Built only with AFTERGLOW_GL_EXPERIMENTS=1; never part of a release package.
// Each experiment is read live from window.afterglowGL, so the inspector can
// switch it on and off without reloading the page.
const helpers = `
const agFlag = (k) => { const f = window.afterglowGL; return !!(f && f[k]); };
function agRenderFrame(gl, render) {
  if (agFlag("skipRender")) return null;
  if (!agFlag("glcheck")) return render();
  window.afterglowGL.glcheck = false;
  const report = { stale: gl.getError(), first: null, calls: 0 };
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
  ["  render(opts) {\n    const renderOutput = this.renderer.render(opts);\n",
    "  render(opts) {\n    const renderOutput = agRenderFrame(this.gl, () => this.renderer.render(opts));\n"],
];

export function glExperimentSource(source) {
  for (const [before, after] of changes) {
    if (source.split(before).length !== 2) throw new Error("Butterchurn changed: review the GL experiment patch (" + before.trim() + ")");
    source = source.replace(before, after);
  }
  return helpers + source;
}
