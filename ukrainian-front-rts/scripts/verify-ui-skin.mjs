import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UI_SKIN,
  UI_SKIN_SOURCE_PATH,
  UI_SKIN_STYLESHEET_PATH,
  buildUiSkinArtifacts,
  validateUiSkin,
} from '../src/ui/ui-skin.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');
const fail = (message) => { throw new Error(message); };

validateUiSkin();

const [sourceText, skinCss, indexHtml] = await Promise.all([
  read(UI_SKIN_SOURCE_PATH),
  read(UI_SKIN_STYLESHEET_PATH),
  read('index.html'),
]);

const source = JSON.parse(sourceText);
if (source.schema !== 'fields-of-resolve.ui-skin-source' || source.version !== 1) fail('UI skin source manifest schema is invalid.');
if (source.authority !== 'src/ui/ui-skin.js') fail('UI skin source authority drifted.');
if (source.provenance?.license !== 'CC0-1.0' || source.provenance?.externalInputs?.length !== 0) fail('UI skin provenance is incomplete.');
if (source.provenance?.embeddedText !== false) fail('Reusable UI skin assets must not embed player-facing text.');
if (source.nineSliceAssets?.length !== UI_SKIN.assets.length) fail('UI skin source asset count drifted.');

const artifacts = buildUiSkinArtifacts();
for (const artifact of artifacts) {
  const actual = await read(artifact.path);
  if (actual !== artifact.content) fail(`${artifact.path} is stale; run node scripts/build-ui-skin.mjs.`);
  if (!actual.includes('shape-rendering="crispEdges"') || /<text\b/i.test(actual)) fail(`${artifact.path} violates crisp-edge or text-free requirements.`);
}

const skinLink = `<link rel="stylesheet" href="${UI_SKIN_STYLESHEET_PATH}" />`;
if (!indexHtml.includes(skinLink)) fail('Active index.html does not load the production UI skin stylesheet.');
if (indexHtml.indexOf(skinLink) < indexHtml.indexOf('selection-panel.css')) fail('Production UI skin must load after legacy component styles.');

const requiredPatterns = [
  ['nine-slice panel', /border-image-slice:\s*12\s+fill/],
  ['nine-slice control', /border-image-slice:\s*9\s+fill/],
  ['top bar', /#topbar/],
  ['command panel', /#commandPanel/],
  ['mission screen', /\.book/],
  ['button states', /button:hover/],
  ['focus state', /:focus-visible/],
  ['disabled state', /:disabled/],
  ['tooltip skin', /\[data-tooltip\]/],
  ['scrollbar skin', /::-webkit-scrollbar-thumb/],
  ['reduced motion', /prefers-reduced-motion:\s*reduce/],
  ['high contrast', /prefers-contrast:\s*more/],
];
for (const [label, pattern] of requiredPatterns) {
  if (!pattern.test(skinCss)) fail(`UI skin stylesheet is missing ${label}.`);
}

for (const component of UI_SKIN.components) {
  if (!skinCss.includes(component.selector)) fail(`UI skin stylesheet does not cover ${component.selector}.`);
}

process.stdout.write(
  `[ui-skin] verified ${artifacts.length} scalable nine-slice assets, `
  + `${UI_SKIN.components.length} component mappings, active runtime composition, states, scrollbars, reduced motion, and high contrast\n`,
);
