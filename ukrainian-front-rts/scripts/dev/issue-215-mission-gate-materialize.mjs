#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const path = resolve(root, 'scripts/ukrainian-infantry-mission-readability-smoke.mjs');
let source = await readFile(path, 'utf8');

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Unable to locate ${label}`);
  source = source.replace(needle, replacement);
}

source = source.replace("const ruReviewWorld = Object.freeze({ x: 2100, y: 305 });\n", '');

const focusNeedle = `async function focusMinimap(worldX, worldY) {
  await evaluate(\`(() => {
    const minimap = document.querySelector('#minimap');
    const bounds = minimap.getBoundingClientRect();
    minimap.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width * \${worldX / world.width},
      clientY: bounds.top + bounds.height * \${worldY / world.height},
      button: 0,
    }));
  })()\`);
  await delay(350);
}

try {`;

const focusReplacement = `async function focusMinimap(worldX, worldY) {
  await evaluate(\`(() => {
    const minimap = document.querySelector('#minimap');
    const bounds = minimap.getBoundingClientRect();
    minimap.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width * \${worldX / world.width},
      clientY: bounds.top + bounds.height * \${worldY / world.height},
      button: 0,
    }));
  })()\`);
  await delay(350);
}

async function focusObservedInfantry(faction, label) {
  const observed = await waitFor(
    \`window.__infantryReview?.last?.\${faction}\`,
    \`\${label} render observation\`,
  );
  await focusMinimap(observed.worldX, observed.worldY);
  return waitFor(
    \`(() => {
      const point = window.__infantryReview?.last?.\${faction};
      return point
        && point.screenX >= 160 && point.screenX <= 1440
        && point.screenY >= 130 && point.screenY <= 640
        ? point
        : false;
    })()\`,
    \`\${label} visible inside battlefield review viewport\`,
  );
}

try {`;
replaceOnce(focusNeedle, focusReplacement, 'focus helper');

const observerNeedle = `  await delay(600);

  const captures = [];`;
const observerReplacement = `  await delay(600);
  await evaluate(\`(async () => {
    const { Renderer } = await import('./src/render.js');
    if (!window.__infantryReview?.installed) {
      const originalUnit = Renderer.prototype.unit;
      window.__infantryReview = { installed: true, last: { ua: null, ru: null } };
      Renderer.prototype.unit = function infantryReviewObservedUnit(entity) {
        const result = originalUnit.call(this, entity);
        const faction = entity?.type === 'uaInfantry' ? 'ua' : entity?.type === 'ruInfantry' ? 'ru' : null;
        if (faction && Number.isFinite(entity.x) && Number.isFinite(entity.y)) {
          const screen = this.sp(entity.x, entity.y);
          window.__infantryReview.last[faction] = {
            type: entity.type,
            worldX: entity.x,
            worldY: entity.y,
            screenX: screen.x,
            screenY: screen.y,
            zoom: this.g?.camera?.z,
          };
        }
        return result;
      };
    }
    return true;
  })()\`, { awaitPromise: true });
  await waitFor(\`window.__infantryReview?.last?.ua && window.__infantryReview?.last?.ru\`, 'live UA/RU infantry draw observations');

  const captures = [];`;
replaceOnce(observerNeedle, observerReplacement, 'runtime draw observer');

const captureNeedle = `  captures.push({ faction: 'ua', file: 'command-color.png', expectedZoom: 1, bytes: await capture('command-color.png') });

  await wheel(120, 10, uaReviewAnchor);
  captures.push({ faction: 'ua', file: 'strategic-color.png', expectedZoom: 0.55, bytes: await capture('strategic-color.png') });

  await wheel(-120, 20, uaReviewAnchor);
  captures.push({ faction: 'ua', file: 'inspection-color.png', expectedZoom: 1.45, bytes: await capture('inspection-color.png') });

  await wheel(120, 10, uaReviewAnchor);
  await evaluate(\`document.documentElement.style.filter = 'grayscale(1)'\`);
  await delay(150);
  captures.push({ faction: 'ua', file: 'strategic-value.png', expectedZoom: 0.55, bytes: await capture('strategic-value.png') });
  await evaluate(\`document.documentElement.style.filter = ''\`);

  await focusMinimap(ruReviewWorld.x, ruReviewWorld.y);
  await wheel(-120, 20, ruReviewAnchor);
  captures.push({ faction: 'ru', file: 'ru-inspection-color.png', expectedZoom: 1.45, bytes: await capture('ru-inspection-color.png') });

  await wheel(120, 4, ruReviewAnchor);
  captures.push({ faction: 'ru', file: 'ru-command-color.png', expectedZoom: 0.95, bytes: await capture('ru-command-color.png') });

  await wheel(120, 12, ruReviewAnchor);
  captures.push({ faction: 'ru', file: 'ru-strategic-color.png', expectedZoom: 0.55, bytes: await capture('ru-strategic-color.png') });

  await evaluate(\`document.documentElement.style.filter = 'grayscale(1)'\`);
  await delay(150);
  captures.push({ faction: 'ru', file: 'ru-strategic-value.png', expectedZoom: 0.55, bytes: await capture('ru-strategic-value.png') });
  await evaluate(\`document.documentElement.style.filter = ''\`);`;

const captureReplacement = `  await focusObservedInfantry('ua', 'Ukrainian infantry at command zoom');
  captures.push({ faction: 'ua', file: 'command-color.png', expectedZoom: 1, bytes: await capture('command-color.png') });

  await wheel(120, 10, uaReviewAnchor);
  await focusObservedInfantry('ua', 'Ukrainian infantry at strategic zoom');
  captures.push({ faction: 'ua', file: 'strategic-color.png', expectedZoom: 0.55, bytes: await capture('strategic-color.png') });

  await wheel(-120, 20, uaReviewAnchor);
  await focusObservedInfantry('ua', 'Ukrainian infantry at inspection zoom');
  captures.push({ faction: 'ua', file: 'inspection-color.png', expectedZoom: 1.45, bytes: await capture('inspection-color.png') });

  await wheel(120, 10, uaReviewAnchor);
  await focusObservedInfantry('ua', 'Ukrainian infantry at strategic value zoom');
  await evaluate(\`document.documentElement.style.filter = 'grayscale(1)'\`);
  await delay(150);
  captures.push({ faction: 'ua', file: 'strategic-value.png', expectedZoom: 0.55, bytes: await capture('strategic-value.png') });
  await evaluate(\`document.documentElement.style.filter = ''\`);

  await wheel(-120, 20, ruReviewAnchor);
  await focusObservedInfantry('ru', 'Russian infantry at inspection zoom');
  captures.push({ faction: 'ru', file: 'ru-inspection-color.png', expectedZoom: 1.45, bytes: await capture('ru-inspection-color.png') });

  await wheel(120, 4, ruReviewAnchor);
  await focusObservedInfantry('ru', 'Russian infantry at command zoom');
  captures.push({ faction: 'ru', file: 'ru-command-color.png', expectedZoom: 0.95, bytes: await capture('ru-command-color.png') });

  await wheel(120, 12, ruReviewAnchor);
  await focusObservedInfantry('ru', 'Russian infantry at strategic zoom');
  captures.push({ faction: 'ru', file: 'ru-strategic-color.png', expectedZoom: 0.55, bytes: await capture('ru-strategic-color.png') });

  await focusObservedInfantry('ru', 'Russian infantry at strategic value zoom');
  await evaluate(\`document.documentElement.style.filter = 'grayscale(1)'\`);
  await delay(150);
  captures.push({ faction: 'ru', file: 'ru-strategic-value.png', expectedZoom: 0.55, bytes: await capture('ru-strategic-value.png') });
  await evaluate(\`document.documentElement.style.filter = ''\`);`;
replaceOnce(captureNeedle, captureReplacement, 'paired capture sequence');

replaceOnce(
  `  const atlasStatus = await evaluate(\`(async () => {`,
  `  const observedInfantry = await evaluate(\`window.__infantryReview?.last\`);\n\n  const atlasStatus = await evaluate(\`(async () => {`,
  'observed infantry manifest capture',
);
replaceOnce(
  `    captures,\n    review: {`,
  `    captures,\n    observedInfantry,\n    review: {`,
  'manifest observations',
);
source = source.replace("      ruReviewWorld,\n", "      observer: 'live Renderer.prototype.unit draw coordinates',\n");

await writeFile(path, source);
console.log('[issue-215] materialized live-observed infantry mission review gate');
