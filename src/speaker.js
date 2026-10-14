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
// The TV's CPU is mostly MilkDrop's, so audio is scheduled late now and then:
// ask Music Assistant to send further ahead than sendspin-js's 250 ms. Timing
// is clock-synced, so a deeper buffer adds no delay (LG C1, 14 Oct: dropouts
// every minute or so at 250 ms, CPU 75-88 %).
export const LEAD_TIME_MS = 1000;
export const MIN_BUFFER_MS = 2000;
// The "Audio delay" row: steps, the protocol's range, and how long the remote
// rests before a value is saved (one save for a run of presses).
export const DELAY_STEP_MS = 10;
export const DELAY_MAX_MS = 5000;
export const DELAY_SAVE_MS = 600;

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

// delays: { get(playerId) -> Promise<ms>, set(playerId, ms) -> Promise }, the
// player's delay setting in Music Assistant (ma.js).
// The "Play on this TV" row: off when on; on again as the player this TV was
// last (its launch parameter or an earlier choice), so it keeps its id and its
// place in Music Assistant's groups. Only a TV never set up gets a new player.
export const NEW_SPEAKER_NAME = "viz-man TV";
export function toggledSpeaker(current, last) {
  if (current) return null;
  return last || { name: NEW_SPEAKER_NAME, id: playerIdFor(NEW_SPEAKER_NAME) };
}

export function createSpeaker({ host, Player, delays }) {
  let player = null;
  let delay = null; // ms, once read from Music Assistant
  let saveTimer = 0;
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

  function loadDelay() {
    if (!delays || !wanted) return;
    const id = wanted.id;
    delays.get(id).then((ms) => {
      if (wanted && wanted.id === id && !saveTimer) delay = ms;
    }, () => {});
  }

  function start() {
    if (!wanted || player) return;
    loadDelay();
    state = "connecting";
    error = "";
    player = new Player({
      playerId: wanted.id,
      clientName: wanted.name,
      productName: "viz-man",
      baseUrl: sendspinUrl(host),
      codecs: ["pcm"],
      requiredLeadTimeMs: LEAD_TIME_MS,
      minBufferMs: MIN_BUFFER_MS,
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
    get delayMs() {
      return delay;
    },
    // One step earlier (+1) or later (-1), saved once the presses stop.
    nudgeDelay(direction) {
      if (delay === null || !wanted || !delays) return;
      delay = Math.max(0, Math.min(DELAY_MAX_MS, delay + direction * DELAY_STEP_MS));
      const id = wanted.id;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = 0;
        delays.set(id, delay).catch((e) => {
          error = "delay not saved: " + ((e && e.message) || e);
        });
      }, DELAY_SAVE_MS);
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
