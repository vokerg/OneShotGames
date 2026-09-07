import {
  TUTORIAL_PROLOGUE,
  createTutorialProgress,
  getTutorialPrompt,
  reduceTutorialProgress,
} from '../content/campaign/tutorial-prologue.js';
import { installAuthoredCampaignBrowserRuntime as installBaseAuthoredCampaignBrowserRuntime } from './authored-campaign-browser-runtime.js';
import {
  AUTHORED_CAMPAIGN_RUNTIME_GLOBAL,
  dispatchTutorialRuntimeEvent,
} from './onboarding-runtime-contract.js';

function inactiveTutorialSnapshot() {
  return Object.freeze({
    runtimeId: TUTORIAL_PROLOGUE.id,
    tutorialId: TUTORIAL_PROLOGUE.id,
    status: 'inactive',
    activeStepId: null,
    marker: null,
  });
}

export function installAuthoredCampaignBrowserRuntime(options = {}) {
  const {
    ui,
    windowTarget = globalThis.window,
  } = options;
  const baseRuntime = installBaseAuthoredCampaignBrowserRuntime(options);
  const baseBuildMissionCards = ui.buildMissionCards;
  const baseDiagnostic = windowTarget?.[AUTHORED_CAMPAIGN_RUNTIME_GLOBAL];
  let tutorialProgress = null;
  let disposed = false;

  function tutorialSnapshot() {
    if (ui.e.select?.dataset?.campaignStage !== 'prologue' || !tutorialProgress) {
      return inactiveTutorialSnapshot();
    }
    const marker = getTutorialPrompt(tutorialProgress);
    return Object.freeze({
      runtimeId: TUTORIAL_PROLOGUE.id,
      tutorialId: TUTORIAL_PROLOGUE.id,
      status: tutorialProgress.status,
      activeStepId: tutorialProgress.activeStepId,
      marker: marker ? Object.freeze({
        id: marker.id,
        topic: marker.topic,
        title: marker.title,
        prompt: marker.prompt,
      }) : null,
    });
  }

  function publish(source, eventType = null) {
    const snapshot = tutorialSnapshot();
    dispatchTutorialRuntimeEvent(windowTarget, Object.freeze({
      runtimeId: snapshot.runtimeId,
      source,
      eventType,
      snapshot,
    }));
    return snapshot;
  }

  function clearTutorialRuntime(source = 'campaign-selector') {
    const hadRuntime = tutorialProgress !== null;
    tutorialProgress = null;
    if (hadRuntime) publish(source);
  }

  function activateTutorialRuntime() {
    tutorialProgress = createTutorialProgress();
    return publish('tutorial-start');
  }

  function recordTutorialEvent(event) {
    const runtimeId = String(event?.runtimeId ?? '').trim();
    const type = String(event?.type ?? '').trim();
    const current = tutorialSnapshot();
    if (!type || runtimeId !== current.runtimeId || current.status !== 'active' || !current.activeStepId) return false;
    const next = reduceTutorialProgress(tutorialProgress, { type });
    if (next === tutorialProgress) return false;
    tutorialProgress = next;
    publish('tutorial-event', type);
    return tutorialSnapshot();
  }

  function wrapButton(node, { before = null, after = null } = {}) {
    if (!node || typeof node.onclick !== 'function' || node.dataset?.onboardingRuntimeWrapped === 'true') return;
    const original = node.onclick;
    if (node.dataset) node.dataset.onboardingRuntimeWrapped = 'true';
    node.onclick = function runtimeAwareCampaignAction(event) {
      before?.();
      const result = original.call(this, event);
      after?.();
      return result;
    };
  }

  function decoratePrologueActions() {
    const prologue = ui.e.cards.querySelector?.('[data-campaign-prologue]');
    if (!prologue?.querySelectorAll) return;
    for (const action of prologue.querySelectorAll('button')) {
      if (String(action.textContent ?? '').includes('Continue to First Operation')) {
        wrapButton(action, { before: () => clearTutorialRuntime('operation-start') });
      }
    }
  }

  function decorateOperationCards() {
    const prologueButton = ui.e.cards.querySelector?.('[data-campaign-prologue-card] button');
    wrapButton(prologueButton, {
      after: () => {
        activateTutorialRuntime();
        decoratePrologueActions();
      },
    });
    if (!ui.e.cards.querySelectorAll) return;
    for (const operationButton of ui.e.cards.querySelectorAll('[data-campaign-operation-id] button')) {
      wrapButton(operationButton, { before: () => clearTutorialRuntime('operation-start') });
    }
  }

  ui.buildMissionCards = function buildRuntimeAwareCampaignCards(...args) {
    clearTutorialRuntime('campaign-selector');
    const result = baseBuildMissionCards.apply(this, args);
    decorateOperationCards();
    return result;
  };

  if (windowTarget && baseDiagnostic) {
    windowTarget[AUTHORED_CAMPAIGN_RUNTIME_GLOBAL] = Object.freeze({
      ...baseDiagnostic,
      tutorialSnapshot,
      tutorialEvent(type, runtimeId = TUTORIAL_PROLOGUE.id) {
        return recordTutorialEvent({ runtimeId, type });
      },
    });
  }

  return Object.freeze({
    ...baseRuntime,
    beginOperation(operationId) {
      clearTutorialRuntime('operation-start');
      return baseRuntime.beginOperation(operationId);
    },
    tutorialSnapshot,
    recordTutorialEvent,
    dispose() {
      if (disposed) return false;
      disposed = true;
      clearTutorialRuntime('dispose');
      return baseRuntime.dispose();
    },
  });
}
