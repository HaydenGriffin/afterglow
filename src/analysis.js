// Automatic level. Tracks arrive at whatever loudness they were mastered at,
// and a quiet one would barely move the picture, so the waveform is scaled so
// its recent peak sits near full scale: gain drops at once on a loud passage
// and recovers slowly. MilkDrop is handed the levelled waveform.

export const WAVE_SAMPLES = 1024;

const SILENCE = new Uint8Array(WAVE_SAMPLES).fill(128);
const LEVEL_TARGET = 100; // of 127
const LEVEL_MAX_GAIN = 8;
const LEVEL_RELEASE_SECONDS = 10;

export function createAnalysis() {
  const levelled = new Uint8Array(WAVE_SAMPLES);
  let autoLevel = true;
  let peak = LEVEL_TARGET;
  let gain = 1;
  let wave = SILENCE;

  return {
    // `dt` is the time since the previous frame, which paces the level release.
    setWave(next, dt) {
      if (!next || !autoLevel) {
        wave = next || SILENCE;
        gain = 1;
        return;
      }
      let loudest = 0;
      for (let i = 0; i < WAVE_SAMPLES; i++) {
        const d = next[i] > 128 ? next[i] - 128 : 128 - next[i];
        if (d > loudest) loudest = d;
      }
      peak = Math.max(loudest, peak * Math.exp(-(dt || 1 / 60) / LEVEL_RELEASE_SECONDS), LEVEL_TARGET / LEVEL_MAX_GAIN);
      gain = Math.max(1, LEVEL_TARGET / peak);
      for (let i = 0; i < WAVE_SAMPLES; i++) {
        const v = 128 + (next[i] - 128) * gain;
        levelled[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      wave = levelled;
    },
    get gain() {
      return gain;
    },
    get autoLevel() {
      return autoLevel;
    },
    set autoLevel(on) {
      autoLevel = on;
    },
    get wave() {
      return wave;
    },
  };
}
