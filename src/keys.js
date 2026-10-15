// Remote control input. webOS does not move focus on arrow keys by itself, so
// every key is handled here by keyCode. While a text field has focus (the
// sign-in form) keys are left to it, except Back, which leaves the field.

const NAMES = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  13: "ok",
  415: "play",
  19: "pause",
  179: "playpause",
  413: "stop",
  417: "fastforward",
  412: "rewind",
  32: "playpause",
  461: "back",
  27: "back",
  8: "back",
  403: "red",
  404: "green",
  405: "yellow",
  406: "blue",
  // Keyboard stand-ins for the colour keys, for the page in a browser.
  70: "yellow", // F: favorite
  76: "blue", // L: list
  82: "red", // R: trim earlier
  71: "green", // G: trim later
};

// Media keys some remotes (and injected keys) send by name only.
const MEDIA_KEYS = { MediaPlayPause: "playpause", MediaPlay: "play", MediaPause: "pause", MediaStop: "stop", MediaTrackNext: "fastforward", MediaTrackPrevious: "rewind", MediaFastForward: "fastforward", MediaRewind: "rewind" };

export function keyName(event) {
  if (event.key === "GoBack") return "back";
  if (MEDIA_KEYS[event.key]) return MEDIA_KEYS[event.key];
  return NAMES[event.keyCode] || "";
}

export function isTyping(target) {
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
}

export function installKeys(handler) {
  window.addEventListener("keydown", (event) => {
    const name = keyName(event);
    if (!name) return;
    if (isTyping(event.target)) return; // login.js handles Enter and Back on its inputs
    event.preventDefault();
    handler(name);
  });
}

export function exitApp() {
  const system = window.webOSSystem || window.PalmSystem;
  if (system && typeof system.platformBack === "function") system.platformBack();
  else window.close();
}

const SEEK_SECONDS = 10;
const DIM_STEP = 10; // percent
const TRIM_STEP_MS = 25;

// What a key does on the main screen (no menu or panel open), as data:
// { do, by? } or null. ctx: { mode (playback.js VIEW_MODES), visualsShown
// (MilkDrop is on screen), milkdropReady, milkdropOn, live, lyrics (status) }.
// In the Visuals modes the arrows work the visualizer. On the poster (Album,
// Lyrics) they work the song: left/right seek, untimed lyrics page on every
// arrow, and yellow favourites the song rather than the preset.
export function remoteAction(name, ctx) {
  const poster = ctx.mode === "album" || ctx.mode === "lyrics";
  const paging = ctx.mode === "lyrics" && ctx.lyrics === "plain";
  if (name === "left" || name === "right") {
    const sign = name === "left" ? -1 : 1;
    if (paging) return { do: "lyricsPage", by: sign };
    if (poster) return { do: "seek", by: sign * SEEK_SECONDS };
    return { do: "dim", by: sign * DIM_STEP };
  }
  if (name === "up" || name === "down") {
    if (paging) return { do: "lyricsPage", by: name === "up" ? -1 : 1 };
    if (poster && !ctx.visualsShown) return { do: "hint" };
    return { do: "preset", by: name === "up" ? 1 : -1 };
  }
  if (name === "yellow") {
    if (poster) return { do: "favoriteSong" };
    return ctx.milkdropReady ? { do: "favoritePreset" } : null;
  }
  if (name === "blue") return ctx.milkdropOn && (!poster || ctx.visualsShown) ? { do: "presetList" } : null;
  if (name === "red" || name === "green") return ctx.live ? { do: "trim", by: (name === "red" ? -1 : 1) * TRIM_STEP_MS } : null;
  if (name === "ok") return { do: "controls" };
  if (name === "back") return { do: "exit" };
  return null;
}
