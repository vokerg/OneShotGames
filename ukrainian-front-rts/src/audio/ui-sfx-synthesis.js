export const UI_SFX_SAMPLE_RATE = 16000;
export const UI_SFX_CHANNELS = 1;
export const UI_SFX_BITS_PER_SAMPLE = 16;
export const UI_SFX_GAP_MS = 18;

export const UI_SFX_RECIPES = Object.freeze([
  recipe('sfx.ui.selection.unit', 'selection.unit', 'unit.selection', 'selection', 'feedback', 120, 0x127001, 'short rising selection ping', [[620, 840, 0, 95, 0.52]], [[0, 20, 0.08]]),
  recipe('sfx.ui.acknowledgement.unit', 'acknowledgement.unit', 'unit.acknowledgement', 'acknowledgement', 'feedback', 180, 0x127002, 'two-note acknowledgement cadence', [[510, 510, 0, 75, 0.42], [690, 690, 82, 88, 0.48]], []),
  recipe('sfx.ui.command.confirm', 'command.confirm', 'ui.confirm', 'command', 'feedback', 145, 0x127003, 'compact command confirmation click and tone', [[760, 920, 12, 115, 0.46]], [[0, 18, 0.1]]),
  recipe('sfx.ui.queue.add', 'queue.add', 'economy.production-queued', 'queue', 'feedback', 165, 0x127004, 'ascending queue placement pair', [[440, 440, 0, 62, 0.38], [660, 660, 72, 82, 0.44]], []),
  recipe('sfx.ui.complete.production', 'complete.production', 'economy.production-complete', 'complete', 'feedback', 260, 0x127005, 'bright production completion triad', [[520, 520, 0, 180, 0.32], [650, 650, 40, 185, 0.3], [780, 780, 80, 170, 0.36]], []),
  recipe('sfx.ui.complete.research', 'complete.research', 'economy.research-complete', 'complete', 'feedback', 320, 0x127006, 'shimmering research completion sweep', [[560, 900, 0, 260, 0.34], [840, 1260, 45, 240, 0.24]], [[15, 120, 0.035]]),
  recipe('sfx.ui.error.unit', 'error.unit', 'unit.error', 'error', 'feedback', 230, 0x127007, 'descending unit error double tone', [[420, 310, 0, 105, 0.46], [330, 240, 112, 108, 0.4]], [[0, 25, 0.06]]),
  recipe('sfx.ui.error.interface', 'error.interface', 'ui.error', 'error', 'feedback', 190, 0x127008, 'dry interface rejection buzz', [[230, 190, 0, 175, 0.34], [460, 380, 0, 175, 0.18]], [[0, 35, 0.11]]),
  recipe('sfx.ui.alert.warning', 'alert.warning', 'ui.alert', 'alert', 'mission', 360, 0x127009, 'urgent alternating warning tones', [[720, 720, 0, 120, 0.42], [520, 520, 125, 100, 0.4], [720, 720, 235, 115, 0.42]], []),
  recipe('sfx.ui.objective.update', 'objective.update', 'mission.objective-update', 'objective', 'mission', 330, 0x12700a, 'measured objective update chime', [[480, 480, 0, 210, 0.28], [640, 640, 55, 225, 0.3], [800, 800, 110, 205, 0.32]], []),
  recipe('sfx.ui.mission.victory', 'mission.victory', 'mission.victory', 'victory', 'mission', 960, 0x12700b, 'ascending four-note victory fanfare', [[390, 390, 0, 300, 0.26], [520, 520, 155, 330, 0.28], [650, 650, 330, 360, 0.3], [780, 780, 520, 420, 0.36]], [[0, 80, 0.025]]),
  recipe('sfx.ui.mission.defeat', 'mission.defeat', 'mission.defeat', 'defeat', 'mission', 920, 0x12700c, 'descending restrained defeat cadence', [[520, 470, 0, 330, 0.28], [390, 340, 230, 360, 0.3], [260, 210, 500, 400, 0.34]], [[0, 90, 0.035]]),
  recipe('sfx.ui.menu.navigate', 'menu.navigate', 'ui.confirm', 'menu', 'navigation', 90, 0x12700d, 'subtle menu navigation tick', [[980, 1120, 5, 70, 0.28]], [[0, 12, 0.08]]),
  recipe('sfx.ui.menu.confirm', 'menu.confirm', 'ui.confirm', 'menu', 'navigation', 135, 0x12700e, 'menu confirmation rise', [[680, 940, 5, 115, 0.4]], [[0, 15, 0.06]]),
  recipe('sfx.ui.menu.cancel', 'menu.cancel', 'ui.cancel', 'menu', 'navigation', 145, 0x12700f, 'menu cancellation fall', [[720, 430, 5, 125, 0.38]], [[0, 16, 0.07]]),
  recipe('sfx.ui.save.complete', 'save.complete', 'ui.confirm', 'save', 'navigation', 280, 0x127010, 'stable save completion cadence', [[430, 430, 0, 180, 0.28], [650, 650, 75, 190, 0.34]], [[0, 22, 0.04]]),
  recipe('sfx.ui.load.complete', 'load.complete', 'ui.confirm', 'load', 'navigation', 300, 0x127011, 'reverse load completion cadence', [[650, 650, 0, 185, 0.3], [430, 430, 85, 195, 0.34]], [[0, 22, 0.04]]),
]);

