import {
  CAMPAIGN_OPERATION_IDS,
  getCampaignOperation,
} from '../content/campaign/campaign-operation-registry.js';
import { TUTORIAL_PROLOGUE } from '../content/campaign/tutorial-prologue.js';
import {
  CAMPAIGN_FLOW_ACTIONS,
  CAMPAIGN_FLOW_STAGES,
  createCampaignFlowState,
  createMissionBriefingModel,
  createMissionDebriefModel,
  reduceCampaignFlow,
} from './campaign-flow.js';

const LOADING_DELAY_MS = 90;

function element(documentTarget, tagName, className = '', text = '') {
  const node = documentTarget.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(documentTarget, label, onClick, { disabled = false, primary = false } = {}) {
  const node = element(documentTarget, 'button', primary ? 'primary' : '', label);
  node.type = 'button';
  node.disabled = disabled;
  node.onclick = onClick;
  return node;
}

function operationIndex(operationId) {
  const index = CAMPAIGN_OPERATION_IDS.indexOf(operationId);
  if (index < 0) throw new RangeError(`Unknown campaign operation: ${operationId}`);
  return index;
}

function operationMapId(operation) {
  return operation?.map?.id ?? operation?.mission?.mapId ?? `${operation?.id ?? 'operation'}.runtime-map`;
}

function normalizedBriefingSource(operation) {
  const source = operation?.briefing ?? {};
  return {
    ...source,
    operationId: source.operationId ?? operation.id,
    title: source.title ?? operation.title ?? operation.id,
    summary: source.summary ?? 'Authored campaign operation.',
    mapPreview: source.mapPreview ?? {
      mapId: operationMapId(operation),
      caption: 'Battlefield generated from the authored campaign-state force composition.',
      markers: [],
    },
    forces: source.forces ?? [{ id: 'field-force', label: 'Field force', category: 'combined-arms', count: 1 }],
    objectives: source.objectives ?? (operation.mission?.objectiveDefinitions ?? []).map((objective) => ({
      id: objective.id,
      title: objective.label ?? objective.id,
      description: `Complete ${objective.label ?? objective.id}.`,
      optional: Boolean(objective.optional),
    })),
    intelligence: source.intelligence ?? [],
    difficulty: source.difficulty ?? 'standard',
    difficultyNotes: source.difficultyNotes ?? {
      label: 'Standard',
      summary: 'Authored campaign baseline.',
      modifiers: [],
    },
    loadingHints: source.loadingHints ?? [],
    metadata: source.metadata ?? {},
  };
}

function medalResults(operation, game) {
  const completedObjectives = new Set(
    (game.objectiveResults ?? []).filter((result) => result.complete).map((result) => result.id),
  );
  const variables = game.missionScriptState?.variables ?? {};
  return (operation.debrief?.medalRules ?? []).filter((rule) => {
    const condition = rule.condition ?? {};
    if (condition.objectiveId) {
      const complete = completedObjectives.has(condition.objectiveId);
      if (Boolean(condition.complete) !== complete) return false;
    }
    if (Array.isArray(condition.variables)) {
      const values = condition.variables.map((id) => Boolean(variables[id]));
      if (condition.all === true && !values.every(Boolean)) return false;
      if (condition.all !== true && !values.some(Boolean)) return false;
    }
    if (condition.variable) {
      const value = variables[condition.variable];
      if (condition.operator === 'eq' && value !== condition.value) return false;
    }
    return Boolean(condition.objectiveId || condition.variables?.length || condition.variable);
  }).map((rule) => ({ id: rule.id, title: rule.title, description: '' }));
}

function resultScore(game) {
  const completed = (game.objectiveResults ?? []).filter((result) => result.complete).length;
  const failed = (game.objectiveResults ?? []).filter((result) => result.failed).length;
  return Math.max(0, Math.round(completed * 1000 + (game.player?.mined ?? 0) - failed * 250 - (game.time ?? 0)));
}

function campaignStage(game) {
  return game.campaignRuntime?.snapshot?.().stage ?? null;
}

export function installAuthoredCampaignBrowserRuntime({
  game,
  ui,
  runtime,
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
} = {}) {
  if (!game || !ui?.e?.cards || !runtime || !documentTarget?.createElement) {
    throw new TypeError('Authored campaign browser runtime requires game, ui, runtime, and DOM services.');
  }
  if (!game.campaignRuntime?.snapshot || !game.campaignRuntime?.beginOperation) {
    throw new Error('Authored campaign browser runtime requires campaign progression to be installed first.');
  }

  const previousBuildMissionCards = ui.buildMissionCards;
  const previousSetMission = ui.setMission;
  const previousShowMissionSelect = ui.showMissionSelect;
  const previousShowEndgame = ui.showEndgame;
  const previousSetEndgameActions = ui.setEndgameActions;
  const previousUpdateWaveStatus = ui.updateWaveStatus;
  const previousDiagnostic = windowTarget?.__fieldsOfResolveAuthoredCampaign;

  let startMission = null;
  let activeOperation = null;
  let flowState = null;
  let loadingTimer = null;
  let disposed = false;

  const clearLoadingTimer = () => {
    if (loadingTimer == null) return;
    windowTarget?.clearTimeout?.(loadingTimer);
    loadingTimer = null;
  };

  function setStage(stage) {
    if (ui.e.select?.dataset) ui.e.select.dataset.campaignStage = stage;
  }

  function showSelector() {
    ui.e.endgame.classList.add('hidden');
    ui.e.select.classList.remove('hidden');
    ui.lastOutcome = null;
    ui.commandSignature = '';
    ui.e.abilities.innerHTML = '';
    documentTarget.body?.classList?.remove('placing');
  }

  function drawPreview(canvas, operation, index) {
    const context = canvas.getContext?.('2d');
    if (!context) return;
    const palette = ['#52654a', '#75664a', '#536775', '#62584d', '#59664f', '#6e5d45', '#4c6258', '#6a604d', '#514d59'];
    context.fillStyle = palette[index % palette.length];
    context.fillRect(0, 0, canvas.width, canvas.height);
    const markers = operation.briefing?.mapPreview?.markers ?? [];
    context.fillStyle = '#d7c36f';
    for (const marker of markers) {
      context.fillRect(Math.round(marker.x * 118) + 4, Math.round(marker.y * 64) + 4, 5, 5);
    }
    context.fillStyle = '#243b52';
    context.fillRect(5, 63, Math.min(120, 20 + markers.length * 12), 5);
  }

  function campaignOperationCard(summary) {
    const operation = getCampaignOperation(summary.id);
    const card = element(documentTarget, 'div', 'missionCard');
    card.dataset.campaignOperationId = summary.id;
    const canvas = documentTarget.createElement('canvas');
    canvas.width = 130;
    canvas.height = 76;
    drawPreview(canvas, operation, summary.order - 1);
    const body = element(documentTarget, 'div');
    const status = summary.completed ? 'COMPLETED' : summary.unlocked ? 'AVAILABLE' : 'LOCKED';
    body.append(
      element(documentTarget, 'h3', '', `${summary.order}. ${summary.title}`),
      element(documentTarget, 'small', '', `${status} · ${operationMapId(operation)}`),
      element(documentTarget, 'p', '', operation.briefing?.summary ?? 'Authored campaign operation.'),
      element(
        documentTarget,
        'p',
        'missionPacing',
        `${ui.t('runtime.mission.plannedWaves', { count: 0 })} · ${operation.briefing?.objectives?.length ?? operation.mission?.objectiveDefinitions?.length ?? 0} objectives · scripted pressure`,
      ),
    );
    const begin = button(
      documentTarget,
      summary.unlocked ? ui.t('runtime.mission.begin') : 'Locked',
      () => beginOperation(summary.id),
      { disabled: !summary.unlocked, primary: summary.unlocked && !summary.completed },
    );
    card.append(canvas, body, begin);
    return card;
  }

  function prologueCard() {
    const card = element(documentTarget, 'div', 'missionCard');
    card.dataset.campaignPrologueCard = 'true';
    const body = element(documentTarget, 'div');
    body.append(
      element(documentTarget, 'h3', '', `Prologue — ${TUTORIAL_PROLOGUE.title}`),
      element(documentTarget, 'small', '', 'TUTORIAL / FIRST COMMAND'),
      element(documentTarget, 'p', '', TUTORIAL_PROLOGUE.summary),
    );
    card.append(body, button(documentTarget, 'Open Prologue', renderPrologue));
    return card;
  }

  function renderPrologue() {
    showSelector();
    setStage('prologue');
    ui.e.cards.replaceChildren();
    const card = element(documentTarget, 'div', 'missionCard');
    card.dataset.campaignPrologue = TUTORIAL_PROLOGUE.id;
    const body = element(documentTarget, 'div');
    body.append(
      element(documentTarget, 'h3', '', TUTORIAL_PROLOGUE.title),
      element(documentTarget, 'small', '', 'INTERACTIVE TUTORIAL / PROLOGUE'),
      element(documentTarget, 'p', '', TUTORIAL_PROLOGUE.summary),
    );
    const list = element(documentTarget, 'ol');
    for (const step of TUTORIAL_PROLOGUE.steps.slice(0, 6)) list.append(element(documentTarget, 'li', '', step.title ?? step.id));
    body.append(list);
    const actions = element(documentTarget, 'div');
    actions.append(
      button(documentTarget, 'Back to Operations', returnToOperations),
      button(documentTarget, 'Continue to First Operation', () => beginOperation(CAMPAIGN_OPERATION_IDS[0]), {
        disabled: !game.campaignRuntime.snapshot().operations[0]?.unlocked,
        primary: true,
      }),
    );
    card.append(body, actions);
    ui.e.cards.append(card);
  }

  function renderOperations() {
    clearLoadingTimer();
    activeOperation = null;
    flowState = null;
    showSelector();
    setStage(CAMPAIGN_FLOW_STAGES.OPERATIONS);
    ui.e.cards.replaceChildren();
    const snapshot = game.campaignRuntime.snapshot();
    for (const summary of snapshot.operations) ui.e.cards.append(campaignOperationCard(summary));
    ui.e.cards.append(prologueCard());
  }

  function renderBriefing() {
    const briefing = flowState?.briefing;
    if (!briefing) throw new Error('Campaign briefing render requires an active flow briefing.');
    showSelector();
    setStage(CAMPAIGN_FLOW_STAGES.BRIEFING);
    ui.e.cards.replaceChildren();
    const card = element(documentTarget, 'div', 'missionCard');
    card.dataset.campaignBriefing = briefing.operationId;
    const body = element(documentTarget, 'div');
    body.append(
      element(documentTarget, 'h3', '', briefing.title),
      element(documentTarget, 'small', '', `${briefing.difficulty.label.toUpperCase()} · ${briefing.mapPreview.mapId}`),
      element(documentTarget, 'p', '', briefing.summary),
      element(documentTarget, 'strong', '', 'Objectives'),
    );
    const objectives = element(documentTarget, 'ul');
    for (const objective of briefing.objectives) {
      objectives.append(element(documentTarget, 'li', '', `${objective.optional ? 'Optional — ' : ''}${objective.title}`));
    }
    body.append(objectives);
    if (briefing.intelligence.length) {
      body.append(element(documentTarget, 'strong', '', 'Intelligence'));
      const intel = element(documentTarget, 'ul');
      for (const item of briefing.intelligence.slice(0, 3)) intel.append(element(documentTarget, 'li', '', `${item.title}: ${item.detail}`));
      body.append(intel);
    }
    const actions = element(documentTarget, 'div');
    actions.append(
      button(documentTarget, 'Back to Operations', returnToOperations),
      button(documentTarget, 'Begin Mission', beginLoading, { primary: true }),
    );
    card.append(body, actions);
    ui.e.cards.append(card);
  }

  function renderLoading() {
    const loading = flowState?.loading;
    if (!loading) return;
    showSelector();
    setStage(CAMPAIGN_FLOW_STAGES.LOADING);
    ui.e.cards.replaceChildren();
    const card = element(documentTarget, 'div', 'missionCard');
    card.dataset.campaignLoading = loading.operationId;
    const body = element(documentTarget, 'div');
    body.append(
      element(documentTarget, 'h3', '', 'Loading Operation'),
      element(documentTarget, 'small', '', `${loading.percentage}% · ${loading.status.replaceAll('-', ' ').toUpperCase()}`),
      element(documentTarget, 'p', '', loading.message || 'Mounting authored map, forces, objectives, and mission script.'),
    );
    if (loading.hint) body.append(element(documentTarget, 'p', 'missionPacing', loading.hint));
    card.append(body);
    ui.e.cards.append(card);
  }

  function deployActiveOperation() {
    if (!activeOperation || !startMission || disposed) return;
    flowState = reduceCampaignFlow(flowState, {
      type: CAMPAIGN_FLOW_ACTIONS.UPDATE_LOADING,
      changes: { progress: 1, status: 'ready', ready: true, message: 'Authored operation ready.' },
    });
    game.pendingAuthoredCampaignOperation = activeOperation;
    try {
      startMission(operationIndex(activeOperation.id));
    } finally {
      delete game.pendingAuthoredCampaignOperation;
    }
    game.campaignRuntime.enterBattlefield(activeOperation.id);
    flowState = reduceCampaignFlow(flowState, { type: CAMPAIGN_FLOW_ACTIONS.START_MISSION });
    setStage(CAMPAIGN_FLOW_STAGES.BATTLEFIELD);
  }

  function beginLoading() {
    if (!flowState || flowState.stage !== CAMPAIGN_FLOW_STAGES.BRIEFING) return;
    flowState = reduceCampaignFlow(flowState, {
      type: CAMPAIGN_FLOW_ACTIONS.BEGIN_LOADING,
      loading: { progress: 0.35, status: 'loading-map', message: 'Loading authored battlefield and mission contracts.' },
    });
    renderLoading();
    clearLoadingTimer();
    loadingTimer = windowTarget?.setTimeout?.(() => {
      loadingTimer = null;
      deployActiveOperation();
    }, LOADING_DELAY_MS) ?? null;
    if (loadingTimer == null) deployActiveOperation();
  }

  function beginOperation(operationId) {
    clearLoadingTimer();
    activeOperation = game.campaignRuntime.beginOperation(operationId);
    const briefing = createMissionBriefingModel(normalizedBriefingSource(activeOperation));
    flowState = createCampaignFlowState(briefing);
    renderBriefing();
  }

  function debriefModel() {
    const medals = medalResults(activeOperation, game);
    const score = resultScore(game);
    const completedTick = Number.isInteger(game.missionScriptState?.tick) ? game.missionScriptState.tick : null;
    const result = {
      outcome: game.outcome,
      score,
      completedTick,
      medalIds: medals.map((medal) => medal.id),
      losses: {},
    };
    const progressionDebrief = game.campaignRuntime.recordResult(activeOperation.id, result);
    const nextOperationId = progressionDebrief.nextOperationId ?? null;
    const next = nextOperationId ? getCampaignOperation(nextOperationId) : null;
    return createMissionDebriefModel({
      operationId: activeOperation.id,
      title: game.outcome === 'victory'
        ? activeOperation.debrief?.victoryTitle ?? progressionDebrief.title ?? 'Operation Complete'
        : activeOperation.debrief?.defeatTitle ?? progressionDebrief.title ?? 'Operation Failed',
      outcome: game.outcome,
      score,
      completedTick,
      medals,
      losses: {},
      timeline: [],
      nextOperations: next ? [{
        operationId: next.id,
        title: next.title,
        summary: next.briefing?.summary ?? '',
        unlocked: game.campaignRuntime.snapshot().profile.unlockedOperationIds.includes(next.id),
        recommended: true,
      }] : [],
      summary: progressionDebrief.summary ?? game.endReason ?? '',
      campaignConsequences: {
        profileRevision: game.campaignRuntime.snapshot().profile.revision,
        nextOperationId,
        campaignComplete: progressionDebrief.campaignConsequences?.campaignComplete ?? false,
      },
    });
  }

  function renderDebrief() {
    if (!activeOperation || !flowState || flowState.stage !== CAMPAIGN_FLOW_STAGES.BATTLEFIELD) {
      return previousShowEndgame.call(ui);
    }
    const debrief = debriefModel();
    flowState = reduceCampaignFlow(flowState, { type: CAMPAIGN_FLOW_ACTIONS.SHOW_DEBRIEF, debrief });
    setStage(CAMPAIGN_FLOW_STAGES.DEBRIEF);
    ui.lastOutcome = game.outcome;
    const victory = game.outcome === 'victory';
    ui.e.endgameTitle.textContent = debrief.title;
    ui.e.endgameReason.textContent = debrief.summary || game.endReason;
    const minutes = Math.floor((game.time ?? 0) / 60);
    const seconds = Math.floor((game.time ?? 0) % 60).toString().padStart(2, '0');
    const completed = (game.objectiveResults ?? []).filter((result) => result.complete).length;
    ui.e.endgameStats.innerHTML = `
      <div><strong>${minutes}:${seconds}</strong><span>Mission time</span></div>
      <div><strong>${debrief.score}</strong><span>Operation score</span></div>
      <div><strong>${completed}/${game.mission.objectiveDefinitions.length}</strong><span>Objectives complete</span></div>
      <div><strong>${debrief.medals.length}</strong><span>Medals earned</span></div>
    `;
    ui.e.endgame.classList.toggle('victory', victory);
    ui.e.endgame.classList.toggle('defeat', !victory);
    ui.e.endgame.classList.remove('hidden');
    return debrief;
  }

  function returnToOperations() {
    clearLoadingTimer();
    const stage = campaignStage(game);
    if (stage && stage !== 'operations') game.campaignRuntime.returnToOperations();
    game.mission = null;
    game.authoredCampaignOperation = null;
    activeOperation = null;
    flowState = null;
    previousShowMissionSelect.call(ui);
    ui.buildMissionCards(ui.startMission ?? startMission);
  }

  function replayOperation() {
    if (!activeOperation) return false;
    const operationId = activeOperation.id;
    ui.e.endgame.classList.add('hidden');
    game.mission = null;
    beginOperation(operationId);
    return true;
  }

  ui.buildMissionCards = function buildAuthoredCampaignCards(start) {
    this.startMission = start;
    startMission = start;
    renderOperations();
  };

  ui.setMission = function setAuthoredMission() {
    if (!game.mission?.authored) return previousSetMission.call(this);
    this.e.missionTitle.textContent = game.mission.title;
    this.e.missionStory.textContent = `${activeOperation?.briefing?.mapPreview?.caption ?? game.mission.mapId}. ${game.mission.story}`;
    this.e.objectiveList.innerHTML = game.mission.objectiveDefinitions
      .map((objective, index) => `<li data-i="${index}">${objective.optional ? 'Optional — ' : ''}${objective.label}</li>`)
      .join('');
    this.e.endgame.classList.add('hidden');
    this.e.select.classList.add('hidden');
    this.lastOutcome = null;
    this.commandSignature = '';
    this.e.abilities.innerHTML = '';
    documentTarget.body?.classList?.remove('placing');
  };

  ui.updateWaveStatus = function updateAuthoredCampaignStatus() {
    if (!game.mission?.authored) return previousUpdateWaveStatus.call(this);
    const pending = (game.missionScriptState?.pending ?? []).length;
    const triggered = (game.missionScriptRecords ?? []).filter((record) => record.type === 'mission.trigger').length;
    this.e.wave.textContent = `SCRIPTED OPERATION · ${triggered} triggers · ${pending} pending`;
  };

  ui.showEndgame = function showAuthoredCampaignEndgame() {
    if (!game.mission?.authored) return previousShowEndgame.call(this);
    if (flowState?.stage === CAMPAIGN_FLOW_STAGES.DEBRIEF) return flowState.debrief;
    return renderDebrief();
  };

  ui.showMissionSelect = function showAuthoredCampaignOperations() {
    if (!flowState && !game.authoredCampaignOperation) return previousShowMissionSelect.call(this);
    returnToOperations();
  };

  ui.setEndgameActions = function setAuthoredCampaignEndgameActions({ retry, operations }) {
    return previousSetEndgameActions.call(this, {
      retry: () => game.mission?.authored || activeOperation ? replayOperation() : retry(),
      operations: () => game.mission?.authored || activeOperation ? returnToOperations() : operations(),
    });
  };

  if (windowTarget) {
    windowTarget.__fieldsOfResolveAuthoredCampaign = Object.freeze({
      snapshot: () => Object.freeze({
        stage: flowState?.stage ?? CAMPAIGN_FLOW_STAGES.OPERATIONS,
        activeOperationId: activeOperation?.id ?? null,
        authoredMission: Boolean(game.mission?.authored),
        mapId: game.authoredMap?.id ?? null,
        operationCount: game.campaignRuntime.snapshot().operations.length,
        unlockedOperationIds: [...game.campaignRuntime.snapshot().profile.unlockedOperationIds],
        completedOperationIds: [...game.campaignRuntime.snapshot().profile.completedOperationIds],
        prologueId: TUTORIAL_PROLOGUE.id,
      }),
      finish(outcome = 'victory') {
        if (!game.mission?.authored || !['victory', 'defeat'].includes(outcome)) return false;
        game.finish(outcome, outcome === 'victory' ? 'Browser campaign smoke victory.' : 'Browser campaign smoke defeat.');
        ui.refresh();
        return true;
      },
    });
  }

  return Object.freeze({
    renderOperations,
    beginOperation,
    snapshot: () => windowTarget?.__fieldsOfResolveAuthoredCampaign?.snapshot?.() ?? null,
    dispose() {
      if (disposed) return false;
      disposed = true;
      clearLoadingTimer();
      ui.buildMissionCards = previousBuildMissionCards;
      ui.setMission = previousSetMission;
      ui.showMissionSelect = previousShowMissionSelect;
      ui.showEndgame = previousShowEndgame;
      ui.setEndgameActions = previousSetEndgameActions;
      ui.updateWaveStatus = previousUpdateWaveStatus;
      if (windowTarget) {
        if (previousDiagnostic === undefined) delete windowTarget.__fieldsOfResolveAuthoredCampaign;
        else windowTarget.__fieldsOfResolveAuthoredCampaign = previousDiagnostic;
      }
      return true;
    },
  });
}
