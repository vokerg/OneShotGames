import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssUrl = new URL('../../operation-cards.css', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

test('operation-card overrides load after the parchment skin', async () => {
  const html = await source(indexUrl);
  const skinIndex = html.indexOf('href="ui-skin.css"');
  const cardIndex = html.indexOf('href="operation-cards.css"');
  assert.ok(skinIndex >= 0, 'ui-skin.css must remain loaded');
  assert.ok(cardIndex > skinIndex, 'operation card overrides must load after ui-skin.css');
});

test('operation cards keep a light explicit surface and shrinkable text column', async () => {
  const css = await source(cssUrl);
  assert.match(css, /grid-template-columns:\s*130px\s+minmax\(0,\s*1fr\)\s+max-content/);
  assert.match(css, /background:\s*#d7c792/);
  assert.match(css, /border-image-slice:\s*12\s*;/);
  assert.doesNotMatch(css, /border-image-slice:\s*12\s+fill/);
  assert.match(css, /\.missionCard\s*>\s*div\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('operation cards reflow before narrow-mobile layout and expose forced-color fallback', async () => {
  const css = await source(cssUrl);
  assert.match(css, /@media\s*\(max-width:\s*960px\)[\s\S]*grid-template-columns:\s*130px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.missionCard[\s\S]*border-image:\s*none/);
  assert.match(css, /background:\s*Canvas/);
  assert.match(css, /color:\s*CanvasText/);
});
