// The app opened again while running (webOSRelaunch).
import { normalizeParams } from "./settings.js";

// reload(): start over; resume(): carry on, a no-op if already running.
export function createRelaunchHandler({ reload, resume }) {
  return (relaunch) => {
    // Relaunched with parameters (a different player, say): start over so
    // they are read the same way as on a first launch.
    if (Object.keys(normalizeParams(relaunch && relaunch.detail)).length) return reload();
    // Repeated app-open commands must not tear down an already-playing speaker.
    // resume() is guarded; visibilitychange already suspended a hidden app.
    resume();
  };
}
