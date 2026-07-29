import { BUILDING_TYPES, MISSIONS, TEAM, UNIT_TYPES, UPGRADES, WORLD } from './config.js';
import { clamp, distance, randomBetween } from './core/math.js';
import { updateMissionObjectives } from './systems/objective-system.js';
import { updateProjectiles } from './systems/projectile-system.js';
import { runSimulationStep } from './systems/simulation-phases.js';
import { spawnEnemyWave } from './systems/wave-system.js';

const COMBAT_ORDER_KINDS = new Set(['attack', 'attackMove']);

export class Game {
  constructor() {
    this.camera = { x: 70, y: 760, z: 0.85 };
    this.keys = new Set();
    this.mouse = {
      x: 0,
      y: 0,
      wx: 0,
      wy: 0,
      down: false,
      drag: false,
      startX: 0,
      startY: 0,
      attackMove: false,
    };
    this.units = [];
    this.buildings = [];
    this.nodes = [];
    this.projectiles = [];
    this.effects = [];
    this.selected = new Set();
    this.nextId = 1;
    this.time = 0;
    this.wave = 0;
    this.gameOver = false;
    this.outcome = null;
    this.endReason = '';
    this.lastError = '';
    this.pendingBuild = null;
    this.terrain = [];
    this.road = [
      [120, 1400],
      [540, 1240],
      [960, 1010],
      [1330, 780],
      [1760, 520],
      [2300, 260],
    ];
    this.mission = null;
    this.missionIndex = 0;
  }

  start(index = 0) {
    this.missionIndex = index;
    this.mission = MISSIONS[index];
    this.units = [];
    this.buildings = [];
    this.nodes = [];
    this.projectiles = [];
    this.effects = [];
    this.selected.clear();
    this.nextId = 1;
    this.time = 0;
    this.wave = 0;
    this.gameOver = false;
    this.outcome = null;
    this.endReason = '';
    this.lastError = '';
    this.pendingBuild = null;
    this.mouse.attackMove = false;
    this.player = {
      ...this.mission.start,
      pop: 0,
      cap: 14,
      mined: 0,
      objectives: [false, false, false],
      upgrades: new Set(),
    };
    this.enemy = {
      clock: this.mission.waves.firstDelay,
      pausedForCap: false,
    };
    this.terrain = [];

    for (let y = 0; y < WORLD.h / 32; y += 1) {
      for (let x = 0; x < WORLD.w / 32; x += 1) {
        const noise = Math.sin(x * 0.41) + Math.cos(y * 0.31) + Math.sin((x + y) * 0.17);
        this.terrain.push(noise > 1.35 ? 2 : noise < -1.48 ? 1 : 0);
      }
    }

    this.nodes.push(
      { x: 490, y: 1280, kind: 'metal', amount: 1600, maxAmount: 1600, label: 'Salvage Yard' },
      { x: 760, y: 1180, kind: 'fuel', amount: 1100, maxAmount: 1100, label: 'Fuel Point' },
      { x: 1120, y: 850, kind: 'intel', amount: 900, maxAmount: 900, label: 'Signals Relay' },
      { x: 1570, y: 600, kind: 'metal', amount: 1800, maxAmount: 1800, label: 'Industrial Site' },
      { x: 1900, y: 420, kind: 'fuel', amount: 1200, maxAmount: 1200, label: 'Forward Fuel Base' },
    );

    this.uaHQ = this.addBuilding('hq', TEAM.UA, 230, 1390);
    this.addBuilding('depot', TEAM.UA, 350, 1330);
    this.addBuilding('barracks', TEAM.UA, 430, 1430);
    this.ruHQ = this.addBuilding('hq', TEAM.RU, 2300, 260);
    this.addBuilding('barracks', TEAM.RU, 2170, 340);
    this.addBuilding('workshop', TEAM.RU, 2230, 175);

    [
      ['uaEngineer', 320, 1380],
      ['uaEngineer', 355, 1410],
      ['uaInfantry', 470, 1360],
      ['uaInfantry', 500, 1410],
    ].forEach(([type, x, y]) => this.addUnit(type, TEAM.UA, x, y));

    for (const heroType of this.mission.heroes) {
      this.addUnit(
        heroType,
        TEAM.UA,
        390 + randomBetween(-25, 25),
        1290 + randomBetween(-20, 20),
      );
    }

    [
      ['ruInfantry', 2110, 280],
      ['ruInfantry', 2070, 330],
      ['ruIfv', 2140, 300],
      ['ruTank', 2210, 245],
    ].forEach(([type, x, y]) => this.addUnit(type, TEAM.RU, x, y));

    for (const heroType of this.mission.enemyHeroes) {
      this.addUnit(
        heroType,
        TEAM.RU,
        2210 + randomBetween(-20, 20),
        390 + randomBetween(-20, 20),
      );
    }

    this.camera = {
      x: innerWidth / 2 - 390 * 0.85,
      y: innerHeight / 2 - 1320 * 0.85,
      z: 0.85,
    };
  }

