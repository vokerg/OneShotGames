import assert from 'node:assert/strict';
import test from 'node:test';

import { MISSIONS, REGIONS } from '../../src/config.js';
import { createLocalizer } from '../../src/localization/localization.js';
import { RUNTIME_LOCALIZATION_CATALOGS } from '../../src/localization/runtime-catalogs.js';
import { createLocalizedMissionPresentation } from '../../src/localization/runtime-content.js';

function presentation(localizer, mission) {
  return createLocalizedMissionPresentation(localizer.t, mission, REGIONS[mission.region]);
}

test('authored mission and region copy follows a reversible en -> uk -> en locale roundtrip', () => {
  const localizer = createLocalizer(RUNTIME_LOCALIZATION_CATALOGS, { locale: 'en' });
  const mission = MISSIONS[0];

  const english = presentation(localizer, mission);
  assert.equal(english.title, '1. Siverskyi Donets: Hold the Crossing');
  assert.equal(english.region.name, 'Donbas operational sector');
  assert.equal(english.objectives[0], 'Recover 500 units of materiel');

  assert.equal(localizer.setLocale('uk'), true);
  const ukrainian = presentation(localizer, mission);
  assert.equal(ukrainian.title, '1. Сіверський Донець: утримати переправу');
  assert.equal(ukrainian.region.name, 'Донбаський оперативний сектор');
  assert.equal(ukrainian.objectives[0], 'Зібрати 500 одиниць матеріальних ресурсів');
  assert.equal(ukrainian.story.includes('Russian mechanized group'), false);

  assert.equal(localizer.setLocale('en'), true);
  assert.deepEqual(presentation(localizer, mission), english);
});

test('every authored campaign mission has localized title, story, region, and objective coverage', () => {
  const localizer = createLocalizer(RUNTIME_LOCALIZATION_CATALOGS, { locale: 'uk' });

  for (const mission of MISSIONS) {
    const localized = presentation(localizer, mission);
    assert.notEqual(localized.title, mission.title, `${mission.id} title stayed in base English`);
    assert.notEqual(localized.story, mission.story, `${mission.id} story stayed in base English`);
    assert.notEqual(localized.region.name, REGIONS[mission.region].name, `${mission.id} region stayed in base English`);
    assert.equal(localized.objectives.length, mission.objectives.length);
    localized.objectives.forEach((objective, index) => {
      assert.notEqual(objective, mission.objectives[index], `${mission.id} objective ${index + 1} stayed in base English`);
    });
  }
});
