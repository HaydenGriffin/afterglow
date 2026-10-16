// The song's cover inside the presets that sample a picture (worms, cells, a
// sky...). None of those pictures is shipped, so Butterchurn draws its clouds
// for them; with "Cover art in the visuals" on they get the cover instead.
//
// One 512 x 512 texture and one 2D canvas of that size serve the whole page:
// a new cover is drawn into the canvas and copied into the same texture, never
// a texture per song (the C1's web runtime is known to grow with GL objects).
// A change fades from the old picture to the new, once the artwork has
// arrived and the colours have stopped changing, at most once every 4 s. The
// PS5 app does the same with the same numbers (cover_texture.cpp).

export const COVER_SIZE = 512;
const SETTLE_MS = 1000;
const GAP_MS = 4000;
const FADE_MS = 2000;
const UPLOAD_MS = 66; // a fade is uploaded about 15 times a second

// Which picture to show and when. Keys: a cover's URL, or "" for the clouds.
export function createCoverSchedule({ settleMs = SETTLE_MS, gapMs = GAP_MS, fadeMs = FADE_MS } = {}) {
  let target = "";
  let shown = "";
  let changedAt = -Infinity;
  let startedAt = -Infinity;
  return {
    want(key, now) {
      if (key === target) return;
      target = key;
      changedAt = now;
    },
    // The colours changed: the picture waits until they settle too.
    touch(now) {
      if (target !== shown) changedAt = now;
    },
    // {from, to} when a fade starts now, else null.
    tick(now) {
      if (target === shown || now - changedAt < settleMs || now - startedAt < gapMs) return null;
      const from = shown;
      shown = target;
      startedAt = now;
      return { from, to: shown };
    },
    // How far the current fade has come, 0 to 1.
    level(now) {
      return Math.max(0, Math.min(1, (now - startedAt) / fadeMs));
    },
    get shown() {
      return shown;
    },
  };
}

// The square from the middle of a w x h picture: [sx, sy, side].
export function centreSquare(w, h) {
  const side = Math.min(w, h);
  return [(w - side) / 2, (h - side) / 2, side];
}

// The texture and its canvas, made once. `clouds` is Butterchurn's own
// clouds image (drawn when there is no cover); `gl` is Butterchurn's context.
export function createCoverTexture(gl, clouds) {
  let canvas = document.createElement("canvas");
  canvas.width = canvas.height = COVER_SIZE;
  let ctx = canvas.getContext("2d");
  let texture = gl.createTexture();
  let uploadedAt = -Infinity;
  withTexture(() => {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COVER_SIZE, COVER_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  });

  // Butterchurn binds every texture it samples before each draw, but the
  // binding is put back anyway rather than relied on.
  function withTexture(fn) {
    const before = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      fn();
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, before);
    }
  }

  function paint(image, alpha) {
    ctx.globalAlpha = alpha;
    if (image) {
      const [sx, sy, side] = centreSquare(image.naturalWidth || image.width, image.naturalHeight || image.height);
      ctx.drawImage(image, sx, sy, side, side, 0, 0, COVER_SIZE, COVER_SIZE);
    } else if (clouds && clouds.complete && clouds.naturalWidth) {
      ctx.drawImage(clouds, 0, 0, COVER_SIZE, COVER_SIZE);
    } else {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, COVER_SIZE, COVER_SIZE);
    }
  }

  return {
    get texture() {
      return texture;
    },
    // The picture `level` of the way from `from` to `to` (images, or null for
    // the clouds), uploaded at most ~15 times a second and always at the end.
    // Returns false if the picture could not be used (a refused image).
    blend(from, to, level, now) {
      if (!texture || (level < 1 && now - uploadedAt < UPLOAD_MS)) return true;
      uploadedAt = now;
      try {
        paint(from, 1);
        if (level > 0) paint(to, level);
        withTexture(() => {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
          gl.generateMipmap(gl.TEXTURE_2D);
        });
        return true;
      } catch (e) {
        // A refused image leaves the canvas unusable: start a clean one.
        canvas.width = 0;
        canvas = document.createElement("canvas");
        canvas.width = canvas.height = COVER_SIZE;
        ctx = canvas.getContext("2d");
        return false;
      }
    },
    release() {
      if (texture) gl.deleteTexture(texture);
      texture = null;
      canvas.width = canvas.height = 0;
    },
  };
}

// Hands the cover texture to Butterchurn for every picture a preset asks for
// that it does not draw itself (its own clouds included). Once made, the
// texture holds the clouds whenever there is no cover, so it stays in use.
export function installCover(image, cover) {
  const own = image.getTexture.bind(image);
  image.getTexture = (sampler) => (cover.texture && (sampler === "clouds2" || !image.samplers[sampler]) ? cover.texture : own(sampler));
}