  fail(message) {
    this.lastError = message;
    return false;
  }

  unitStats(type) {
    const base = UNIT_TYPES[type];
    const stats = { ...base };

    for (const upgradeId of this.player?.upgrades || []) {
      const upgrade = UPGRADES[upgradeId];
      if (!base.vehicleClass || !upgrade.applies.includes(base.vehicleClass)) continue;
      if (upgrade.mods.hp) stats.hp *= upgrade.mods.hp;
      if (upgrade.mods.range) stats.range *= upgrade.mods.range;
      if (upgrade.mods.damage) stats.damage *= upgrade.mods.damage;
      if (upgrade.mods.speed) stats.speed *= upgrade.mods.speed;
      if (upgrade.mods.rate) stats.rate *= upgrade.mods.rate;
      if (upgrade.mods.sight) stats.sight += upgrade.mods.sight;
    }

    return stats;
  }

  addUnit(type, team, x, y) {
    const stats = team === TEAM.UA ? this.unitStats(type) : UNIT_TYPES[type];
    const unit = {
      id: this.nextId++,
      type,
      team,
      x,
      y,
      hp: stats.hp,
      maxHp: stats.hp,
      cool: randomBetween(0, 0.4),
      abilityCd: {},
      order: null,
      target: null,
      selected: false,
      angle: 0,
      flash: 0,
      carry: 0,
      carryKind: null,
      buffs: {},
      kills: 0,
      autoFire: true,
      waveSpawned: false,
      waveId: null,
    };
    this.units.push(unit);
    if (team === TEAM.UA) this.player.pop += stats.pop || 0;
    return unit;
  }

  addBuilding(type, team, x, y, { underConstruction = false } = {}) {
    const stats = BUILDING_TYPES[type];
    const building = {
      id: this.nextId++,
      type,
      team,
      x,
      y,
      hp: underConstruction ? Math.min(80, stats.hp * 0.12) : stats.hp,
      maxHp: stats.hp,
      selected: false,
      queue: [],
      underConstruction,
      capacityGranted: !underConstruction,
    };
    this.buildings.push(building);
    if (team === TEAM.UA && building.capacityGranted) this.player.cap += stats.pop || 0;
    return building;
  }

  worldPos(x, y) {
    return { x: (x - this.camera.x) / this.camera.z, y: (y - this.camera.y) / this.camera.z };
  }

  selectedEntities() {
    return [...this.units, ...this.buildings].filter((entity) => this.selected.has(entity.id));
  }

  selectedUnits() {
    return this.units.filter((unit) => unit.team === TEAM.UA && this.selected.has(unit.id));
  }

  hit(x, y) {
    return [...this.units, ...this.buildings]
      .sort((a, b) => b.y - a.y)
      .find(
        (entity) =>
          distance({ x, y }, entity) <
          (entity.maxHp > 500 ? 48 : (UNIT_TYPES[entity.type]?.size || 12) + 8),
      );
  }