function recipe(id, cue, eventId, family, bank, durationMs, seed, synthesis, tones, noises) {
  return Object.freeze({
    id, cue, eventId, family, bank, durationMs, seed, synthesis,
    tones: Object.freeze(tones.map(([startFrequency, endFrequency, startMs, toneDurationMs, amplitude]) => Object.freeze({ startFrequency, endFrequency, startMs, durationMs: toneDurationMs, amplitude }))),
    noises: Object.freeze(noises.map(([startMs, noiseDurationMs, amplitude]) => Object.freeze({ startMs, durationMs: noiseDurationMs, amplitude }))),
  });
}

function xorshift32(seed) {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
function clamp(value, minimum = -1, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }
function layerEnvelope(time, start, duration, attack = 0.004) {
  const local = time - start;
  if (local < 0 || local >= duration) return 0;
  return Math.min(1, local / Math.max(attack, 1 / UI_SFX_SAMPLE_RATE)) * Math.pow(1 - local / duration, 2.2);
}
function chirp(time, startFrequency, endFrequency, duration) {
  const slope = (endFrequency - startFrequency) / Math.max(duration, 1e-9);
  return Math.sin(Math.PI * 2 * (startFrequency * time + 0.5 * slope * time * time));
}

export function renderUiSfxRecipe(recipeValue) {
  const duration = recipeValue.durationMs / 1000;
  const count = Math.max(1, Math.round(duration * UI_SFX_SAMPLE_RATE));
  const random = xorshift32(recipeValue.seed);
  const samples = new Float64Array(count);
  let filteredNoise = 0;
  for (let index = 0; index < count; index += 1) {
    const time = index / UI_SFX_SAMPLE_RATE;
    const rawNoise = random() * 2 - 1;
    filteredNoise += 0.28 * (rawNoise - filteredNoise);
    let value = 0;
    for (const tone of recipeValue.tones) {
      const start = tone.startMs / 1000;
      const toneDuration = tone.durationMs / 1000;
      const local = time - start;
      value += tone.amplitude * layerEnvelope(time, start, toneDuration) * chirp(local, tone.startFrequency, tone.endFrequency, toneDuration);
    }
    for (const noise of recipeValue.noises) {
      value += noise.amplitude * layerEnvelope(time, noise.startMs / 1000, noise.durationMs / 1000, 0.001) * filteredNoise;
    }
    samples[index] = value;
  }
  let rawPeak = 0;
  for (const sample of samples) rawPeak = Math.max(rawPeak, Math.abs(sample));
  const scale = rawPeak > 0 ? 0.86 / rawPeak : 1;
  for (let index = 0; index < samples.length; index += 1) samples[index] = clamp(samples[index] * scale);
  return Object.freeze({ recipe: recipeValue, samples, sampleCount: samples.length, peak: rawPeak > 0 ? 0.86 : 0 });
}

function writeAscii(bytes, offset, value) { for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index); }
export function encodeUiPcm16Wav(samples, { sampleRate = UI_SFX_SAMPLE_RATE } = {}) {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  writeAscii(bytes, 0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeAscii(bytes, 8, 'WAVE'); writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, UI_SFX_CHANNELS, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, UI_SFX_BITS_PER_SAMPLE, true); writeAscii(bytes, 36, 'data'); view.setUint32(40, dataLength, true);
  for (let index = 0; index < samples.length; index += 1) view.setInt16(44 + index * 2, Math.round(clamp(samples[index]) * 32767), true);
  return bytes;
}

export function buildUiSfxBanks() {
  const rendered = UI_SFX_RECIPES.map(renderUiSfxRecipe);
  const gapSamples = Math.round(UI_SFX_GAP_MS / 1000 * UI_SFX_SAMPLE_RATE);
  const groups = new Map();
  for (const entry of rendered) { const group = groups.get(entry.recipe.bank) ?? []; group.push(entry); groups.set(entry.recipe.bank, group); }
  const banks = [];
  const positions = new Map();
  for (const bankId of [...groups.keys()].sort()) {
    const entries = groups.get(bankId);
    const totalSamples = entries.reduce((sum, entry) => sum + entry.sampleCount, 0) + gapSamples * Math.max(0, entries.length - 1);
    const samples = new Float64Array(totalSamples);
    let cursor = 0;
    for (const entry of entries) { samples.set(entry.samples, cursor); positions.set(entry.recipe.id, Object.freeze({ bankId, offsetSamples: cursor })); cursor += entry.sampleCount + gapSamples; }
    banks.push(Object.freeze({ id: bankId, bytes: encodeUiPcm16Wav(samples), sampleCount: samples.length }));
  }
  return Object.freeze({ banks: Object.freeze(banks), rendered: Object.freeze(rendered), positions });
}
