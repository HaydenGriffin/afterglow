// The back of the poster: where the song comes from and how it sounds, from
// the queue item's stream details (Music Assistant 2.10). Missing facts are
// left out rather than guessed.
const QUALITY = { hi_res: "Hi-res", lossless: "Lossless", lossy: "Compressed", low: "Low quality" };

function sourceName(instance, providers) {
  if (!instance) return "";
  const known = (providers || []).find(p => p && p.instance_id === instance);
  if (known && known.name) return known.name;
  const domain = String(instance).split("--")[0].replace(/_/g, " ");
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

export function formatOf(audio) {
  if (!audio) return "";
  const parts = [];
  if (audio.content_type) parts.push(String(audio.content_type).toUpperCase());
  if (audio.sample_rate) parts.push(Math.round(audio.sample_rate / 100) / 10 + " kHz");
  if (audio.bit_depth) parts.push(audio.bit_depth + "-bit");
  if (audio.bit_rate) parts.push(audio.bit_rate + " kbps");
  return parts.join(" · ");
}

export function describeStream(item, providers) {
  if (!item) return [];
  const stream = item.streamdetails || {}, media = item.media_item || {}, album = media.album || {};
  const fidelity = stream.audio_processing && stream.audio_processing.input_fidelity;
  const rows = [
    ["Source", sourceName(stream.provider, providers)],
    ["Format", formatOf(stream.audio_format)],
    ["Quality", fidelity && QUALITY[fidelity.quality] || ""],
    ["Album", album.name ? album.name + (album.year ? " (" + album.year + ")" : "") : ""],
  ];
  return rows.filter(r => r[1]).map(([label, value]) => ({ label, value }));
}

// The quality badge on the poster: quality first, then the format in short.
export function badgeOf(item) {
  const stream = item && item.streamdetails;
  if (!stream) return "";
  const audio = stream.audio_format || {}, fidelity = stream.audio_processing && stream.audio_processing.input_fidelity;
  const parts = [fidelity && QUALITY[fidelity.quality]];
  const format = [audio.content_type && String(audio.content_type).toUpperCase(), audio.sample_rate && Math.round(audio.sample_rate / 100) / 10 + " kHz"].filter(Boolean).join(" ");
  const detail = audio.bit_depth && fidelity && fidelity.quality !== "lossy" ? audio.bit_depth + "-bit" : audio.bit_rate ? audio.bit_rate + " kbps" : "";
  parts.push([format, detail].filter(Boolean).join(" / "));
  return parts.filter(Boolean).join(" · ");
}