  select(entity, add = false) {
    if (!add) {
      this.selected.clear();
      [...this.units, ...this.buildings].forEach((candidate) => {
        candidate.selected = false;
      });
    }

    if (!entity) return;
    if (add && this.selected.has(entity.id)) {
      this.selected.delete(entity.id);
      entity.selected = false;
      return;
    }

    this.selected.add(entity.id);
    entity.selected = true;
  }

  armAttackMove() {
    this.lastError = '';
    if (!this.selectedUnits().length) return this.fail('Select at least one Ukrainian unit first.');
    this.pendingBuild = null;
    this.mouse.attackMove = true;
    return true;
  }

  stopSelected() {
    this.lastError = '';
    const units = this.selectedUnits();
    if (!units.length) return this.fail('Select at least one Ukrainian unit first.');
    for (const unit of units) {
      unit.order = null;
      unit.target = null;
    }
    this.mouse.attackMove = false;
    return true;
  }

  toggleAutoFire() {
    this.lastError = '';
    const units = this.selectedUnits().filter((unit) => this.unitStats(unit.type).damage > 0);
    if (!units.length) return this.fail('The selected group has no weapon systems to toggle.');
    const nextState = units.some((unit) => !unit.autoFire);
    units.forEach((unit) => {
      unit.autoFire = nextState;
      if (!nextState) unit.target = null;
    });
    return nextState;
  }

  issue(x, y, target) {
    const units = this.selectedUnits();
    if (!units.length || this.gameOver) return false;
    this.pendingBuild = null;

    if (target && target.team === TEAM.RU) {
      units.forEach((unit) => {
        unit.order = { kind: 'attack', target };
        unit.target = target;
      });
      this.mouse.attackMove = false;
      return true;
    }

    const columns = Math.ceil(Math.sqrt(units.length));
    units.forEach((unit, index) => {
      unit.target = null;
      unit.order = {
        kind: this.mouse.attackMove ? 'attackMove' : 'move',
        x: x + ((index % columns) - (columns - 1) / 2) * 34,
        y: y + (Math.floor(index / columns) - Math.floor(units.length / columns) / 2) * 34,
      };
    });
    this.mouse.attackMove = false;
    return true;
  }

  canAfford(cost) {
    return Object.entries(cost || {}).every(([resource, amount]) => this.player[resource] >= amount);
  }

  pay(cost) {
    for (const [resource, amount] of Object.entries(cost || {})) {
      this.player[resource] -= amount;
    }
  }

  research(id) {
    this.lastError = '';
    const upgrade = UPGRADES[id];
    if (!upgrade) return this.fail('Unknown modernization project.');
    if (this.player.upgrades.has(id)) return this.fail('That modernization is already complete.');
    if (upgrade.requires && !this.player.upgrades.has(upgrade.requires)) {
      return this.fail('Complete the prerequisite modernization first.');
    }
    if (!this.canAfford(upgrade.cost)) return this.fail('Insufficient resources for this modernization.');

    this.pay(upgrade.cost);
    this.player.upgrades.add(id);
    for (const unit of this.units.filter((candidate) => candidate.team === TEAM.UA)) {
      const previousMaxHp = unit.maxHp;
      const nextMaxHp = this.unitStats(unit.type).hp;
      if (nextMaxHp !== previousMaxHp) {
        unit.maxHp = nextMaxHp;
        unit.hp = Math.min(nextMaxHp, unit.hp + (nextMaxHp - previousMaxHp));
      }
    }
    return true;
  }

  buildingCanProduce(building, type) {
    const stats = UNIT_TYPES[type];
    const buildingStats = BUILDING_TYPES[building?.type];
    if (!stats || !buildingStats) return false;
    if (buildingStats.produces?.includes(type)) return true;
    return building.type === 'hq' && stats.hero && this.mission.trainableHeroes.includes(type);
  }

  heroAlreadyFieldedOrQueued(type) {
    return (
      this.units.some((unit) => unit.team === TEAM.UA && unit.type === type) ||
      this.buildings.some((building) => building.queue.some((item) => item.type === type))
    );
  }

