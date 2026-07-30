import { createGameRuntime } from './app/runtime.js';
import './art-pass.js';
import './environment-art-pass.js';
import { Game } from './game.js';
import { createAttackGroundController, installAttackGroundInput } from './input/attack-ground.js';
import { installBattlefieldInput } from './input/battlefield-input.js';
import { installConstructionPlacementInput } from './input/construction-placement-input.js';
import { installDoubleClickSelection } from './input/double-click-selection.js';
import { installProductionQueueControls } from './input/production-queue-controls.js';
import { installProductionRallyInput } from './input/production-rally-input.js';
import { createQueuedOrderController } from './input/queued-orders.js';
import { installTacticalCommandInput } from './input/tactical-command-input.js';
import { installTransportInput } from './input/transport-input.js';
import { installWorkerOverview } from './input/worker-overview.js';
import { synchronizeNavigationGrid } from './systems/navigation-movement-system.js';
import { Renderer } from './render.js';
import { installConstructionPreview } from './render/construction-preview.js';
import { createConstructionPlacementController } from './systems/construction-placement-system.js';
import { createConstructionProgressController } from './systems/construction-progress-runtime.js';
import { createProductionExitController } from './systems/production-exit-system.js';
import { createProductionQueueController } from './systems/production-queue-system.js';
import { createResourceDropOffController } from './systems/resource-dropoff-system.js';
import { createStanceController } from './systems/stance-system.js';
import { createTacticalCommandController } from './systems/tactical-command-system.js';
import { createTransportController } from './systems/transport-system.js';
import { createVeterancyController } from './systems/veterancy-system.js';
import { createWorkerGatherController } from './systems/worker-gather-system.js';
import { UI } from './ui.js';
import { installProductionExitFeedback } from './ui/production-exit-feedback.js';
import { installStanceCommandCard } from './ui/stance-command-card.js';
import { installTacticalCommandCard } from './ui/tactical-command-card.js';
import { installVeterancyIndicator } from './ui/veterancy-indicator.js';

function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Required UI element not found: ${selector}`);
  return element;
}

const canvas = requiredElement('#game');
const minimap = requiredElement('#minimap');
const portrait = requiredElement('#portrait');
const objectivesButton = requiredElement('#objectivesBtn');

const game = new Game();
const ui = new UI(game);
const renderer = new Renderer(game, canvas, minimap, portrait);
const runtime = createGameRuntime({ game, renderer, ui });
const disposeAttackGround = createAttackGroundController(game);
const disposeQueuedOrders = createQueuedOrderController(game, window);
const disposeProductionQueue = createProductionQueueController(game);
const disposeProductionExits = createProductionExitController(game, {
  synchronizeNavigation: synchronizeNavigationGrid,
});
const disposeTransport = createTransportController(game, {
  synchronizeNavigation: synchronizeNavigationGrid,
});
const disposeTransportInput = installTransportInput({ game, ui, windowTarget: window });
const disposeConstructionPlacement = createConstructionPlacementController(game, {
  synchronizeNavigation: synchronizeNavigationGrid,
});
const disposeWorkerGather = createWorkerGatherController(game);
const disposeResourceDropOff = createResourceDropOffController(game, {
  synchronizeNavigation: synchronizeNavigationGrid,
});
const disposeConstructionProgress = createConstructionProgressController(game);
const disposeStances = createStanceController(game);
const disposeTacticalCommands = createTacticalCommandController(game);
const disposeVeterancy = createVeterancyController(game);
const disposeProductionQueueControls = installProductionQueueControls({ game, ui });
const disposeTacticalCommandCard = installTacticalCommandCard(ui);
const disposeStanceCommandCard = installStanceCommandCard(ui);
const disposeVeterancyIndicator = installVeterancyIndicator({ game, ui });
const disposeProductionExitFeedback = installProductionExitFeedback({ game, ui });
const disposeWorkerOverview = installWorkerOverview({ game, ui, windowTarget: window });
const disposeConstructionPreview = installConstructionPreview({ game, renderer });
const disposeConstructionPlacementInput = installConstructionPlacementInput({ game, ui });
const disposeAttackGroundInput = installAttackGroundInput({ game, canvas, ui });
const disposeTacticalCommandInput = installTacticalCommandInput({ game, ui, canvas });
const disposeProductionRallyInput = installProductionRallyInput({ game, ui, canvas });
const disposeInput = installBattlefieldInput({ game, ui, canvas, minimap });
const disposeDoubleClickSelection = installDoubleClickSelection({ game, ui, canvas });

ui.buildMissionCards(runtime.startMission);
ui.setEndgameActions({
  retry: () => runtime.startMission(game.missionIndex),
  operations: () => {
    game.mission = null;
    ui.showMissionSelect();
  },
});
objectivesButton.addEventListener('click', () => ui.e.objectives.classList.toggle('hidden'));
runtime.start();

addEventListener(
  'pagehide',
  () => {
    disposeDoubleClickSelection();
    disposeInput();
    disposeProductionRallyInput();
    disposeTacticalCommandInput();
    disposeAttackGroundInput();
    disposeConstructionPlacementInput();
    disposeConstructionPreview();
    disposeWorkerOverview();
    disposeProductionExitFeedback();
    disposeVeterancyIndicator();
    disposeStanceCommandCard();
    disposeTacticalCommandCard();
    disposeProductionQueueControls();
    disposeVeterancy();
    disposeTacticalCommands();
    disposeStances();
    disposeConstructionProgress();
    disposeResourceDropOff();
    disposeWorkerGather();
    disposeConstructionPlacement();
    disposeTransportInput();
    disposeTransport();
    disposeProductionExits();
    disposeProductionQueue();
    disposeQueuedOrders();
    disposeAttackGround();
    runtime.stop();
  },
  { once: true },
);
