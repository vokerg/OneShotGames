import {
  ABILITIES,
  BUILDING_TYPES,
  FACTIONS,
  MISSIONS,
  REGIONS,
  TEAM,
  UNIT_TYPES,
  UPGRADES,
} from './config.js';

const RESOURCE_LABELS = { metal: 'metal', fuel: 'fuel', intel: 'intel' };
const BUILD_ACTIONS = {
  buildDepot: 'depot',
  buildBarracks: 'barracks',
  buildWorkshop: 'workshop',
};

export class UI {
  constructor(game) {
    this.g = game;
    this.to = null;
    this.lastOutcome = null;
    this.e = {
      metal: document.querySelector('#metal'),
      fuel: document.querySelector('#fuel'),
      intel: document.querySelector('#intel'),
      pop: document.querySelector('#pop'),
      wave: document.querySelector('#waveStatus'),
      name: document.querySelector('#selectionName'),
      stats: document.querySelector('#selectionStats'),
      abilities: document.querySelector('#abilities'),
      missionTitle: document.querySelector('#missionTitle'),
      missionStory: document.querySelector('#missionStory'),
      objectiveList: document.querySelector('#objectiveList'),
      objectives: document.querySelector('#objectives'),
      message: document.querySelector('#message'),
      select: document.querySelector('#missionSelect'),
      cards: document.querySelector('#missionCards'),
      endgame: document.querySelector('#endgame'),
      endgameTitle: document.querySelector('#endgameTitle'),
      endgameReason: document.querySelector('#endgameReason'),
      endgameStats: document.querySelector('#endgameStats'),
      retry: document.querySelector('#retryMission'),
      operations: document.querySelector('#returnOperations'),
    };
  }

  setEndgameActions({ retry, operations }) {
    this.e.retry.onclick = retry;
    this.e.operations.onclick = operations;
  }

  buildMissionCards(start) {
    this.e.cards.innerHTML = '';
    MISSIONS.forEach((mission, index) => {
      const card = document.createElement('div');
      card.className = 'missionCard';
      const canvas = document.createElement('canvas');
      canvas.width = 130;
      canvas.height = 76;
      const context = canvas.getContext('2d');
      context.fillStyle = ['#566b3d', '#8a7045', '#506977'][index];
      context.fillRect(0, 0, 130, 76);
      context.fillStyle = '#9b895e';
      for (let block = 0; block < 8; block += 1) {
        context.fillRect(block * 20, (block % 3) * 8 + 42, 18, 12);
      }
      context.fillStyle = '#3978ad';
      for (let unit = 0; unit < 4; unit += 1) {
        context.fillRect(12 + unit * 19, 35 - (unit % 2) * 8, 11, 19);
      }
      context.fillStyle = '#7c5043';
      for (let unit = 0; unit < 3; unit += 1) {
        context.fillRect(82 + unit * 14, 24 + (unit % 2) * 9, 10, 20);
      }

      const region = REGIONS[mission.region];
      const text = document.createElement('div');
      text.innerHTML = `<h3>${mission.title}</h3><small>${region.name} · ${region.subtitle} · Ukraine vs Russia</small><p>${mission.story}</p><p class="missionPacing">First assault: ${mission.waves.firstDelay}s · ${mission.waves.maxWaves} planned waves</p>`;
      const button = document.createElement('button');
      button.textContent = 'Begin Operation';
      button.onclick = () => {
        this.e.select.classList.add('hidden');
        start(index);
      };
      card.append(canvas, text, button);
      this.e.cards.appendChild(card);
    });
  }

  setMission() {
    const region = REGIONS[this.g.mission.region];
    this.e.missionTitle.textContent = this.g.mission.title;
    this.e.missionStory.textContent = `${region.name} — ${region.subtitle}. Ukraine versus Russia. ${this.g.mission.story}`;
    this.e.objectiveList.innerHTML = this.g.mission.objectives
      .map((objective, index) => `<li data-i="${index}">${objective}</li>`)
      .join('');
    this.e.endgame.classList.add('hidden');
    this.e.select.classList.add('hidden');
    this.lastOutcome = null;
    document.body.classList.remove('placing');
  }

  showMissionSelect() {
    this.e.endgame.classList.add('hidden');
    this.e.select.classList.remove('hidden');
    this.lastOutcome = null;
    document.body.classList.remove('placing');
  }

  toast(message) {
    this.e.message.textContent = message;
    this.e.message.classList.add('show');
    clearTimeout(this.to);
    this.to = setTimeout(() => this.e.message.classList.remove('show'), 2600);
  }

  formatCost(cost = {}) {
    return Object.entries(cost)
      .map(([resource, amount]) => `${amount} ${RESOURCE_LABELS[resource] || resource}`)
      .join(' · ');
  }

  commandButton({ title, description, meta = '', className = '', disabled = false, onClick }) {
    const button = document.createElement('button');
    button.className = `ability ${className}`.trim();
    button.disabled = disabled;
    button.innerHTML = `<strong>${title}</strong><small>${description}</small>${meta ? `<span class="abilityMeta">${meta}</span>` : ''}`;
    button.onclick = onClick;
    this.e.abilities.appendChild(button);
    return button;
  }

