import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnalysis, WAVE_SAMPLES } from "../src/analysis.js";

function sine(cycles, amplitude = 100) {
  // amplitude 100 is the auto-level target, so tests see the wave unscaled
  const wave = new Uint8Array(WAVE_SAMPLES);
  for (let i = 0; i < WAVE_SAMPLES; i++) {
    wave[i] = Math.round(128 + amplitude * Math.sin((2 * Math.PI * cycles * i) / WAVE_SAMPLES));
  }
  return wave;
}

test("no wave means silence", () => {
  const analysis = createAnalysis();
  analysis.setWave(null, 1 / 60);
  assert.equal(analysis.wave.length, WAVE_SAMPLES);
  assert.ok(analysis.wave.every((v) => v === 128));
  assert.equal(analysis.gain, 1);
});

test("auto level lifts a quiet wave toward full scale and backs off at once when it gets loud", () => {
  const analysis = createAnalysis();
  analysis.setWave(sine(8, 25), 1 / 60);
  assert.ok(analysis.gain < 1.01, "starts from the assumption that the track is loud");
  for (let i = 0; i < 60 * 40; i++) analysis.setWave(sine(8, 25), 1 / 60);
  assert.ok(analysis.gain > 3.9 && analysis.gain <= 4, `expected about x4, got ${analysis.gain}`);
  const lifted = Math.max(...analysis.wave) - 128;
  assert.ok(lifted >= 98 && lifted <= 100, `expected a peak near 100, got ${lifted}`);

  analysis.setWave(sine(8, 120), 1 / 60);
  assert.equal(analysis.gain, 1);
  assert.ok(Math.max(...analysis.wave) <= 255);

  analysis.autoLevel = false;
  analysis.setWave(sine(8, 25), 1 / 60);
  assert.equal(Math.max(...analysis.wave) - 128, 25);
});

test("auto level never exceeds its maximum gain, even on near-silence", () => {
  const analysis = createAnalysis();
  for (let i = 0; i < 60 * 120; i++) analysis.setWave(sine(8, 2), 1 / 60);
  assert.equal(analysis.gain, 8);
});
