import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_DIFFICULTIES,
  CAMPAIGN_MISSION_OUTCOMES,
  CAMPAIGN_PROFILE_VERSION,
  awardCampaignMedal,
  createCampaignProfile,
  deserializeCampaignProfile,
  recordCampaignMissionResult,
  serializeCampaignProfile,
  setCampaignChoice,
  setCampaignDifficulty,
  unlockCampaignOperation,
  unlockCampaignUpgrade,
  validateCampaignProfile,
} from '../../src/core/campaign-profile.js';

test('creates a deterministic frozen versioned campaign profile', () => {
  const profile = createCampaignProfile({
    profileId: 'commander-1',
    difficulty: CAMPAIGN_DIFFICULTIES.STORY,
    initialOperationIds: ['zaporizhzhia', 'donbas', 'donbas'],
  });

  assert.equal(profile.version, CAMPAIGN_PROFILE_VERSION);
  assert.equal(profile.revision, 0);
  assert.deepEqual(profile.unlockedOperationIds, ['donbas', 'zaporizhzhia']);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.unlockedOperationIds), true);
});

test('changes difficulty and treats repeated mutations as no-ops', () => {
  const initial = createCampaignProfile();
  const veteran = setCampaignDifficulty(initial, CAMPAIGN_DIFFICULTIES.VETERAN);

  assert.equal(veteran.difficulty, CAMPAIGN_DIFFICULTIES.VETERAN);
  assert.equal(veteran.revision, 1);
  const repeated = setCampaignDifficulty(veteran, CAMPAIGN_DIFFICULTIES.VETERAN);
  assert.deepEqual(repeated, veteran);
  assert.equal(repeated.revision, veteran.revision);
  assert.throws(() => setCampaignDifficulty(veteran, 'nightmare'), /Unknown campaign difficulty/);
});

test('unlocks operations, upgrades, and medals as stable sorted sets', () => {
  let profile = createCampaignProfile({ initialOperationIds: ['donbas'] });
  profile = unlockCampaignOperation(profile, 'kherson');
  profile = unlockCampaignOperation(profile, 'zaporizhzhia');
  profile = unlockCampaignUpgrade(profile, 'thermal');
  profile = unlockCampaignUpgrade(profile, 'cageArmor');
  profile = awardCampaignMedal(profile, 'iron-crossing');

  assert.deepEqual(profile.unlockedOperationIds, ['donbas', 'kherson', 'zaporizhzhia']);
  assert.deepEqual(profile.unlockedUpgradeIds, ['cageArmor', 'thermal']);
  assert.deepEqual(profile.medalIds, ['iron-crossing']);
  const repeated = unlockCampaignUpgrade(profile, 'thermal');
  assert.deepEqual(repeated, profile);
  assert.equal(repeated.revision, profile.revision);
});

test('stores deep-frozen JSON-compatible persistent choices', () => {
  const source = { branch: 'north', support: ['engineers', 'armor'] };
  const profile = setCampaignChoice(createCampaignProfile(), 'donbas.approach', source);
  source.support.push('artillery');

  assert.deepEqual(profile.choices['donbas.approach'], {
    branch: 'north',
    support: ['engineers', 'armor'],
  });
  assert.equal(Object.isFrozen(profile.choices['donbas.approach']), true);
  const repeated = setCampaignChoice(profile, 'donbas.approach', {
    support: ['engineers', 'armor'],
    branch: 'north',
  });
  assert.deepEqual(repeated, profile);
  assert.equal(repeated.revision, profile.revision);
  assert.throws(() => setCampaignChoice(profile, 'bad', { value: Number.NaN }), /finite JSON values/);
});

test('records attempts, best score, victory completion, and mission medals', () => {
  let profile = createCampaignProfile({ initialOperationIds: ['donbas'] });
  profile = recordCampaignMissionResult(profile, 'donbas', {
    outcome: CAMPAIGN_MISSION_OUTCOMES.DEFEAT,
    score: 900,
    completedTick: 1800,
  });
  profile = recordCampaignMissionResult(profile, 'donbas', {
    outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
    score: 750,
    completedTick: 1500,
    medalIds: ['crossing-defender'],
  });

  assert.equal(profile.missionResults.donbas.attempts, 2);
  assert.equal(profile.missionResults.donbas.score, 900);
  assert.equal(profile.missionResults.donbas.outcome, CAMPAIGN_MISSION_OUTCOMES.VICTORY);
  assert.deepEqual(profile.completedOperationIds, ['donbas']);
  assert.deepEqual(profile.medalIds, ['crossing-defender']);

  const laterDefeat = recordCampaignMissionResult(profile, 'donbas', {
    outcome: CAMPAIGN_MISSION_OUTCOMES.DEFEAT,
    score: 100,
    completedTick: 2200,
  });
  assert.equal(laterDefeat.missionResults.donbas.outcome, CAMPAIGN_MISSION_OUTCOMES.VICTORY);
  assert.equal(laterDefeat.missionResults.donbas.completedTick, 1500);
});

test('rejects results for locked operations without mutation', () => {
  const profile = createCampaignProfile({ initialOperationIds: ['donbas'] });
  assert.throws(
    () => recordCampaignMissionResult(profile, 'kherson', {
      outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
    }),
    /locked operation/,
  );
  assert.equal(profile.revision, 0);
});

test('serializes canonically and round-trips to an equivalent frozen profile', () => {
  let first = createCampaignProfile({ profileId: 'alpha', initialOperationIds: ['zaporizhzhia', 'donbas'] });
  first = setCampaignChoice(first, 'choice.b', 2);
  first = setCampaignChoice(first, 'choice.a', { z: true, a: false });
  first = unlockCampaignUpgrade(first, 'thermal');

  let second = createCampaignProfile({ profileId: 'alpha', initialOperationIds: ['donbas', 'zaporizhzhia'] });
  second = setCampaignChoice(second, 'choice.a', { a: false, z: true });
  second = setCampaignChoice(second, 'choice.b', 2);
  second = unlockCampaignUpgrade(second, 'thermal');

  const serialized = serializeCampaignProfile(first);
  assert.equal(serialized, serializeCampaignProfile(second));
  assert.deepEqual(deserializeCampaignProfile(serialized), first);
  assert.equal(Object.isFrozen(deserializeCampaignProfile(serialized).choices), true);
});

test('rejects corrupt, unsupported, and internally inconsistent profiles', () => {
  assert.throws(() => deserializeCampaignProfile('{'), /JSON is invalid/);
  assert.throws(
    () => deserializeCampaignProfile(JSON.stringify({ version: 99 })),
    /Unsupported campaign profile version/,
  );

  const profile = createCampaignProfile({ initialOperationIds: ['donbas'] });
  assert.throws(
    () => validateCampaignProfile({
      ...profile,
      completedOperationIds: ['donbas'],
      missionResults: {},
    }),
    /requires a victory mission result/,
  );
  assert.throws(
    () => validateCampaignProfile({
      ...profile,
      missionResults: {
        donbas: {
          operationId: 'donbas',
          outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
          score: 10,
          attempts: 1,
          completedTick: 30,
          medalIds: [],
        },
      },
    }),
    /must be completed/,
  );
});
