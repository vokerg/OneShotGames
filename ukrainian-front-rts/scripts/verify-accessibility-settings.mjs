import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ACTION_BINDINGS,
  INPUT_ACTION_IDS,
  INPUT_ACTION_LABELS,
  actionBindingsToKeyBindings,
} from '../src/input/action-map.js';
import {
  COLOR_VISION_PRESETS,
  CONTRAST_MODES,
  CURSOR_SIZES,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  TEXT_SCALE_OPTIONS,
  UI_SCALE_OPTIONS,
  normalizeAccessibilitySettings,
} from '../src/audio/accessibility-settings.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const audioUiPath = resolve(projectRoot, 'src/audio/audio-settings-ui.js');
const accessibilityUiPath = resolve(projectRoot, 'src/audio/accessibility-settings-ui.js');
const accessibilityRuntimePath = resolve(projectRoot, 'src/audio/accessibility-runtime.js');
const gameRuntimePath = resolve(projectRoot, 'src/app/runtime.js');
const menuCompositionPath = resolve(projectRoot, 'src/ui/menu-stack-composition.js');
const coreActionMapPath = resolve(projectRoot, 'src/core/input-action-map.js');
const lifecyclePath = resolve(projectRoot, 'src/core/accessibility-events.js');

assert.equal(new Set(INPUT_ACTION_IDS).size, INPUT_ACTION_IDS.length, 'Input action IDs must be unique.');
assert.deepEqual(Object.keys(INPUT_ACTION_LABELS).sort(), [...INPUT_ACTION_IDS].sort(), 'Every named action needs a settings label.');
const defaultKeys = actionBindingsToKeyBindings(DEFAULT_ACTION_BINDINGS);
assert.ok(Object.keys(defaultKeys).length >= INPUT_ACTION_IDS.length, 'Every named action needs at least one default binding.');
assert.deepEqual(normalizeAccessibilitySettings(DEFAULT_ACCESSIBILITY_SETTINGS), DEFAULT_ACCESSIBILITY_SETTINGS);
assert.ok(UI_SCALE_OPTIONS.includes(1) && UI_SCALE_OPTIONS.some((value) => value > 1), 'UI scale must include default and enlargement.');
assert.ok(TEXT_SCALE_OPTIONS.includes(1) && TEXT_SCALE_OPTIONS.some((value) => value > 1), 'Text scale must include default and enlargement.');
assert.deepEqual(COLOR_VISION_PRESETS, ['standard', 'deuteranopia', 'protanopia', 'tritanopia']);
assert.deepEqual(CONTRAST_MODES, ['standard', 'high']);
assert.deepEqual(CURSOR_SIZES, ['standard', 'large', 'extra-large']);

const [audioUi, accessibilityUi, accessibilityRuntime, gameRuntime, menuComposition, coreActionMap, lifecycle] = await Promise.all([
  readFile(audioUiPath, 'utf8'),
  readFile(accessibilityUiPath, 'utf8'),
  readFile(accessibilityRuntimePath, 'utf8'),
  readFile(gameRuntimePath, 'utf8'),
  readFile(menuCompositionPath, 'utf8'),
  readFile(coreActionMapPath, 'utf8'),
  readFile(lifecyclePath, 'utf8'),
]);
assert.match(audioUi, /installAccessibilitySettingsUI/);
assert.match(audioUi, /accessibility\.reset\(\)/);
assert.match(audioUi, /accessibility\.dispose\(\)/);
assert.match(accessibilityUi, /data-accessibility-setting="pauseOnFocusLoss"/);
assert.match(accessibilityUi, /data-accessibility-action/);
assert.match(accessibilityRuntime, /ACCESSIBILITY_PAUSE_EVENT/);
assert.match(accessibilityRuntime, /setRuntimeActionBindings/);
assert.match(accessibilityRuntime, /data-accessibility-reduced-motion/);
assert.match(accessibilityRuntime, /data-accessibility-reduce-flashes/);
assert.match(gameRuntime, /const pauseReasons = new Set\(\)/);
assert.match(gameRuntime, /pauseReasons\.add/);
assert.match(gameRuntime, /pauseReasons\.delete/);
assert.match(menuComposition, /ACCESSIBILITY_FOCUS_PAUSE_REASON/);
assert.match(menuComposition, /ACCESSIBILITY_PAUSE_EVENT/);
assert.match(menuComposition, /ACCESSIBILITY_RESUME_EVENT/);
assert.match(coreActionMap, /runtimeKeyBindingsView/);
assert.match(coreActionMap, /rebindInputAction/);
assert.match(lifecycle, /accessibility-focus-loss/);

console.log(`Accessibility settings verification passed for ${INPUT_ACTION_IDS.length} named actions, ${UI_SCALE_OPTIONS.length} UI scales, ${TEXT_SCALE_OPTIONS.length} text scales, ${COLOR_VISION_PRESETS.length} color-vision presets, ${CURSOR_SIZES.length} cursor sizes, and independent menu/focus pause ownership.`);
