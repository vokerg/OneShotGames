import { acquireBrowserStorage } from './app/browser-capabilities.js';
import { createCampaignSaveRuntime } from './app/campaign-save-runtime.js';
import { createApplicationComposition } from './app/composition-registry.js';
import { installControllerWithSimulationDelegates } from './app/controller-adapter.js';
import { createGameRuntime } from './app/runtime.js';
import './art-pass.js';
import { installActiveAudioOutput } from './audio/active-audio-output.js';
import { createAudioMixer } from './audio/audio-mixer.js';
import { createDestructionState, materializeWreck } from './combat/destruction-system.js';
import { reconcileActiveRuntimeContent } from './content/runtime-content-reconciliation.js';
import {
  SIMULATION_DELEGATE_PHASES,
  simulationDelegateSnapshot,
} from './core/simulation-delegates.js';
import './environment-art-pass.js';
import { Game } from './game.js';
import { createAttackGroundController, installAttackGroundInput } from './input/attack-ground.js';
import { installBattlefieldInput } from './input/battlefield-input.js';
import { installBuildingLifecycleControls } from './input/building-lifecycle-controls.js';
import { installConstructionPlacementInput } from './input/construction-placement-input.js';
import { installDoubleClickSelection } from './input/double-click-selection.js';
import { installProductionQueueControls } from './input/production-queue-controls.js';
import { installProductionRallyInput } from './input/production-rally-input.js';
import { createQueuedOrderController } from './input/queued-orders.js';
import { installTacticalCommandInput } from './input/tactical-command-input.js';
import { installTransportInput } from './input/transport-input.js';
import { installWorkerOverview } from './input/worker-overview.js';
import { Renderer } from './render.js';
import { installCombatReadabilityOverlay } from './render/combat-readability-overlay.js';
import { installConstructionPreview } from './render/construction-preview.js';
import { installEffectsAtlasRenderer } from './render/effects-atlas-renderer.js';
import { installSkirmishFramework } from './skirmish/skirmish-runtime.js';
import { installAuthoredOperationRuntime } from './systems/authored-operation-runtime.js';
import {
  createBuildingLifecycleController,
  updateBuildingCaptures,
} from './systems/building-lifecycle-system.js';
import { createCommandCapacityController } from './systems/command-capacity-system.js';
import { createConstructionPlacementController } from './systems/construction-placement-system.js';
import { createConstructionProgressController } from './systems/construction-progress-runtime.js';
import { createGroupConstructionController } from './systems/group-construction-runtime.js';
import { synchronizeNavigationGrid } from './systems/navigation-movement-system.js';
import { createProductionExitController } from './systems/production-exit-system.js';
import { createProductionQueueController } from './systems/production-queue-system.js';
import { createResearchQueueRuntime } from './systems/research-queue-runtime.js';
import { createResourceDropOffController } from './systems/resource-dropoff-system.js';
import { createResourceIncomeTelemetryController } from './systems/resource-income-telemetry.js';
import { SIMULATION_PHASES } from './systems/simulation-phases.js';
import {
  createStanceController,
  prepareStanceOrders,
  reconcileStanceOrders,
} from './systems/stance-system.js';
import {
  createTacticalAiController,
  updateTacticalAi,
} from './systems/tactical-ai-system.js';
import {
  createTacticalCommandController,
  prepareTacticalCommands,
  reconcileTacticalCommands,
} from './systems/tactical-command-system.js';
import { createTransportController } from './systems/transport-system.js';
import { createVeterancyController } from './systems/veterancy-system.js';
import { createWorkerGatherController } from './systems/worker-gather-system.js';
import { UI } from './ui.js';
import { installAudioSettingsAccessibility } from './audio/audio-settings-ui.js';
import { installCombatReadabilityFeedback } from './ui/combat-readability-feedback.js';
import { createCombatReadabilityController } from './ui/combat-readability-runtime.js';
import { installCommandCapacityFeedback } from './ui/command-capacity-feedback.js';
import { installEconomyHudOverview } from './ui/economy-hud-overview.js';
import { installGroupConstructionCommands } from './ui/group-construction-commands.js';
import { installMenuStackComposition } from './ui/menu-stack-composition.js';
import { installMinimapAlerts } from './ui/minimap-alerts.js';
import { installProductionExitFeedback } from './ui/production-exit-feedback.js';
import { installSelectionPanel } from './ui/selection-panel.js';
import { installSkirmishSetup } from './ui/skirmish-setup.js';
import { installStanceCommandCard } from './ui/stance-command-card.js';
import { installTacticalCommandCard } from './ui/tactical-command-card.js';
import { installTechTreeScreen } from './ui/tech-tree-screen.js';
import { installVeterancyIndicator } from './ui/veterancy-indicator.js';

