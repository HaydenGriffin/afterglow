import test from "node:test";
import assert from "node:assert/strict";
import { badgeOf, describeStream, formatOf } from "../src/stream-details.js";

test("a hi-res stream reads as source, format, quality and album", () => {
  const item = { media_item: { album: { name: "Made for the room", year: 2025 } },
    streamdetails: { provider: "filesystem--x1", audio_format: { content_type: "flac", sample_rate: 96000, bit_depth: 24, bit_rate: 0 }, audio_processing: { input_fidelity: { quality: "hi_res" } } } };
  assert.deepEqual(describeStream(item, [{ instance_id: "filesystem--x1", name: "Music folder" }]), [
    { label: "Source", value: "Music folder" },
    { label: "Format", value: "FLAC · 96 kHz · 24-bit" },
    { label: "Quality", value: "Hi-res" },
    { label: "Album", value: "Made for the room (2025)" },
  ]);
});

test("unknown providers fall back to their domain; missing facts are left out", () => {
  const rows = describeStream({ streamdetails: { provider: "spotify--t7F", audio_format: { content_type: "ogg", sample_rate: 44100, bit_rate: 320 } } }, null);
  assert.deepEqual(rows, [{ label: "Source", value: "Spotify" }, { label: "Format", value: "OGG · 44.1 kHz · 320 kbps" }]);
  assert.deepEqual(describeStream({}, []), []);
  assert.equal(formatOf(null), "");
});

test("the poster badge leads with quality, then the format in short", () => {
  const s = (q, type, rate, depth, kbps) => ({ streamdetails: { audio_format: { content_type: type, sample_rate: rate, bit_depth: depth, bit_rate: kbps }, audio_processing: { input_fidelity: { quality: q } } } });
  assert.equal(badgeOf(s("lossless", "flac", 44100, 16, 0)), "Lossless · FLAC 44.1 kHz / 16-bit");
  assert.equal(badgeOf(s("hi_res", "flac", 96000, 24, 0)), "Hi-res · FLAC 96 kHz / 24-bit");
  assert.equal(badgeOf(s("lossy", "ogg", 44100, 16, 320)), "Compressed · OGG 44.1 kHz / 320 kbps");
  assert.equal(badgeOf({}), "");
});
