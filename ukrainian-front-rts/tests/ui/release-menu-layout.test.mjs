import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('release operation selector neutralizes the dark parchment fill with readable text', async () => {
  const css = await readFile(resolve(root, 'operation-cards.css'), 'utf8');
  assert.match(css, /\.book\s*\{[^}]*background:\s*#d7c792[^}]*border-image-slice:\s*12;/s);
  assert.doesNotMatch(css, /\.book\s*\{[^}]*border-image-slice:\s*12\s+fill/s);
  assert.match(css, /\.book h1\s*\{[^}]*color:\s*#241b11/s);
  assert.match(css, /\.book > p\s*\{[^}]*color:\s*#382b1c/s);
  assert.match(css, /\.book \.disclaimer\s*\{[^}]*color:\s*#55452c/s);
  assert.match(css, /@media \(forced-colors:\s*active\)[\s\S]*\.book,[\s\S]*border-image:\s*none/s);
});

test('release skirmish setup constrains descriptive selects to their field tracks', async () => {
  const css = await readFile(resolve(root, 'operation-cards.css'), 'utf8');
  assert.match(css, /\.skirmishSetupFields\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.skirmishMissionCard > div,\s*\n\.skirmishSetupFields,\s*\n\.skirmishSetupField\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.skirmishSetupField select\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.skirmishSetupFields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
