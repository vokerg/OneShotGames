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

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test('operation contrast override composes after the global parchment skin', () => {
  const skinLink = '<link rel="stylesheet" href="ui-skin.css" />';
  const operationLink = '<link rel="stylesheet" href="operation-cards.css" />';

  assert.ok(indexHtml.includes(skinLink), 'index must load the global UI skin');
  assert.ok(indexHtml.includes(operationLink), 'index must load operation-specific card styles');
  assert.ok(
    indexHtml.indexOf(operationLink) > indexHtml.indexOf(skinLink),
    'operation-specific readability overrides must load after the global skin',
  );
  assert.match(
    indexHtml,
    /<div id="missionSelect">\s*<div class="book">/,
    'the readability override must target the operation selector book container',
  );
});

test('operation selector removes the dark nine-slice center fill and exposes a readable book surface', () => {
  const parchmentRule = uiSkinCss.match(/\.book,\s*\.endgameCard\s*\{([\s\S]*?)\}/);
  assert.ok(parchmentRule, 'global parchment frame rule must exist');
  assert.match(parchmentRule[1], /border-image-source:\s*url\(["']assets\/ui\/skin\/parchment\.svg["']\)/);
  assert.match(parchmentRule[1], /border-image-slice:\s*12\s+fill\s*;/);

  const bookSurfaceRule = uiSkinCss.match(/\.book\s*\{([^}]*)background-color:\s*(#[0-9a-f]{6})\s*;([^}]*)\}/i);
  assert.ok(bookSurfaceRule, 'global book rule must provide the light fallback surface');
  const bookBackground = bookSurfaceRule[2].toLowerCase();

  const selectorRule = operationCardsCss.match(/#missionSelect\s*>\s*\.book\s*\{([\s\S]*?)\}/);
  assert.ok(selectorRule, 'operation selector must override the global parchment frame');
  const declarations = stripComments(selectorRule[1]);
  assert.match(declarations, /border-image-slice:\s*12\s*;/);
  assert.doesNotMatch(declarations, /\bfill\b/, 'selector override must not repaint the dark center fill');
  assert.doesNotMatch(declarations, /background(?:-color|-image)?\s*:/, 'selector override must preserve the book surface');

  assert.ok(
    contrastRatio('#2d2417', bookBackground) >= 4.5,
    `book copy contrast against ${bookBackground} must meet WCAG AA for normal text`,
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