function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Required UI element not found: ${selector}`);
  return element;
}

function module(name, install) {
  return Object.freeze({ name, install });
}

const canvas = requiredElement('#game');
const minimap = requiredElement('#minimap');
const portrait = requiredElement('#portrait');
const objectivesButton = requiredElement('#objectivesBtn');

const runtimeContent = reconcileActiveRuntimeContent();
const game = new Game();
const ui = new UI(game);
const renderer = new Renderer(game, canvas, minimap, portrait);
const runtime = createGameRuntime({ game, renderer, ui });
const browserStorage = acquireBrowserStorage(window);
const audioMixer = createAudioMixer();
let audioSettingsAccessibility = null;
let activeAudioOutput = null;

const modules = [
  module('attack-ground-controller', () => createAttackGroundController(game)),
  module('queued-orders-controller', () => createQueuedOrderController(game, window)),
  module('production-queue-controller', () => createProductionQueueController(game)),
  module('production-exit-controller', () => createProductionExitController(game, {
    synchronizeNavigation: synchronizeNavigationGrid,
  })),
  module('transport-controller', () => createTransportController(game, {
    synchronizeNavigation: synchronizeNavigationGrid,
  })),
  module('transport-input', () => installTransportInput({ game, ui, windowTarget: window })),
  module('construction-placement-controller', () => createConstructionPlacementController(game, {
    synchronizeNavigation: synchronizeNavigationGrid,
  })),
  module('worker-gather-controller', () => createWorkerGatherController(game)),
  module('resource-income-telemetry', () => createResourceIncomeTelemetryController(game)),
  module('resource-dropoff-controller', () => createResourceDropOffController(game, {
    synchronizeNavigation: synchronizeNavigationGrid,
  })),
  module('construction-progress-controller', () => createConstructionProgressController(game)),
  module('group-construction-controller', () => createGroupConstructionController(game)),
  module('building-lifecycle-controller', () => installControllerWithSimulationDelegates({
    game,
    name: 'building-lifecycle-controller',
    restore: ['start', 'addBuilding', 'removeDestroyedEntities'],
    install: () => createBuildingLifecycleController(game, {
      destructionApi: { createDestructionState, materializeWreck },
    }),
    delegates: [
      {
        phase: SIMULATION_DELEGATE_PHASES.BUILDING_LIFECYCLE,
        id: 'capture',
        run: (_game, stepSeconds) => updateBuildingCaptures(game, stepSeconds),
      },
    ],
  })),
  module('tactical-ai-controller', () => installControllerWithSimulationDelegates({
    game,
    name: 'tactical-ai-controller',
    restore: ['start'],
    install: () => createTacticalAiController(game),
    delegates: [
      {
        phase: SIMULATION_DELEGATE_PHASES.TACTICAL_PREPARE,
        id: 'plan',
        order: -100,
        run: () => updateTacticalAi(game),
      },
    ],
  })),
  module('skirmish-framework', () => installSkirmishFramework(game)),
  module('stance-controller', () => installControllerWithSimulationDelegates({
    game,
    name: 'stance-controller',
    restore: ['addUnit', 'start', 'toggleAutoFire'],
    install: () => createStanceController(game),
    delegates: [
      {
        phase: SIMULATION_DELEGATE_PHASES.STANCE_PREPARE,
        id: 'prepare',
        run: () => prepareStanceOrders(game),
      },
      {
        phase: SIMULATION_DELEGATE_PHASES.STANCE_RECONCILE,
        id: 'reconcile',
        run: () => reconcileStanceOrders(game),
      },
    ],
  })),
  module('tactical-command-controller', () => installControllerWithSimulationDelegates({
    game,
    name: 'tactical-command-controller',
    restore: ['issue', 'stopSelected', 'start'],
    install: () => createTacticalCommandController(game),
    delegates: [
      {
        phase: SIMULATION_DELEGATE_PHASES.TACTICAL_PREPARE,
        id: 'prepare',
        run: () => prepareTacticalCommands(game),
      },
      {
        phase: SIMULATION_DELEGATE_PHASES.TACTICAL_RECONCILE,
        id: 'reconcile',
        run: () => reconcileTacticalCommands(game),
      },
    ],
  })),
  module('veterancy-controller', () => createVeterancyController(game)),
  module('research-queue-controller', () => createResearchQueueRuntime(game)),
  module('command-capacity-controller', () => installControllerWithSimulationDelegates({
    game,
    name: 'command-capacity-controller',
    restore: ['start'],
    install: () => createCommandCapacityController(game),
    delegates: [
      {
        phase: SIMULATION_DELEGATE_PHASES.COMMAND_CAPACITY,
        id: 'reconcile',
        run: () => game.reconcileCommandCapacity?.('simulation-step'),
      },
    ],
  })),
  module('combat-readability-controller', () => createCombatReadabilityController(game, {
    storage: browserStorage,
  })),
  module('audio-settings-accessibility', () => {
    const installed = installAudioSettingsAccessibility({
      mixer: audioMixer,
      events: game.events ?? game.domainEvents ?? null,
      storage: browserStorage,
      documentTarget: document,
      windowTarget: window,
    });
    audioSettingsAccessibility = installed;
    return () => {
      if (audioSettingsAccessibility === installed) audioSettingsAccessibility = null;
      installed.dispose();
    };
  }),
  module('active-audio-output', () => {
    const installed = installActiveAudioOutput({
      mixer: audioMixer,
      events: game.events ?? game.domainEvents ?? null,
      game,
      documentTarget: document,
      windowTarget: window,
    });
    activeAudioOutput = installed;
    return () => {
      if (activeAudioOutput === installed) activeAudioOutput = null;
      installed.dispose();
    };
  }),
  module('production-queue-controls', () => installProductionQueueControls({ game, ui })),
  module('tactical-command-card', () => installTacticalCommandCard(ui)),
  module('stance-command-card', () => installStanceCommandCard(ui)),
  module('group-construction-commands', () => installGroupConstructionCommands(ui)),
  module('veterancy-indicator', () => installVeterancyIndicator({ game, ui })),
  module('selection-panel', () => installSelectionPanel({ game, ui })),
  module('production-exit-feedback', () => installProductionExitFeedback({ game, ui })),
  module('worker-overview', () => installWorkerOverview({ game, ui, windowTarget: window })),
  module('command-capacity-feedback', () => installCommandCapacityFeedback({ game, ui })),
  module('building-lifecycle-controls', () => installBuildingLifecycleControls({ game, ui })),
  module('combat-readability-feedback', () => installCombatReadabilityFeedback({ game, ui })),
  module('economy-hud-overview', () => installEconomyHudOverview({ game, ui })),
  module('minimap-alerts', () => installMinimapAlerts({ game, ui, renderer, minimap })),
  module('tech-tree-screen', () => installTechTreeScreen({ game, ui })),
  module('authored-operation-runtime', () => installAuthoredOperationRuntime(game)),
  module('menu-stack', () => installMenuStackComposition({
    game,
    ui,
    runtime,
    storage: browserStorage,
    createSaveRuntime: createCampaignSaveRuntime,
    audioSettings: () => audioSettingsAccessibility,
    documentTarget: document,
    windowTarget: window,
  })),
  module('skirmish-setup', () => installSkirmishSetup({ game, ui, documentTarget: document })),
  module('construction-preview', () => installConstructionPreview({ game, renderer })),
  module('effects-atlas-renderer', () => installEffectsAtlasRenderer({ game, renderer })),
  module('combat-readability-overlay', () => installCombatReadabilityOverlay({ game, renderer })),
  module('construction-placement-input', () => installConstructionPlacementInput({ game, ui })),
  module('attack-ground-input', () => installAttackGroundInput({ game, canvas, ui })),
  module('tactical-command-input', () => installTacticalCommandInput({ game, ui, canvas })),
  module('production-rally-input', () => installProductionRallyInput({ game, ui, canvas })),
  module('battlefield-input', () => installBattlefieldInput({ game, ui, canvas, minimap })),
  module('double-click-selection', () => installDoubleClickSelection({ game, ui, canvas })),
  module('mission-ui', () => {
    const previousCards = ui.e.cards.innerHTML;
    const previousRetry = ui.e.retry.onclick;
    const previousOperations = ui.e.operations.onclick;
    const toggleObjectives = () => ui.e.objectives.classList.toggle('hidden');

    ui.buildMissionCards(runtime.startMission);
    ui.setEndgameActions({
      retry: () => runtime.startMission(game.missionIndex),
      operations: () => {
        game.mission = null;
        ui.showMissionSelect();
      },
    });
    objectivesButton.addEventListener('click', toggleObjectives);

    return () => {
      objectivesButton.removeEventListener('click', toggleObjectives);
      ui.e.retry.onclick = previousRetry;
      ui.e.operations.onclick = previousOperations;
      ui.e.cards.innerHTML = previousCards;
    };
  }),
  module('runtime', () => {
    runtime.start();
    return () => runtime.stop();
  }),
];

const composition = createApplicationComposition({
  context: { game, ui, renderer, runtime, audioMixer },
  modules,
});
composition.install();

const previousDiagnostic = window.__fieldsOfResolveComposition;
window.__fieldsOfResolveComposition = Object.freeze({
  installedModules: () => composition.installedModules(),
  simulationPhases: () => SIMULATION_PHASES,
  simulationDelegates: () => simulationDelegateSnapshot(game),
  runtimeContent: () => runtimeContent,
  audio: () => Object.freeze({
    mixer: audioMixer.snapshot(),
    output: activeAudioOutput?.snapshot() ?? null,
    settings: audioSettingsAccessibility?.snapshot() ?? null,
  }),
});

addEventListener(
  'pagehide',
  () => {
    try {
      composition.dispose();
    } finally {
      if (previousDiagnostic === undefined) delete window.__fieldsOfResolveComposition;
      else window.__fieldsOfResolveComposition = previousDiagnostic;
    }
  },
  { once: true },
);
