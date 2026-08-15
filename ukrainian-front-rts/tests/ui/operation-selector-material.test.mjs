import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

const [indexHtml, uiSkinCss, operationCardsCss] = await Promise.all([
  readProjectFile('index.html'),
  readProjectFile('ui-skin.css'),
  readProjectFile('operation-cards.css'),
]);

test('operation material override composes after the global parchment skin', () => {
  const skinLink = '<link rel="stylesheet" href="ui-skin.css" />';
  const operationLink = '<link rel="stylesheet" href="operation-cards.css" />';

  assert.ok(indexHtml.includes(skinLink), 'index must load the global UI skin');
  assert.ok(indexHtml.includes(operationLink), 'index must load operation-specific card styles');
  assert.ok(
    indexHtml.indexOf(operationLink) > indexHtml.indexOf(skinLink),
    'operation-specific material overrides must load after the global skin',
  );
  assert.match(
    indexHtml,
    /<div id="missionSelect">\s*<div class="book">/,
    'the material override must target the operation selector book container',
  );
});

test('operation selector removes only the opaque nine-slice center fill', () => {
  const globalBookRule = uiSkinCss.match(/\.book\s*\{([\s\S]*?)\}/);
  assert.ok(globalBookRule, 'global .book parchment rule must exist');
  assert.match(globalBookRule[1], /background-image:\s*url\(['"]textures\/parchment\.svg['"]\)/);
  assert.match(globalBookRule[1], /border-image:\s*url\(['"]textures\/parchment\.svg['"]\)\s+12\s+fill\s+stretch/);

  const selectorRule = operationCardsCss.match(/#missionSelect\s*>\s*\.book\s*\{([\s\S]*?)\}/);
  assert.ok(selectorRule, 'operation selector must override the global book material');
  const declarations = stripComments(selectorRule[1]);

  assert.match(declarations, /border-image-slice:\s*12\s*;/);
  assert.doesNotMatch(declarations, /\bfill\b/, 'selector override must not repaint the nine-slice center');
  assert.doesNotMatch(
    declarations,
    /background(?:-image)?\s*:/,
    'selector override must preserve the global parchment background image',
  );
});

test('mission cards retain an opaque readable surface and accessibility overrides', () => {
  const cardRule = operationCardsCss.match(/\.missionCard\s*\{([\s\S]*?)\}/);
  assert.ok(cardRule, 'mission-card readability rule must exist');
  const declarations = stripComments(cardRule[1]);

  assert.match(declarations, /background:\s*#d7c792\s*;/);
  assert.match(declarations, /color:\s*#2d2417\s*;/);
  assert.match(declarations, /border-image-slice:\s*12\s*;/);
  assert.match(operationCardsCss, /@media\s*\(prefers-contrast:\s*more\)/);
  assert.match(operationCardsCss, /@media\s*\(forced-colors:\s*active\)/);
});