  appendUnitCommands(units) {
    if (!units.length) return;
    const combatUnits = units.filter((unit) => this.g.unitStats(unit.type).damage > 0);
    const allAutoFire = combatUnits.length > 0 && combatUnits.every((unit) => unit.autoFire);

    this.commandButton({
      title: 'Attack-Move',
      description: 'Advance and engage contacts en route.',
      meta: 'Q',
      className: 'command',
      onClick: () => {
        if (this.g.armAttackMove()) this.toast('Attack-move armed: right-click a destination.');
        else this.toast(this.g.lastError);
      },
    });
    this.commandButton({
      title: 'Stop',
      description: 'Cancel current orders and reacquire locally.',
      meta: 'X',
      className: 'command',
      onClick: () => {
        if (this.g.stopSelected()) this.toast('Orders cancelled.');
        else this.toast(this.g.lastError);
      },
    });
    this.commandButton({
      title: `Auto-Fire: ${allAutoFire ? 'ON' : 'OFF'}`,
      description: allAutoFire
        ? 'Idle combat units automatically engage enemies.'
        : 'Weapons remain silent until explicitly ordered.',
      meta: 'F',
      className: `command ${allAutoFire ? 'stance-on' : 'stance-off'}`,
      disabled: !combatUnits.length,
      onClick: () => {
        const enabled = this.g.toggleAutoFire();
        if (enabled === false && this.g.lastError) this.toast(this.g.lastError);
        else this.toast(`Auto-fire ${enabled ? 'enabled' : 'disabled'} for selected combat units.`);
        this.refresh();
      },
    });
  }

  appendAbilities(unit) {
    const type = UNIT_TYPES[unit.type];
    for (const abilityId of type.abilities || []) {
      const ability = ABILITIES[abilityId] || { name: abilityId, desc: 'Special action', key: '' };
      const buildType = BUILD_ACTIONS[abilityId];
      const cooldown = unit.abilityCd[abilityId] || 0;
      const buildCost = buildType ? BUILDING_TYPES[buildType].cost : null;
      this.commandButton({
        title: ability.name,
        description: ability.desc,
        meta: buildType ? this.formatCost(buildCost) : cooldown > 0 ? `${Math.ceil(cooldown)}s` : ability.key,
        className: buildType ? 'build-command' : '',
        disabled: cooldown > 0,
        onClick: () => {
          if (this.g.useAbility(abilityId)) {
            if (buildType) {
              this.toast(`Place ${BUILDING_TYPES[buildType].name}: left-click valid ground, right-click to cancel.`);
            } else {
              this.toast(`${ability.name} activated.`);
            }
          } else {
            this.toast(this.g.lastError);
          }
          this.refresh();
        },
      });
    }
  }

  productionTypes(building) {
    const base = BUILDING_TYPES[building.type].produces || [];
    if (building.type !== 'hq') return base;
    return [...base, ...this.g.mission.trainableHeroes];
  }

  appendProduction(building) {
    for (const typeId of this.productionTypes(building)) {
      const unit = UNIT_TYPES[typeId];
      const duplicateHero = unit.hero && this.g.heroAlreadyFieldedOrQueued(typeId);
      this.commandButton({
        title: unit.name,
        description: unit.role,
        meta: duplicateHero ? 'Already deployed' : this.formatCost(unit.cost),
        className: 'production-command',
        disabled: duplicateHero || building.underConstruction,
        onClick: () => {
          if (this.g.queue(typeId)) {
            this.toast(`${unit.short || unit.name} added to the production queue.`);
          } else {
            this.toast(this.g.lastError);
          }
          this.refresh();
        },
      });
    }
  }

  appendUpgrades(building) {
    if (building.type !== 'workshop' || building.underConstruction) return;
    for (const [upgradeId, upgrade] of Object.entries(UPGRADES)) {
      const done = this.g.player.upgrades.has(upgradeId);
      const locked = upgrade.requires && !this.g.player.upgrades.has(upgrade.requires);
      this.commandButton({
        title: `${done ? '✓ ' : ''}${upgrade.name}`,
        description: upgrade.desc,
        meta: done ? 'Researched' : locked ? 'Requires prior upgrade' : this.formatCost(upgrade.cost),
        className: done ? 'researched' : 'upgrade-command',
        disabled: done || Boolean(locked),
        onClick: () => {
          if (this.g.research(upgradeId)) this.toast(`${upgrade.name} complete.`);
          else this.toast(this.g.lastError);
          this.refresh();
        },
      });
    }
  }

  selectionSummary(entities) {
    return Object.entries(
      entities.reduce((summary, entity) => {
        const type = UNIT_TYPES[entity.type] || BUILDING_TYPES[entity.type];
        const name = type.short || type.name;
        summary[name] = (summary[name] || 0) + 1;
        return summary;
      }, {}),
    )
      .map(([name, count]) => `${count}× ${name}`)
      .join(' · ');
  }

