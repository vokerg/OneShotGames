import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTROL_GROUP_COMMANDS,
  createControlGroupController,
  resolveControlGroupCommand,
} from '../../src/input/control-groups.js';

function makeGame() {
  const units = [
    { id: 1, team: 0, x: 100, y: 120, selected: false },
    { id: 2, team: 0, x: 300, y: 320, selected: false },
    { id: 3, team: 1, x: 900, y: 900, selected: false },
  ];
  return {
    units,
    buildings: [],
    selected: new Set(),
    camera: { x: 0, y: 0, z: 1 },
    select(entity, add = false) {
      if (!add) {
        this.selected.clear();
        for (const unit of this.units) unit.selected = false;
      }
      if (!entity) return;
      if (add && this.selected.has(entity.id)) {
        this.selected.delete(entity.id);
        entity.selected = false;
        return;
      }
      this.selected.add(entity.id);
      entity.selected = true;
    },
  };
}

function command(command, slot = 1) {
  return { command, slot };
}

test('resolves assignment, additive assignment, recall, and reserved modifiers', () => {
  assert.deepEqual(
    resolveControlGroupCommand({ key: '1', code: 'Digit1', ctrlKey: true }),
    command(CONTROL_GROUP_COMMANDS.ASSIGN),
  );
  assert.deepEqual(
    resolveControlGroupCommand({ key: '@', code: 'Digit2', ctrlKey: true, shiftKey: true }),
    command(CONTROL_GROUP_COMMANDS.ADD, 2),
  );
  assert.deepEqual(
    resolveControlGroupCommand({ key: '#', code: 'Digit3', shiftKey: true }),
    command(CONTROL_GROUP_COMMANDS.ADD, 3),
  );
  assert.deepEqual(
    resolveControlGroupCommand({ key: '4', code: 'Digit4' }),
    command(CONTROL_GROUP_COMMANDS.RECALL, 4),
  );
  assert.equal(resolveControlGroupCommand({ key: '0', code: 'Digit0' }), null);
  assert.equal(resolveControlGroupCommand({ key: '1', code: 'Digit1', altKey: true }), null);
  assert.equal(resolveControlGroupCommand({ key: '1', code: 'Digit1', metaKey: true }), null);
});

test('assigns and recalls only selected friendly units', () => {
  const game = makeGame();
  const controller = createControlGroupController();
  game.selected.add(1);
  game.selected.add(3);

  const assigned = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.ASSIGN),
    { width: 800, height: 600 },
  );
  assert.equal(assigned.changed, true);
  assert.deepEqual(controller.members(1), [1]);

  game.select(game.units[1]);
  controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.RECALL),
    { width: 800, height: 600 },
  );
  assert.deepEqual([...game.selected], [1]);
  assert.equal(game.units[0].selected, true);
  assert.equal(game.units[1].selected, false);
});

test('adds members without duplicates and leaves current selection intact', () => {
  const game = makeGame();
  const controller = createControlGroupController();
  game.select(game.units[0]);
  controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.ASSIGN),
    { width: 800, height: 600 },
  );

  game.select(game.units[1]);
  const added = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.ADD),
    { width: 800, height: 600 },
  );
  assert.equal(added.changed, true);
  assert.deepEqual(controller.members(1), [1, 2]);
  assert.deepEqual([...game.selected], [2]);

  const duplicate = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.ADD),
    { width: 800, height: 600 },
  );
  assert.equal(duplicate.changed, false);
  assert.deepEqual(controller.members(1), [1, 2]);
});

test('cleans destroyed or invalid members deterministically before recall', () => {
  const game = makeGame();
  const controller = createControlGroupController();
  game.selected.add(1);
  game.selected.add(2);
  controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.ASSIGN),
    { width: 800, height: 600 },
  );

  game.units = game.units.filter((unit) => unit.id !== 1);
  game.units.find((unit) => unit.id === 2).team = 1;
  const recalled = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.RECALL),
    { width: 800, height: 600 },
  );

  assert.equal(recalled.changed, false);
  assert.deepEqual(controller.members(1), []);
});

test('double recall focuses the camera on the stable group centroid', () => {
  const game = makeGame();
  const times = [1000, 1200];
  const controller = createControlGroupController({ now: () => times.shift(), doubleTapMs: 350 });
  game.selected.add(1);
  game.selected.add(2);
  controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.ASSIGN),
    { width: 800, height: 600 },
  );

  const first = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.RECALL),
    { width: 800, height: 600 },
  );
  assert.equal(first.focused, false);
  assert.deepEqual(game.camera, { x: 0, y: 0, z: 1 });

  const second = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.RECALL),
    { width: 800, height: 600 },
  );
  assert.equal(second.focused, true);
  assert.deepEqual(game.camera, { x: 200, y: 80, z: 1 });
});

test('empty assignment and recall return actionable feedback', () => {
  const game = makeGame();
  const controller = createControlGroupController();
  const assigned = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.ASSIGN),
    { width: 800, height: 600 },
  );
  const recalled = controller.execute(
    game,
    command(CONTROL_GROUP_COMMANDS.RECALL),
    { width: 800, height: 600 },
  );

  assert.match(assigned.message, /needs selected units/);
  assert.match(recalled.message, /is empty/);
});
