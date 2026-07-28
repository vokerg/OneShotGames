import { BUILDING_TYPES, MISSIONS, TEAM, UNIT_TYPES, UPGRADES, WORLD } from './config.js';
import { clamp, distance, randomBetween } from './core/math.js';
import { updateMissionObjectives } from './systems/objective-system.js';
import { updateProjectiles } from './systems/projectile-system.js';
import { spawnEnemyWave } from './systems/wave-system.js';

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
  }

  start(index = 0) {
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
    this.player = {
      ...this.mission.start,
      pop: 0,
      cap: 14,
      mined: 0,
      objectives: [false, false, false],
      upgrades: new Set(),
    };
    this.enemy = { clock: 12 };
    this.terrain = [];

    for (let y = 0; y < WORLD.h / 32; y += 1) {
      for (let x = 0; x < WORLD.w / 32; x += 1) {
        const noise = Math.sin(x * 0.41) + Math.cos(y * 0.31) + Math.sin((x + y) * 0.17);
        this.terrain.push(noise > 1.35 ? 2 : noise < -1.48 ? 1 : 0);
      }
    }

    this.nodes.push(
      { x: 490, y: 1280, kind: 'metal', amount: 1600, label: 'Salvage Yard' },
      { x: 760, y: 1180, kind: 'fuel', amount: 1100, label: 'Fuel Point' },
      { x: 1120, y: 850, kind: 'intel', amount: 900, label: 'Signals Relay' },
      { x: 1570, y: 600, kind: 'metal', amount: 1800, label: 'Industrial Site' },
      { x: 1900, y: 420, kind: 'fuel', amount: 1200, label: 'Forward Fuel Base' },
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
    };
    this.units.push(unit);
    if (team === TEAM.UA) this.player.pop += stats.pop || 0;
    return unit;
  }

  addBuilding(type, team, x, y) {
    const stats = BUILDING_TYPES[type];
    const building = {
      id: this.nextId++,
      type,
      team,
      x,
      y,
      hp: stats.hp,
      maxHp: stats.hp,
      selected: false,
      queue: [],
    };
    this.buildings.push(building);
    if (team === TEAM.UA) this.player.cap += stats.pop || 0;
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

  issue(x, y, target) {
    const units = this.selectedUnits();
    if (!units.length) return;

    if (target && target.team === TEAM.RU) {
      units.forEach((unit) => {
        unit.order = { kind: 'attack', target };
      });
      return;
    }

    const columns = Math.ceil(Math.sqrt(units.length));
    units.forEach((unit, index) => {
      unit.order = {
        kind: this.mouse.attackMove ? 'attackMove' : 'move',
        x: x + ((index % columns) - (columns - 1) / 2) * 34,
        y: y + (Math.floor(index / columns) - Math.floor(units.length / columns) / 2) * 34,
      };
    });
    this.mouse.attackMove = false;
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
    const upgrade = UPGRADES[id];
    if (
      !upgrade ||
      this.player.upgrades.has(id) ||
      (upgrade.requires && !this.player.upgrades.has(upgrade.requires)) ||
      !this.canAfford(upgrade.cost)
    ) {
      return false;
    }

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

  queue(type) {
    const building = this.selectedEntities()[0];
    const stats = UNIT_TYPES[type];
    if (
      !building ||
      !BUILDING_TYPES[building.type] ||
      !stats ||
      stats.faction !== 'ukraine' ||
      !this.canAfford(stats.cost) ||
      this.player.pop + stats.pop > this.player.cap
    ) {
      return false;
    }

    this.pay(stats.cost);
    this.player.pop += stats.pop;
    building.queue.push({
      type,
      left: stats.hero ? 12 : stats.armor ? 9 : stats.air ? 7 : 5,
      reserved: true,
    });
    return true;
  }

  build(type) {
    const worker = this.selectedUnits().find((unit) => UNIT_TYPES[unit.type].worker);
    const stats = BUILDING_TYPES[type];
    if (!worker || !stats) return false;

    const cost =
      type === 'depot'
        ? { metal: 100 }
        : type === 'barracks'
          ? { metal: 150 }
          : { metal: 220, fuel: 80 };
    if (!this.canAfford(cost)) return false;

    this.pay(cost);
    const building = this.addBuilding(type, TEAM.UA, worker.x + 70, worker.y + 35);
    building.hp = 80;
    worker.order = { kind: 'construct', target: building };
    return true;
  }

  useAbility(name) {
    const unit = this.selectedUnits()[0];
    if (
      !unit ||
      !(UNIT_TYPES[unit.type].abilities || []).includes(name) ||
      (unit.abilityCd[name] || 0) > 0
    ) {
      return;
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
      this.addUnit('uaInfantry', unit.team, unit.x + 30, unit.y + 30);
      setCooldown(30);
    } else if (name === 'smokeLaunchers') {
      unit.buffs.smoke = 8;
      this.effects.push({ kind: 'smoke', x: unit.x, y: unit.y, radius: 95, life: 8, max: 8 });
      setCooldown(24);
    } else if (['grenade', 'strike', 'barrage', 'counterBattery'].includes(name)) {
      const target = this.nearestEnemy(unit, name === 'barrage' ? 410 : 260);
      if (target) {
        target.hp -= name === 'grenade' ? 45 : name === 'strike' ? 90 : 80;
        this.effects.push({
          kind: 'blast',
          x: target.x,
          y: target.y,
          radius: 70,
          life: 0.7,
          max: 0.7,
        });
      }
      setCooldown(name === 'grenade' ? 10 : name === 'strike' ? 14 : name === 'barrage' ? 24 : 32);
    } else if (name === 'buildDepot') {
      this.build('depot');
    } else if (name === 'buildBarracks') {
      this.build('barracks');
    }
  }

  nearestEnemy(unit, range = (unit.team === TEAM.UA ? this.unitStats(unit.type) : UNIT_TYPES[unit.type]).sight) {
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
    });
    unit.flash = 0.1;
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

    if (stats.worker && unit.team === TEAM.UA) {
      if (unit.order?.kind === 'gather') {
        const node = unit.order.target;
        if (node.amount > 0 && distance(unit, node) < 35) {
          unit.carry = Math.min(40, unit.carry + 18 * dt);
          unit.carryKind = node.kind;
          node.amount -= 18 * dt;
          if (unit.carry >= 40) unit.order = { kind: 'return', target: this.uaHQ };
        } else {
          this.move(unit, node.x, node.y, dt);
        }
      } else if (unit.order?.kind === 'return') {
        if (distance(unit, this.uaHQ) < 70) {
          this.player[unit.carryKind] += unit.carry;
          this.player.mined += unit.carry;
          unit.carry = 0;
          const node = this.nodes
            .filter((candidate) => candidate.kind === unit.carryKind && candidate.amount > 0)
            .sort((a, b) => distance(a, unit) - distance(b, unit))[0];
          if (node) unit.order = { kind: 'gather', target: node };
        } else {
          this.move(unit, this.uaHQ.x, this.uaHQ.y, dt);
        }
      } else if (!unit.order) {
        const node = this.nodes
          .filter((candidate) => candidate.amount > 0)
          .sort((a, b) => distance(a, unit) - distance(b, unit))[0];
        if (node) unit.order = { kind: 'gather', target: node };
      }

      if (unit.order?.kind === 'construct') {
        const building = unit.order.target;
        if (distance(unit, building) > 55) {
          this.move(unit, building.x, building.y, dt);
        } else {
          building.hp = Math.min(building.maxHp, building.hp + 90 * dt);
          if (building.hp >= building.maxHp) unit.order = null;
        }
      }
    }

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

    let target =
      unit.order?.kind === 'attack' && unit.order.target?.hp > 0 ? unit.order.target : null;
    if (!target && (unit.order?.kind === 'attackMove' || unit.team === TEAM.RU)) {
      target = this.nearestEnemy(unit);
    }

    if (target) {
      const targetDistance = distance(unit, target);
      if (targetDistance <= stats.range) {
        unit.angle = Math.atan2(target.y - unit.y, target.x - unit.x);
        if (unit.cool <= 0) this.shoot(unit, target);
      } else {
        this.move(unit, target.x, target.y, dt);
      }
    } else if (unit.order && (unit.order.kind === 'move' || unit.order.kind === 'attackMove')) {
      if (this.move(unit, unit.order.x, unit.order.y, dt)) unit.order = null;
    }
  }

  updateProjectiles(dt) {
    updateProjectiles(this, dt);
  }

  spawnWave() {
    spawnEnemyWave(this);
  }

  updateObjectives() {
    updateMissionObjectives(this);
  }

  update(dt) {
    if (this.gameOver) return;
    this.time += dt;

    const pan = 400 * dt;
    if (this.keys.has('arrowup') || this.keys.has('w')) this.camera.y += pan;
    if (this.keys.has('arrowdown') || this.keys.has('s')) this.camera.y -= pan;
    if (this.keys.has('arrowleft') || this.keys.has('a')) this.camera.x += pan;
    if (this.keys.has('arrowright') || this.keys.has('d')) this.camera.x -= pan;
    this.camera.x = clamp(this.camera.x, innerWidth - WORLD.w * this.camera.z - 100, 100);
    this.camera.y = clamp(this.camera.y, innerHeight - WORLD.h * this.camera.z - 180, 100);

    for (const unit of this.units) this.updateUnit(unit, dt);
    this.updateProjectiles(dt);

    for (const building of this.buildings) {
      if (!building.queue.length) continue;
      building.queue[0].left -= dt;
      if (building.queue[0].left <= 0) {
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

    this.enemy.clock -= dt;
    if (this.enemy.clock <= 0) {
      this.enemy.clock = this.mission.id === 'kherson' ? 12 : 17;
      this.spawnWave();
    }

    this.units = this.units.filter((unit) => {
      if (unit.hp > 0) return true;
      if (unit.team === TEAM.UA) this.player.pop -= UNIT_TYPES[unit.type].pop || 0;
      this.selected.delete(unit.id);
      return false;
    });
    this.buildings = this.buildings.filter((building) => {
      if (building.hp > 0) return true;
      if (building.team === TEAM.UA) this.player.cap -= BUILDING_TYPES[building.type].pop || 0;
      this.selected.delete(building.id);
      return false;
    });

    this.updateObjectives();
    if (this.player.objectives.every(Boolean) || !this.buildings.includes(this.uaHQ)) {
      this.gameOver = true;
    }
  }
}
