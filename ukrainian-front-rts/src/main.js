import { createGameRuntime } from './app/runtime.js';
import './art-pass.js';
import './environment-art-pass.js';
import { Game } from './game.js';
import { createAttackGroundController, installAttackGroundInput } from './input/attack-ground.js';
import { installBattlefieldInput } from './input/battlefield-input.js';
import { installConstructionPlacementInput } from './input/construction-placement-input.js';
import { createQueuedOrderController } from './input/queued-orders.js';
import { synchronizeNavigationGrid } from './systems/navigation-movement-system.js';
import { Renderer } from './render.js';
import { installConstructionPreview } from './render/construction-preview.js';
import { createConstructionPlacementController } from './systems/construction-placement-system.js';
import { createWorkerGatherController } from './systems/worker-gather-system.js';
import { UI } from './ui.js';

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
const disposeConstructionPlacement = createConstructionPlacementController(game, {
  synchronizeNavigation: synchronizeNavigationGrid,
});
const disposeWorkerGather = createWorkerGatherController(game);
const disposeConstructionPreview = installConstructionPreview({ game, renderer });
const disposeConstructionPlacementInput = installConstructionPlacementInput({ game, ui });
const disposeAttackGroundInput = installAttackGroundInput({ game, canvas, ui });
const disposeInput = installBattlefieldInput({ game, ui, canvas, minimap });

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
    disposeInput();
    disposeAttackGroundInput();
    disposeConstructionPlacementInput();
    disposeConstructionPreview();
    disposeWorkerGather();
    disposeConstructionPlacement();
    disposeQueuedOrders();
    disposeAttackGround();
    runtime.stop();
  },
  { once: true },
);