  queue(type) {
    this.lastError = '';
    const building = this.selectedEntities()[0];
    const stats = UNIT_TYPES[type];
    if (!building || building.team !== TEAM.UA || !BUILDING_TYPES[building.type]) {
      return this.fail('Select the Ukrainian production building that should train this unit.');
    }
    if (building.underConstruction) return this.fail('Finish constructing this facility first.');
    if (!stats || stats.faction !== 'ukraine' || !this.buildingCanProduce(building, type)) {
      return this.fail('This facility cannot produce that unit type.');
    }
    if (stats.hero && this.heroAlreadyFieldedOrQueued(type)) {
      return this.fail('That command hero is already deployed or queued.');
    }
    if (building.queue.length >= 5) return this.fail('Production queue is full.');
    if (!this.canAfford(stats.cost)) return this.fail('Insufficient resources for production.');
    if (this.player.pop + stats.pop > this.player.cap) {
      return this.fail('Command capacity exceeded. Construct a logistics depot.');
    }

    this.pay(stats.cost);
    this.player.pop += stats.pop;
    const duration = stats.hero ? 12 : stats.armor ? 9 : stats.air ? 7 : 5;
    building.queue.push({ type, left: duration, duration, reserved: true });
    return true;
  }

  beginBuild(type) {
    this.lastError = '';
    const worker = this.selectedUnits().find((unit) => UNIT_TYPES[unit.type].worker);
    const stats = BUILDING_TYPES[type];
    if (!worker) return this.fail('Select a combat engineer to construct buildings.');
    if (!stats?.cost) return this.fail('That structure cannot be constructed.');
    if (!this.canAfford(stats.cost)) return this.fail('Insufficient resources for construction.');
    this.mouse.attackMove = false;
    this.pendingBuild = { type, workerId: worker.id };
    return true;
  }

  cancelBuild() {
    if (!this.pendingBuild) return false;
    this.pendingBuild = null;
    return true;
  }

  canPlaceBuilding(type, x, y) {
    const stats = BUILDING_TYPES[type];
    if (!stats) return false;
    const marginX = stats.w / 2 + 18;
    const marginY = stats.h / 2 + 18;
    if (x < marginX || x > WORLD.w - marginX || y < marginY || y > WORLD.h - marginY) {
      return false;
    }
    const radius = Math.max(stats.w, stats.h) * 0.58;
    if (this.buildings.some((building) => distance({ x, y }, building) < radius + 58)) return false;
    if (this.nodes.some((node) => distance({ x, y }, node) < radius + 42)) return false;
    return true;
  }

  placeBuilding(x, y) {
    this.lastError = '';
    const pending = this.pendingBuild;
    if (!pending) return this.fail('Choose a structure from an engineer command card first.');
    const worker = this.units.find(
      (unit) => unit.id === pending.workerId && unit.team === TEAM.UA && unit.hp > 0,
    );
    const stats = BUILDING_TYPES[pending.type];
    if (!worker) {
      this.pendingBuild = null;
      return this.fail('The assigned engineer is no longer available.');
    }
    if (!this.canAfford(stats.cost)) return this.fail('Resources changed; construction is no longer affordable.');
    if (!this.canPlaceBuilding(pending.type, x, y)) {
      return this.fail('Cannot build there: keep clear of structures, resource sites, and map edges.');
    }

    this.pay(stats.cost);
    const building = this.addBuilding(pending.type, TEAM.UA, x, y, { underConstruction: true });
    worker.order = { kind: 'construct', target: building };
    worker.target = null;
    this.pendingBuild = null;
    this.select(building);
    return true;
  }

