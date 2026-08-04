import * as core from './voice-pipeline-core.js';

export * from './voice-pipeline-core.js';

function normalizedCatalog(catalog) {
  return Array.isArray(catalog?.languages) || Array.isArray(catalog?.hooks)
    ? core.validateVoiceCatalog(catalog)
    : catalog;
}

export function resolveVoiceLanguage(catalog, requestedLanguage) {
  return core.resolveVoiceLanguage(normalizedCatalog(catalog), requestedLanguage);
}

export function resolveVoiceRequest(catalog, request, options) {
  return core.resolveVoiceRequest(normalizedCatalog(catalog), request, options);
}

export async function createVoicePipeline(options = {}) {
  const mixer = options?.mixer;
  if (mixer !== undefined && mixer !== null) {
    const methods = ['decodeAudioData', 'playBuffer', 'snapshot', 'stopAll'];
    if (methods.some((method) => typeof mixer[method] !== 'function')) {
      throw new TypeError('Voice pipeline requires a compatible audio mixer.');
    }
  }
  return core.createVoicePipeline(options);
}
