import {
  DEFAULT_SKIRMISH_SETUP,
  SKIRMISH_DIFFICULTY_IDS,
  SKIRMISH_FACTIONS,
  SKIRMISH_MAPS,
} from '../skirmish/skirmish-config.js';

function option(documentTarget, value, label) {
  const element = documentTarget.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function labeledSelect(documentTarget, label, values) {
  const wrapper = documentTarget.createElement('label');
  wrapper.className = 'skirmishSetupField';
  const caption = documentTarget.createElement('strong');
  caption.textContent = label;
  const select = documentTarget.createElement('select');
  for (const entry of values) select.append(option(documentTarget, entry.value, entry.label));
  wrapper.append(caption, select);
  return { wrapper, select };
}

function appendSkirmishCard({ game, ui, documentTarget }) {
  if (ui.e.cards.querySelector?.('[data-skirmish-setup]')) return;
  const card = documentTarget.createElement('div');
  card.className = 'missionCard skirmishMissionCard';
  card.dataset.skirmishSetup = 'true';

  const preview = documentTarget.createElement('canvas');
  preview.width = 130;
  preview.height = 76;
  const context = preview.getContext?.('2d');
  if (context) {
    context.fillStyle = '#3e5043';
    context.fillRect(0, 0, 130, 76);
    context.fillStyle = '#8d7c55';
    context.fillRect(8, 34, 114, 8);
    context.fillStyle = '#3978ad';
    context.fillRect(13, 50, 24, 17);
    context.fillStyle = '#7c5043';
    context.fillRect(93, 9, 24, 17);
    context.fillStyle = '#d4bc62';
    context.fillRect(57, 31, 16, 14);
  }

  const body = documentTarget.createElement('div');
  const heading = documentTarget.createElement('h3');
  heading.textContent = 'Skirmish — Custom Match';
  const summary = documentTarget.createElement('p');
  summary.textContent = 'Choose a battlefield, your faction, and a fair AI difficulty. Both sides begin with the same resource wallet; campaign waves are disabled.';
  const fields = documentTarget.createElement('div');
  fields.className = 'skirmishSetupFields';

  const mapField = labeledSelect(documentTarget, 'Battlefield', SKIRMISH_MAPS.map((map) => ({
    value: map.id,
    label: `${map.title} — ${map.description}`,
  })));
  const factionField = labeledSelect(documentTarget, 'Your faction', Object.values(SKIRMISH_FACTIONS).map((faction) => ({
    value: faction.id,
    label: faction.label,
  })));
  const opponentField = labeledSelect(documentTarget, 'Opponent', Object.values(SKIRMISH_FACTIONS).map((faction) => ({
    value: faction.id,
    label: faction.label,
  })));
  opponentField.select.disabled = true;
  const difficultyField = labeledSelect(documentTarget, 'AI difficulty', SKIRMISH_DIFFICULTY_IDS.map((id) => ({
    value: id,
    label: id[0].toUpperCase() + id.slice(1),
  })));

  mapField.select.value = DEFAULT_SKIRMISH_SETUP.mapId;
  factionField.select.value = DEFAULT_SKIRMISH_SETUP.playerFactionId;
  opponentField.select.value = DEFAULT_SKIRMISH_SETUP.opponentFactionId;
  difficultyField.select.value = DEFAULT_SKIRMISH_SETUP.difficultyId;
  const synchronizeOpponent = () => {
    opponentField.select.value = SKIRMISH_FACTIONS[factionField.select.value].opponent;
  };
  factionField.select.addEventListener('change', synchronizeOpponent);
  fields.append(mapField.wrapper, factionField.wrapper, opponentField.wrapper, difficultyField.wrapper);
  body.append(heading, summary, fields);

  const begin = documentTarget.createElement('button');
  begin.type = 'button';
  begin.textContent = 'Begin Skirmish';
  begin.onclick = () => {
    const setup = {
      mapId: mapField.select.value,
      playerFactionId: factionField.select.value,
      opponentFactionId: opponentField.select.value,
      difficultyId: difficultyField.select.value,
    };
    const previousRetry = ui.e.retry.onclick;
    const previousOperations = ui.e.operations.onclick;
    game.startSkirmish(setup);
    ui.setMission();
    ui.setEndgameActions({
      retry: () => {
        game.startSkirmish(setup);
        ui.setMission();
      },
      operations: () => {
        ui.e.retry.onclick = previousRetry;
        ui.e.operations.onclick = previousOperations;
        game.mission = null;
        game.skirmish = null;
        ui.showMissionSelect();
        ui.buildMissionCards(ui.startMission);
      },
    });
  };

  card.append(preview, body, begin);
  ui.e.cards.appendChild(card);
}

function skirmishResultMarkup(game) {
  const minutes = Math.floor(game.time / 60);
  const seconds = Math.floor(game.time % 60).toString().padStart(2, '0');
  const snapshot = game.skirmishSnapshot?.();
  const mapTitle = SKIRMISH_MAPS.find((map) => map.id === snapshot?.mapId)?.title ?? 'Skirmish';
  const completed = game.player.objectives.filter(Boolean).length;
  return `
    <div><strong>${minutes}:${seconds}</strong><span>Match time</span></div>
    <div><strong>${completed}/${game.player.objectives.length}</strong><span>Victory conditions</span></div>
    <div><strong>${Math.floor(game.player.mined)}</strong><span>Player gathered</span></div>
    <div><strong>${Math.floor(snapshot?.enemyGathered ?? 0)}</strong><span>AI gathered · ${mapTitle}</span></div>
  `;
}

export function installSkirmishSetup({ game, ui, documentTarget = globalThis.document } = {}) {
  if (!game?.startSkirmish || !ui?.e?.cards || !documentTarget?.createElement) {
    throw new TypeError('Skirmish setup requires the installed skirmish Game command and mission UI.');
  }
  const originalBuildMissionCards = ui.buildMissionCards;
  const originalProductionTypes = ui.productionTypes;
  const originalUpdateWaveStatus = ui.updateWaveStatus;
  const originalShowEndgame = ui.showEndgame;

  ui.buildMissionCards = function buildMissionCardsWithSkirmish(...args) {
    const result = originalBuildMissionCards.apply(this, args);
    appendSkirmishCard({ game, ui: this, documentTarget });
    return result;
  };
  ui.productionTypes = function skirmishProductionTypes(building) {
    const skirmishTypes = game.skirmishProductionTypes?.(building.type);
    return skirmishTypes ?? originalProductionTypes.call(this, building);
  };
  ui.updateWaveStatus = function updateSkirmishStatus() {
    if (!game.skirmish) return originalUpdateWaveStatus.call(this);
    const difficulty = game.skirmish.setup.difficultyId;
    this.e.wave.textContent = `SKIRMISH · ${difficulty.toUpperCase()} AI`;
  };
  ui.showEndgame = function showSkirmishEndgame() {
    const result = originalShowEndgame.call(this);
    if (game.skirmish && game.outcome) this.e.endgameStats.innerHTML = skirmishResultMarkup(game);
    return result;
  };

  appendSkirmishCard({ game, ui, documentTarget });

  return () => {
    ui.buildMissionCards = originalBuildMissionCards;
    ui.productionTypes = originalProductionTypes;
    ui.updateWaveStatus = originalUpdateWaveStatus;
    ui.showEndgame = originalShowEndgame;
    ui.e.cards.querySelector?.('[data-skirmish-setup]')?.remove?.();
  };
}