  useAbility(name) {
    this.lastError = '';
    if (name === 'buildDepot') return this.beginBuild('depot');
    if (name === 'buildBarracks') return this.beginBuild('barracks');
    if (name === 'buildWorkshop') return this.beginBuild('workshop');

    const unit = this.selectedUnits()[0];
    if (
      !unit ||
      !(UNIT_TYPES[unit.type].abilities || []).includes(name) ||
      (unit.abilityCd[name] || 0) > 0
    ) {
      return this.fail('That action is unavailable or still on cooldown.');
    }

    const setCooldown = (seconds) => {
      unit.abilityCd[name] = seconds;
    };

    if (name === 'reconPulse') {
      this.effects.push({ kind: 'recon', x: unit.x, y: unit.y, radius: 430, life: 2, max: 2 });
      setCooldown(20);
    } else if (name === 'fieldDress') {
      this.units
        .filter((ally) => ally.team === unit.team && distance(ally, unit) < 150)
        .forEach((ally) => {
          ally.hp = Math.min(ally.maxHp, ally.hp + 35);
        });
      setCooldown(12);
    } else if (name === 'rally' || name === 'combinedArms') {
      this.units
        .filter((ally) => ally.team === unit.team && distance(ally, unit) < 230)
        .forEach((ally) => {
          ally.buffs.rally = 12;
        });
      setCooldown(name === 'rally' ? 35 : 38);
    } else if (name === 'address') {
      this.player.intel += 80;
      this.units
        .filter((ally) => ally.team === unit.team)
        .forEach((ally) => {
          ally.buffs.rally = 8;
        });
      setCooldown(50);
    } else if (name === 'deployInfantry') {
      const infantryStats = UNIT_TYPES.uaInfantry;
      if (this.player.pop + infantryStats.pop > this.player.cap) {
        return this.fail('Command capacity exceeded. Construct a logistics depot.');
      }
      this.addUnit('uaInfantry', unit.team, unit.x + 30, unit.y + 30);
      setCooldown(30);
    } else if (name === 'smokeLaunchers') {
      unit.buffs.smoke = 8;
      this.effects.push({ kind: 'smoke', x: unit.x, y: unit.y, radius: 95, life: 8, max: 8 });
      setCooldown(24);
    } else if (['grenade', 'strike', 'barrage', 'counterBattery'].includes(name)) {
      const target = this.nearestEnemy(unit, name === 'barrage' ? 410 : 260);
      if (!target) return this.fail('No hostile target is in ability range.');
      target.hp -= name === 'grenade' ? 45 : name === 'strike' ? 90 : 80;
      this.effects.push({
        kind: 'blast',
        x: target.x,
        y: target.y,
        radius: 70,
        life: 0.7,
        max: 0.7,
      });
      setCooldown(name === 'grenade' ? 10 : name === 'strike' ? 14 : name === 'barrage' ? 24 : 32);
    } else {
      return this.fail('This ability is not implemented yet.');
    }
    return true;
  }

