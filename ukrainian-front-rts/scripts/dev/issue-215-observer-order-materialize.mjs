#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const file = resolve(root, 'scripts/ukrainian-infantry-mission-readability-smoke.mjs');
let source = await readFile(file, 'utf8');

const lateObserver = `  await delay(600);
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
`;
if (!source.includes(lateObserver)) throw new Error('Unable to locate late observer block.');
source = source.replace(lateObserver, `  await delay(600);\n  await waitFor(\`window.__infantryReview?.last?.ua && window.__infantryReview?.last?.ru\`, 'live UA/RU infantry draw observations');\n`);

const missionSelection = `  await waitFor(\`document.readyState === 'complete' && document.querySelector('.missionCard button')\`, 'mission selection');
  await evaluate(\`document.querySelector('.missionCard button').click()\`);`;
const preMissionObserver = `  await waitFor(\`document.readyState === 'complete' && document.querySelector('.missionCard button')\`, 'mission selection');
  await evaluate(\`(async () => {
    const { Renderer } = await import('./src/render.js');
    if (!window.__infantryReview?.installed) {
      const originalRender = Renderer.prototype.render;
      window.__infantryReview = { installed: true, last: { ua: null, ru: null } };
      Renderer.prototype.render = function infantryReviewObservedRender(...args) {
        for (const entity of this.g?.units ?? []) {
          const faction = entity?.type === 'uaInfantry' ? 'ua' : entity?.type === 'ruInfantry' ? 'ru' : null;
          if (!faction || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) continue;
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
        return originalRender.apply(this, args);
      };
    }
    return true;
  })()\`, { awaitPromise: true });
  await evaluate(\`document.querySelector('.missionCard button').click()\`);`;
if (!source.includes(missionSelection)) throw new Error('Unable to locate mission selection block.');
source = source.replace(missionSelection, preMissionObserver);

await writeFile(file, source);
console.log('[issue-215] moved live infantry observer before mission start');
