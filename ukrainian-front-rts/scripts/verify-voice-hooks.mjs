import manifest from '../assets/audio/voice/manifest.json' with { type: 'json' };
import {
  VOICE_HOOK_KINDS,
  VOICE_SOURCE_MODES,
  validateVoiceCatalog,
} from '../src/audio/voice-pipeline.js';

const catalog = validateVoiceCatalog(manifest, { source: 'assets/audio/voice/manifest.json' });
const requiredHooks = ['unit.ready', 'alert.under-attack', 'campaign.dialogue'];
for (const hookId of requiredHooks) {
  if (!catalog.hooks[hookId]) throw new Error(`Voice catalog is missing required hook ${hookId}.`);
}
for (const hook of Object.values(catalog.hooks)) {
  for (const language of catalog.languageIds) {
    if (!hook.variants[language]?.length) throw new Error(`${hook.id} is missing ${language} variants.`);
  }
  for (const variants of Object.values(hook.variants)) {
    for (const variant of variants) {
      if (!VOICE_SOURCE_MODES.includes(variant.asset.mode)) throw new Error(`${variant.id} has an unsupported source mode.`);
      const provenance = variant.asset.provenance;
      if (!provenance.creator || !provenance.source || !provenance.license || !provenance.redistribution) {
        throw new Error(`${variant.id} has incomplete provenance.`);
      }
      if (provenance.publicFigureImpersonation) throw new Error(`${variant.id} enables public-figure impersonation.`);
    }
  }
}
const kinds = new Set(Object.values(catalog.hooks).map((hook) => hook.kind));
for (const kind of Object.values(VOICE_HOOK_KINDS)) if (!kinds.has(kind)) throw new Error(`Voice catalog is missing ${kind}.`);
const variantCount = Object.values(catalog.hooks)
  .flatMap((hook) => Object.values(hook.variants))
  .reduce((sum, variants) => sum + variants.length, 0);
console.log(`[voice-hooks] verified ${catalog.hookIds.length} hooks, ${variantCount} variants, ${catalog.languageIds.length} languages`);
