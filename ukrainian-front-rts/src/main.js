import { createGameRuntime } from './app/runtime.js';
import './art-pass.js';
import './environment-art-pass.js';
import { installBattlefieldInput } from './input/battlefield-input.js';
import { ProductionGame } from './production-game.js';
import { installProductionRallyInput } from './production-rally-input.js';
import { installProductionRenderer } from './production-render.js';
import { installProductionUI } from './production-ui.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Required UI element not found: ${selector}`);
  return element;
}

installProductionUI(UI);
installProductionRenderer(Renderer);

const canvas = requiredElement('#game');
const minimap = requiredElement('#minimap');
const portrait = requiredElement('#portrait');
const objectivesButton = requiredElement('#objectivesBtn');

const game = new ProductionGame();
const ui = new UI(game);
const renderer = new Renderer(game, canvas, minimap, portrait);
const runtime = createGameRuntime({ game, renderer, ui });
const disposeInput = installBattlefieldInput({ game, ui, canvas, minimap });
const disposeRallyInput = installProductionRallyInput({ game, ui, canvas });

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
    disposeRallyInput();
    disposeInput();
    runtime.stop();
  },
  { once: true },
);
