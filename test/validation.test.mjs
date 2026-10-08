import assert from "node:assert/strict";
import { test } from "node:test";
import { countValidated, describeValidation, isValidated, ratingOf, scanOrder, toggleValidated } from "../src/validation.js";

const state = () => ({
  rated: { fast: 58, slow: 12 },
  bench: { fast: 20, seeded: 50, seededSlow: 30 },
  overrides: {},
  validateFps: 45,
});

test("a preset is validated by this TV's measurement, else by the shipped benchmark, against the threshold", () => {
  const s = state();
  assert.equal(ratingOf("fast", s), 58, "the TV's own number wins over the benchmark");
  assert.equal(ratingOf("seeded", s), 50);
  assert.equal(ratingOf("unknown", s), undefined);
  assert.equal(isValidated("fast", s), true);
  assert.equal(isValidated("slow", s), false);
  assert.equal(isValidated("seeded", s), true);
  assert.equal(isValidated("seededSlow", s), false);
  assert.equal(isValidated("unknown", s), false, "never measured anywhere: not validated");
  s.validateFps = 30;
  assert.equal(isValidated("seededSlow", s), true, "the threshold applies at once");
});

test("the person's own decision wins, and undoing it returns to the measurement", () => {
  const s = state();
  s.overrides = toggleValidated("slow", s);
  assert.deepEqual(s.overrides, { slow: true });
  assert.equal(isValidated("slow", s), true);
  assert.equal(describeValidation("slow", s), "yes (by you, 12 fps)");
  s.overrides = toggleValidated("slow", s);
  assert.deepEqual(s.overrides, {}, "agreeing with the measurement again drops the override");
  assert.equal(describeValidation("slow", s), "no (12 fps)");

  s.overrides = toggleValidated("fast", s);
  assert.deepEqual(s.overrides, { fast: false });
  assert.equal(describeValidation("fast", s), "no (by you, 58 fps)");

  s.overrides = {};
  s.overrides = toggleValidated("unknown", s);
  assert.deepEqual(s.overrides, { unknown: true });
  assert.equal(describeValidation("unknown", s), "yes (by you)");
  s.overrides = toggleValidated("unknown", s);
  assert.deepEqual(s.overrides, {});
  assert.equal(describeValidation("unknown", s), "not tested");
});

test("favorites play no part in validation; counts follow the threshold and overrides", () => {
  const s = state();
  const names = ["fast", "slow", "seeded", "seededSlow", "unknown"];
  assert.equal(countValidated(names, s), 2);
  s.overrides = { slow: true };
  assert.equal(countValidated(names, s), 3);
  s.validateFps = 60;
  assert.equal(countValidated(names, s), 1, "only the override survives a 60 fps bar");
});

test("a scan measures the unknown first, then the benchmark-only, then re-measures the rest", () => {
  const s = state();
  assert.deepEqual(scanOrder(["slow", "Zeta", "seeded", "fast", "alpha", "seededSlow"], s), ["alpha", "Zeta", "seeded", "seededSlow", "fast", "slow"]);
});