  buildingStatus(building) {
    const type = BUILDING_TYPES[building.type];
    if (building.underConstruction) {
      return `Construction ${Math.floor((building.hp / building.maxHp) * 100)}% · ${type.desc}`;
    }
    if (!building.queue.length) return `${type.desc} · Production queue empty`;
    const current = building.queue[0];
    const currentType = UNIT_TYPES[current.type];
    const queuedNames = building.queue.map((item) => UNIT_TYPES[item.type].short).join(' → ');
    return `${type.desc} · Producing ${currentType.short} (${Math.ceil(current.left)}s) · Queue: ${queuedNames}`;
  }

  updateWaveStatus() {
    const waves = this.g.mission.waves;
    if (this.g.wave >= waves.maxWaves) {
      this.e.wave.textContent = 'assault plan complete';
      return;
    }
    if (this.g.enemy.pausedForCap) {
      this.e.wave.textContent = `wave ${this.g.wave + 1} held`;
      return;
    }
    this.e.wave.textContent = `wave ${this.g.wave + 1} in ${Math.max(0, Math.ceil(this.g.enemy.clock))}s`;
  }

  showEndgame() {
    if (!this.g.outcome || this.lastOutcome === this.g.outcome) return;
    this.lastOutcome = this.g.outcome;
    const victory = this.g.outcome === 'victory';
    this.e.endgameTitle.textContent = victory ? 'Operation Complete' : 'Operational Defeat';
    this.e.endgameReason.textContent = this.g.endReason;
    const minutes = Math.floor(this.g.time / 60);
    const seconds = Math.floor(this.g.time % 60)
      .toString()
      .padStart(2, '0');
    this.e.endgameStats.innerHTML = `
      <div><strong>${minutes}:${seconds}</strong><span>mission time</span></div>
      <div><strong>${this.g.wave}/${this.g.mission.waves.maxWaves}</strong><span>assault waves</span></div>
      <div><strong>${Math.floor(this.g.player.mined)}</strong><span>materiel recovered</span></div>
      <div><strong>${this.g.player.objectives.filter(Boolean).length}/3</strong><span>objectives complete</span></div>
    `;
    this.e.endgame.classList.toggle('victory', victory);
    this.e.endgame.classList.toggle('defeat', !victory);
    this.e.endgame.classList.remove('hidden');
  }

  refresh() {
    if (!this.g.mission) return;
    const player = this.g.player;
    this.e.metal.textContent = Math.floor(player.metal);
    this.e.fuel.textContent = Math.floor(player.fuel);
    this.e.intel.textContent = Math.floor(player.intel);
    this.e.pop.textContent = `${player.pop}/${player.cap}`;
    this.updateWaveStatus();
    this.e.objectiveList.querySelectorAll('li').forEach((item, index) => {
      item.classList.toggle('done', Boolean(player.objectives[index]));
    });
    document.body.classList.toggle('placing', Boolean(this.g.pendingBuild));

    if (this.g.gameOver) this.showEndgame();

    const entities = this.g.selectedEntities();
    const entity = entities[0];
    this.e.abilities.innerHTML = '';

    if (!entity) {
      this.e.name.textContent = this.g.pendingBuild ? 'Choose Construction Site' : 'No unit selected';
      this.e.stats.textContent = this.g.pendingBuild
        ? `Placing ${BUILDING_TYPES[this.g.pendingBuild.type].name}. Left-click valid ground; right-click or Esc cancels.`
        : 'Select Ukrainian units or a facility. Engineers recover resources automatically and can place depots, barracks, and workshops.';
      return;
    }

    if (entities.length > 1) {
      const units = entities.filter((candidate) => UNIT_TYPES[candidate.type]);
      this.e.name.textContent = `Ukrainian Tactical Group (${entities.length})`;
      this.e.stats.textContent = this.selectionSummary(entities);
      this.appendUnitCommands(units);
      return;
    }

    const type = UNIT_TYPES[entity.type] || BUILDING_TYPES[entity.type];
    const faction = FACTIONS[entity.team];
    this.e.name.textContent = `${faction.name} — ${entity.team === TEAM.RU && type.ruName ? type.ruName : type.name}${type.title ? ` — ${type.title}` : ''}`;

    if (UNIT_TYPES[entity.type]) {
      const stats = entity.team === TEAM.UA ? this.g.unitStats(entity.type) : UNIT_TYPES[entity.type];
      const stance = entity.autoFire ? 'Auto-fire ON' : 'Auto-fire OFF';
      this.e.stats.textContent = `Combat strength ${Math.ceil(entity.hp)}/${Math.ceil(entity.maxHp)} · ${type.role || type.short || ''} · Firepower ${Math.round(stats.damage)} · Observation ${Math.round(stats.sight)} · ${stance}`;
      if (entity.team === TEAM.UA) {
        this.appendUnitCommands([entity]);
        this.appendAbilities(entity);
      }
      return;
    }

    this.e.stats.textContent = `Structural strength ${Math.ceil(entity.hp)}/${Math.ceil(entity.maxHp)} · ${this.buildingStatus(entity)}`;
    if (entity.team === TEAM.UA) {
      this.appendProduction(entity);
      this.appendUpgrades(entity);
    }
  }
}
