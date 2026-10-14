// This TV as a Music Assistant speaker, through Sendspin: the app plays the
// music itself, so one app draws and sounds. A second player app behind
// viz-man is suspended by webOS within minutes (its socket dies and Music
// Assistant's sync group stalls on it), and the two together run the TV out
// of memory.
//
// Off unless a player id is set (the "Play on this TV" row, or the `speaker`
// launch parameter). The id is kept so the TV stays the same player in Music
// Assistant (its sync groups and its static delay). PCM only: nothing to
// decode on the TV. main.js passes in @sendspin/sendspin-js's SendspinPlayer
// (the package resolves only through the bundler, so tests pass a fake).

export const SENDSPIN_PORT = 8927;

// Music Assistant's address without its web port: Sendspin has its own.
export function sendspinUrl(host) {
  const bare = String(host || "").replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  return "http://" + bare + ":" + SENDSPIN_PORT;
}

// A player id Music Assistant accepts, from a name ("Living Room LG C1" ->
// "webos-living-room-lg-c1"), as the Sendspin Cinema app makes them.
export function playerIdFor(name) {
  return "webos-" + String(name || "tv").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function createSpeaker({ host, Player }) {
  let player = null;
  let wanted = null; // { id, name } while on
  let state = "off"; // off | connecting | ready | playing | error
  let error = "";

  function stop() {
    if (!player) return;
    try {
      player.disconnect("user_request");
    } catch (e) {
      // gone already
    }
    player = null;
    state = wanted ? "connecting" : "off";
  }

  function start() {
    if (!wanted || player) return;
    state = "connecting";
    error = "";
    player = new Player({
      playerId: wanted.id,
      clientName: wanted.name,
      productName: "viz-man",
      baseUrl: sendspinUrl(host),
      codecs: ["pcm"],
      correctionMode: "sync",
      onStateChange(s) {
        const playing = !!(s && s.isPlaying);
        state = playing ? "playing" : "ready";
      },
    });
    // webOS lets a packaged app start audio without a gesture; unlock() only
    // resumes the AudioContext, so it is safe to call here.
    Promise.resolve()
      .then(() => player && player.unlock && player.unlock())
      .then(() => player && player.connect())
      .catch((e) => {
        state = "error";
        error = (e && e.message) || String(e);
      });
  }

  return {
    get on() {
      return !!wanted;
    },
    get id() {
      return wanted ? wanted.id : "";
    },
    get name() {
      return wanted ? wanted.name : "";
    },
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    // name "" switches it off
    set(name, id) {
      stop();
      wanted = name ? { name, id: id || playerIdFor(name) } : null;
      state = wanted ? "connecting" : "off";
    },
    start,
    stop,
  };
}
