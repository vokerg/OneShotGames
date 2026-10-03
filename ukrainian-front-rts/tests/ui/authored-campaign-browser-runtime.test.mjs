import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_OPERATION_IDS, getCampaignOperation } from '../../src/content/campaign/campaign-operation-registry.js';
import { createCampaignProgressionRuntime } from '../../src/ui/campaign-progression-runtime.js';
import { installAuthoredCampaignBrowserRuntime } from '../../src/ui/authored-campaign-browser-runtime.js';

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle(value, force) {
        const present = force ?? !classes.has(value);
        if (present) classes.add(value);
        else classes.delete(value);
        return present;
      },
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
}

function findButton(element, label) {
  if (element.tagName === 'BUTTON' && element.textContent === label) return element;
  for (const child of element.children) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

test('authored campaign end screens resolve nested operation titles through the full sequence', () => {
  const documentTarget = { body: new Element(), createElement: tag => new Element(tag) };
  const windowTarget = {};
  const game = {
    campaignRuntime: createCampaignProgressionRuntime(),
    player: { mined: 0 }, time: 0, objectiveResults: [],
    finish(outcome, reason) { this.outcome = outcome; this.endReason = reason; this.gameOver = true; },
  };
  const ui = {
    e: Object.fromEntries(['cards', 'select', 'endgame', 'abilities', 'endgameTitle', 'endgameReason', 'endgameStats'].map(id => [id, new Element()])),
    t: () => 'Begin Mission',
    buildMissionCards() {}, setMission() {}, showMissionSelect() {}, showEndgame() {},
    setEndgameActions() {}, updateWaveStatus() {},
    refresh() { if (game.gameOver) this.showEndgame(); },
  };
  const installation = installAuthoredCampaignBrowserRuntime({ game, ui, runtime: {}, documentTarget, windowTarget });
  try {
    ui.buildMissionCards(() => {
      const operation = game.pendingAuthoredCampaignOperation;
      game.mission = { ...operation.mission, authored: true, objectiveDefinitions: operation.mission.objectiveDefinitions ?? [] };
      game.authoredMap = operation.map ?? { id: operation.mission.mapId };
      game.missionScriptState = { tick: 1, variables: { collateralIncidents: 0 } };
      game.gameOver = false;
    });
    for (const [index, operationId] of CAMPAIGN_OPERATION_IDS.entries()) {
      installation.beginOperation(operationId);
      findButton(ui.e.cards, 'Begin Mission').onclick();
      assert.equal(installation.snapshot().stage, 'battlefield');
      assert.equal(windowTarget.__fieldsOfResolveAuthoredCampaign.finish('victory'), true);
      assert.equal(installation.snapshot().stage, 'debrief');
      const debrief = ui.showEndgame();
      assert.equal(debrief.operationId, operationId);
      const nextId = CAMPAIGN_OPERATION_IDS[index + 1];
      if (nextId) {
        const next = getCampaignOperation(nextId);
        assert.equal(debrief.nextOperations[0].operationId, nextId);
        assert.equal(debrief.nextOperations[0].title, next.title ?? next.mission.title ?? next.briefing.title);
        assert.equal(debrief.nextOperations[0].unlocked, true);
      } else assert.deepEqual(debrief.nextOperations, []);
      const revision = game.campaignRuntime.snapshot().profile.revision;
      ui.refresh();
      assert.equal(game.campaignRuntime.snapshot().profile.revision, revision, 'repeated refresh must not record another result');
      ui.showMissionSelect();
    }
    assert.equal(game.campaignRuntime.snapshot().profile.completedOperationIds.length, 9);
  } finally { installation.dispose(); }
});