  nearestEnemy(
    unit,
    range = (unit.team === TEAM.UA ? this.unitStats(unit.type) : UNIT_TYPES[unit.type]).sight,
  ) {
    let nearest = null;
    let nearestDistance = range;
    for (const entity of [...this.units, ...this.buildings]) {
      if (entity.team === unit.team || entity.hp <= 0) continue;
      const candidateDistance = distance(unit, entity);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearest = entity;
      }
    }
    return nearest;
  }

  move(unit, x, y, dt) {
    const stats = unit.team === TEAM.UA ? this.unitStats(unit.type) : UNIT_TYPES[unit.type];
    const dx = x - unit.x;
    const dy = y - unit.y;
    const remainingDistance = Math.hypot(dx, dy);
    if (remainingDistance < 5) return true;

    const speed = stats.speed * (unit.buffs.rally ? 1.2 : 1);
    unit.x = clamp(unit.x + (dx / remainingDistance) * speed * dt, 18, WORLD.w - 18);
    unit.y = clamp(unit.y + (dy / remainingDistance) * speed * dt, 18, WORLD.h - 18);
    unit.angle = Math.atan2(dy, dx);
    return false;
  }

  shoot(unit, target) {
    const stats = unit.team === TEAM.UA ? this.unitStats(unit.type) : UNIT_TYPES[unit.type];
    if (!stats.damage) return;

    unit.cool = stats.rate;
    let damage = stats.damage * (unit.buffs.rally ? 1.25 : 1);
    if (target.buffs?.smoke) damage *= 0.55;
    if (
      stats.archetype === 'drone' &&
      target.team === TEAM.UA &&
      this.player.upgrades.has('cageArmor')
    ) {
      damage *= 0.75;
    }

    this.projectiles.push({
      x: unit.x,
      y: unit.y - 8,
      target,
      team: unit.team,
      speed: stats.armor ? 250 : 330,
      damage,
      life: 2,
      kind: stats.armor ? 'shell' : 'bullet',
      source: unit,
    });
    unit.flash = 0.1;
  }

  updateWorker(unit, stats, dt) {
    if (!stats.worker || unit.team !== TEAM.UA) return;

    if (unit.order?.kind === 'gather') {
      const node = unit.order.target;
      if (node.amount > 0 && distance(unit, node) < 35) {
        unit.carry = Math.min(40, unit.carry + 18 * dt);
        unit.carryKind = node.kind;
        node.amount = Math.max(0, node.amount - 18 * dt);
        if (unit.carry >= 40) unit.order = { kind: 'return', target: this.uaHQ };
      } else if (node.amount > 0) {
        this.move(unit, node.x, node.y, dt);
      } else {
        unit.order = null;
      }
    } else if (unit.order?.kind === 'return') {
      if (!this.buildings.includes(this.uaHQ)) {
        unit.order = null;
      } else if (distance(unit, this.uaHQ) < 70) {
        this.player[unit.carryKind] += unit.carry;
        this.player.mined += unit.carry;
        unit.carry = 0;
        const node = this.nodes
          .filter((candidate) => candidate.kind === unit.carryKind && candidate.amount > 0)
          .sort((a, b) => distance(a, unit) - distance(b, unit))[0];
        if (node) unit.order = { kind: 'gather', target: node };
        else unit.order = null;
      } else {
        this.move(unit, this.uaHQ.x, this.uaHQ.y, dt);
      }
    } else if (!unit.order && !unit.target) {
      const node = this.nodes
        .filter((candidate) => candidate.amount > 0)
        .sort((a, b) => distance(a, unit) - distance(b, unit))[0];
      if (node) unit.order = { kind: 'gather', target: node };
    }

    if (unit.order?.kind === 'construct') {
      const building = unit.order.target;
      if (!this.buildings.includes(building)) {
        unit.order = null;
      } else if (distance(unit, building) > 55) {
        this.move(unit, building.x, building.y, dt);
      } else {
        const buildTime = BUILDING_TYPES[building.type].buildTime || 8;
        const buildRate = building.maxHp / buildTime;
        building.hp = Math.min(building.maxHp, building.hp + buildRate * dt);
        if (building.hp >= building.maxHp) {
          building.underConstruction = false;
          if (!building.capacityGranted) {
            this.player.cap += BUILDING_TYPES[building.type].pop || 0;
            building.capacityGranted = true;
          }
          unit.order = null;
        }
      }
    }
  }

  updateUnit(unit, dt) {
    const stats = unit.team === TEAM.UA ? this.unitStats(unit.type) : UNIT_TYPES[unit.type];
    unit.cool -= dt;
    unit.flash = Math.max(0, unit.flash - dt);

    for (const abilityName in unit.abilityCd) {
      unit.abilityCd[abilityName] = Math.max(0, unit.abilityCd[abilityName] - dt);
    }
    for (const buffName in unit.buffs) {
      unit.buffs[buffName] -= dt;
      if (unit.buffs[buffName] <= 0) delete unit.buffs[buffName];
    }

    if (unit.target?.hp <= 0) unit.target = null;
    if (unit.order?.kind === 'attack' && unit.order.target?.hp <= 0) unit.order = null;

    this.updateWorker(unit, stats, dt);
    if (stats.medic) {
      const ally = this.units
        .filter(
          (candidate) =>
            candidate.team === unit.team &&
            candidate.hp < candidate.maxHp &&
            distance(candidate, unit) < stats.range,
        )
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (ally && unit.cool <= 0) {
        ally.hp = Math.min(ally.maxHp, ally.hp + 12);
        unit.cool = stats.rate;
      }
    }

    const explicitTarget =
      unit.order?.kind === 'attack' && unit.order.target?.hp > 0 ? unit.order.target : null;
    const mayAcquire =
      stats.damage > 0 &&
      (unit.team === TEAM.RU || unit.order?.kind === 'attackMove' || (unit.autoFire && !unit.order));

    if (explicitTarget) unit.target = explicitTarget;
    if (!unit.target && mayAcquire) unit.target = this.nearestEnemy(unit);
    if (!mayAcquire && !explicitTarget && !COMBAT_ORDER_KINDS.has(unit.order?.kind)) unit.target = null;

    const target = explicitTarget || unit.target;
    if (target) {
      const targetDistance = distance(unit, target);
      if (targetDistance <= stats.range) {
        unit.angle = Math.atan2(target.y - unit.y, target.x - unit.x);
        if (unit.cool <= 0) this.shoot(unit, target);
      } else if (explicitTarget || unit.team === TEAM.RU || unit.order?.kind === 'attackMove') {
        this.move(unit, target.x, target.y, dt);
      } else if (targetDistance > stats.sight * 1.15) {
        unit.target = null;
      }
    } else if (unit.order && (unit.order.kind === 'move' || unit.order.kind === 'attackMove')) {
      if (this.move(unit, unit.order.x, unit.order.y, dt)) unit.order = null;
    }
  }

  updateProjectiles(dt) {
    updateProjectiles(this, dt);
  }

  spawnWave() {
    return spawnEnemyWave(this);
  }

  updateObjectives() {
    updateMissionObjectives(this);
  }

  finish(outcome, reason) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.outcome = outcome;
    this.endReason = reason;
    this.pendingBuild = null;
    this.mouse.attackMove = false;
  }

  updateProduction(dt) {
    for (const building of this.buildings) {
      if (building.underConstruction || !building.queue.length) continue;
      building.queue[0].left -= dt;
      if (building.queue[0].left > 0) continue;

      const queuedUnit = building.queue.shift();
      this.addUnit(
        queuedUnit.type,
        building.team,
        building.x + randomBetween(-70, 70),
        building.y + 85,
      );
      if (queuedUnit.reserved) this.player.pop -= UNIT_TYPES[queuedUnit.type].pop;
    }
  }

  updateWaves(dt) {
    const waves = this.mission.waves;
    if (this.wave >= waves.maxWaves || !this.buildings.includes(this.ruHQ)) return;

    this.enemy.clock -= dt;
    if (this.enemy.clock > 0) return;

    const activeWaveUnits = this.units.filter(
      (unit) => unit.team === TEAM.RU && unit.waveSpawned && unit.hp > 0,
    ).length;
    if (activeWaveUnits >= waves.maxActive) {
      this.enemy.clock = 8;
      this.enemy.pausedForCap = true;
      return;
    }

    this.enemy.pausedForCap = false;
    this.spawnWave();
    this.enemy.clock = waves.interval;
  }

  removeDestroyedEntities() {
    this.units = this.units.filter((unit) => {
      if (unit.hp > 0) return true;
      if (unit.team === TEAM.UA) this.player.pop -= UNIT_TYPES[unit.type].pop || 0;
      this.selected.delete(unit.id);
      return false;
    });

    this.buildings = this.buildings.filter((building) => {
      if (building.hp > 0) return true;
      if (building.team === TEAM.UA) {
        if (building.capacityGranted) this.player.cap -= BUILDING_TYPES[building.type].pop || 0;
        for (const item of building.queue) {
          if (item.reserved) this.player.pop -= UNIT_TYPES[item.type].pop || 0;
        }
      }
      this.selected.delete(building.id);
      return false;
    });

    this.player.pop = Math.max(0, this.player.pop);
    this.player.cap = Math.max(0, this.player.cap);
  }

  update(dt) {
    runSimulationStep(this, dt);
  }
}
