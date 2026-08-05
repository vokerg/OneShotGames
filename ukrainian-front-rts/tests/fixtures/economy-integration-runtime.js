import { installControllerWithSimulationDelegates } from '../../src/app/controller-adapter.js';
import { createSimulationHarness } from '../../src/app/simulation-harness.js';
import { createDestructionState, materializeWreck } from '../../src/combat/destruction-system.js';
import { reconcileActiveRuntimeContent } from '../../src/content/runtime-content-reconciliation.js';
import { SIMULATION_DELEGATE_PHASES } from '../../src/core/simulation-delegates.js';
import { Game } from '../../src/game.js';
import {
  createBuildingLifecycleController,
  updateBuildingCaptures,
} from '../../src/systems/building-lifecycle-system.js';
import { createCommandCapacityController } from '../../src/systems/command-capacity-system.js';
import { createConstructionPlacementController } from '../../src/systems/construction-placement-system.js';
import { createConstructionProgressController } from '../../src/systems/construction-progress-runtime.js';
import { synchronizeNavigationGrid } from '../../src/systems/navigation-movement-system.js';
import { createProductionExitController } from '../../src/systems/production-exit-system.js';
import { createProductionQueueController } from '../../src/systems/production-queue-system.js';
import { createResearchQueueRuntime } from '../../src/systems/research-queue-runtime.js';
import { createResourceDropOffController } from '../../src/systems/resource-dropoff-system.js';
import { createResourceIncomeTelemetryController } from '../../src/systems/resource-income-telemetry.js';
import {
  createTacticalCommandController,
  prepareTacticalCommands,
  reconcileTacticalCommands,
} from '../../src/systems/tactical-command-system.js';
import { createWorkerGatherController } from '../../src/systems/worker-gather-system.js';

function install(disposers, installer) {
  const dispose = installer();
  if (typeof dispose === 'function') disposers.push(dispose);
}

function installEconomyRuntime(game) {
  const disposers = [];

  install(disposers, () => createProductionQueueController(game));
  install(disposers, () => createProductionExitController(game, {
    synchronizeNavigation: synchronizeNavigationGrid,
  }));
  install(disposers, () => createConstructionPlacementController(game, {
    synchronizeNavigation: synchronizeNavigationGrid,
  }));
  install(disposers, () => createWorkerGatherController(game));
  install(disposers, () => createResourceIncomeTelemetryController(game));
  install(disposers, () => createResourceDropOffController(game, {
    synchronizeNavigation: synchronizeNavigationGrid,
  }));
  install(disposers, () => createConstructionProgressController(game));
  install(disposers, () => installControllerWithSimulationDelegates({
    game,
    name: 'economy-integration-building-lifecycle',
    restore: ['start', 'addBuilding', 'removeDestroyedEntities'],
    install: () => createBuildingLifecycleController(game, {
      destructionApi: { createDestructionState, materializeWreck },
    }),
    delegates: [{
      phase: SIMULATION_DELEGATE_PHASES.BUILDING_LIFECYCLE,
      id: 'capture',
      run: (_game, stepSeconds) => updateBuildingCaptures(game, stepSeconds),
    }],
  }));
  install(disposers, () => installControllerWithSimulationDelegates({
    game,
    name: 'economy-integration-tactical-command',
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
  }));
  install(disposers, () => createResearchQueueRuntime(game));
  install(disposers, () => installControllerWithSimulationDelegates({
    game,
    name: 'economy-integration-command-capacity',
    restore: ['start'],
    install: () => createCommandCapacityController(game),
    delegates: [{
      phase: SIMULATION_DELEGATE_PHASES.COMMAND_CAPACITY,
      id: 'reconcile',
      run: () => game.reconcileCommandCapacity?.('simulation-step'),
    }],
  }));

  let active = true;
  return () => {
    if (!active) return false;
    active = false;
    for (const dispose of [...disposers].reverse()) dispose();
    return true;
  };
}

export function createEconomyIntegrationScenario({
  missionIndex = 0,
  seed = 'ufr-068-economy-integration',
  tickSeconds = 1 / 10,
} = {}) {
  reconcileActiveRuntimeContent();
  let disposeRuntime = null;
  const harness = createSimulationHarness({
    tickSeconds,
    gameFactory: () => {
      const game = new Game();
      disposeRuntime = installEconomyRuntime(game);
      return game;
    },
  });
  harness.startScenario({ missionIndex, seed });
  harness.game.enemy.clock = Number.POSITIVE_INFINITY;

  let active = true;
  return Object.freeze({
    harness,
    game: harness.game,
    dispose() {
      if (!active) return false;
      active = false;
      return disposeRuntime?.() ?? false;
    },
  });
}
