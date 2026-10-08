// Synthetic signal for developing without music playing (?mock=1) and for the
// preset scan: a kick on every beat at 120 bpm, a bass note per bar, an
// arpeggio and off-beat noise. The bass line repeats every four bars, so eight
// seconds of it are computed once and looped: handing out a window then costs
// nothing, which matters on a TV, where computing 1024 samples a frame showed
// up in the scan's frame rates.

const SAMPLE_RATE = 44100;
const SAMPLES = 1024;
const BEAT = 0.5;
const BASS = [55, 65.4, 73.4, 49];
const ARP = [220, 277.2, 329.6, 440, 554.4, 659.3];
const TAU = Math.PI * 2;
const LOOP_SECONDS = BEAT * 4 * BASS.length;
const LOOP = SAMPLE_RATE * LOOP_SECONDS;

function noise(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function sampleAt(t, n) {
  const sinceBeat = t % BEAT;
  const kick = Math.sin(TAU * (48 * sinceBeat + (90 / 28) * (1 - Math.exp(-28 * sinceBeat)))) * Math.exp(-7 * sinceBeat);
  const bass = Math.sin(TAU * BASS[Math.floor(t / (BEAT * 4)) % BASS.length] * t) * 0.35;
  const arpStep = Math.floor(t / (BEAT / 2));
  const sinceArp = t % (BEAT / 2);
  const note = ARP[arpStep % ARP.length];
  const arp = (Math.sin(TAU * note * t) + 0.5 * Math.sin(TAU * note * 4 * t)) * Math.exp(-6 * sinceArp) * 0.3;
  const sinceHat = (t + BEAT / 2) % BEAT;
  const hat = noise(n) * Math.exp(-25 * sinceHat) * 0.45;
  return kick * 0.5 + bass + arp + hat;
}

let loop = null;

function render() {
  const out = new Uint8Array(LOOP + SAMPLES); // a window may run past the end: the start repeats there
  for (let n = 0; n < LOOP; n++) {
    const v = sampleAt(n / SAMPLE_RATE, n);
    out[n] = Math.max(0, Math.min(255, Math.round(128 + v * 100)));
  }
  out.set(out.subarray(0, SAMPLES), LOOP);
  return out;
}

export function createMock() {
  return {
    sampleRate: SAMPLE_RATE,
    // The window of audio that finishes sounding at nowMs; a view into the
    // loop, so it is only valid until the next call.
    wave(nowMs) {
      if (!loop) loop = render();
      const end = Math.floor((nowMs / 1000) * SAMPLE_RATE);
      const start = (((end - SAMPLES) % LOOP) + LOOP) % LOOP;
      return loop.subarray(start, start + SAMPLES);
    },
  };
}
