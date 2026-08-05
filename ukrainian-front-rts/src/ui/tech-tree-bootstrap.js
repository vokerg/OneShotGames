import { UI } from '../ui.js';
import { installTechTreeScreen } from './tech-tree-screen.js';

const installations = new WeakMap();
const originalBuildMissionCards = UI.prototype.buildMissionCards;

UI.prototype.buildMissionCards = function buildMissionCardsWithTechTree(...args) {
  if (!installations.has(this)) {
    const dispose = installTechTreeScreen({ game: this.g, ui: this });
    installations.set(this, dispose);
    globalThis.addEventListener?.('pagehide', dispose, { once: true });
  }
  return originalBuildMissionCards.apply(this, args);
};
