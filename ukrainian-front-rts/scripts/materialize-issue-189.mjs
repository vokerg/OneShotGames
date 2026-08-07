import { readFile, writeFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

async function replace(path, before, after) {
  const url = new URL(path, projectRoot);
  const source = await readFile(url, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Expected patch anchor not found in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch anchor is ambiguous in ${path}`);
  }
  await writeFile(url, source.replace(before, after));
  console.log(`[issue-189] patched ${path}`);
}

await replace(
  'tests/app/diagnostics.test.mjs',
  "  assert.match(reset, /Reset 1 local data entries/);",
  "  assert.match(reset, /Reset 1 local data entry\\./);",
);

await replace(
  'tests/ui/interaction-recovery.test.mjs',
  "  return {\n    elements,\n    document: {\n      body: new FakeElement(),\n      querySelector: (selector) => elements[selector],\n      createElement: () => new FakeElement(),\n    },\n  };",
  "  const documentElement = new FakeElement();\n  documentElement.lang = 'en';\n  documentElement.getAttribute = (name) => documentElement.attributes[name] ?? null;\n  documentElement.removeAttribute = (name) => { delete documentElement.attributes[name]; };\n  return {\n    elements,\n    document: {\n      body: new FakeElement(),\n      documentElement,\n      querySelector: (selector) => elements[selector],\n      createElement: () => new FakeElement(),\n    },\n  };",
);

await replace(
  'src/ui/onboarding-help.js',
  "function tokens(value) {\n  return canonicalText(value)\n    .toLocaleLowerCase()\n    .normalize('NFKD')\n    .split(/[^\\p{L}\\p{N}]+/u)\n    .filter(Boolean);\n}",
  "function normalizeSearchText(value) {\n  return canonicalText(value)\n    .toLocaleLowerCase()\n    .normalize('NFKD')\n    .replace(/\\p{M}+/gu, '');\n}\n\nfunction tokens(value) {\n  return normalizeSearchText(value)\n    .split(/[^\\p{L}\\p{N}]+/u)\n    .filter(Boolean);\n}",
);

await replace(
  'src/ui/onboarding-help.js',
  "      const haystack = entrySearchText(entry);",
  "      const haystack = normalizeSearchText(entrySearchText(entry));",
);

await replace(
  'src/ui/viewport-runtime.js',
  "  documentTarget.addEventListener(LOCALE_CHANGE_EVENT, schedule);",
  "  documentTarget.addEventListener(LOCALE_CHANGE_EVENT, apply);",
);

await replace(
  'src/ui/viewport-runtime.js',
  "      documentTarget.removeEventListener(LOCALE_CHANGE_EVENT, schedule);",
  "      documentTarget.removeEventListener(LOCALE_CHANGE_EVENT, apply);",
);
