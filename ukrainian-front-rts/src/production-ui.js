import { BUILDING_TYPES, TEAM, UNIT_TYPES } from './config.js';

const STYLE_ID = 'production-rally-styles';

function installStyles() {
  if (document.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.rallying #game { cursor: crosshair; }
    .ability.rally-command { background: linear-gradient(#4e5e45, #283425); }
    .ability.rally-command strong { color: #d9f3a9; }
    .ability.rally-command.armed { box-shadow: inset 0 0 0 2px #c9e86c; }
    #productionQueue {
      position: fixed;
      left: 50%;
      bottom: 192px;
      transform: translateX(-50%);
      width: min(620px, calc(100vw - 32px));
      min-height: 76px;
      padding: 7px 9px 9px;
      background: linear-gradient(#3f493c, #1c221c 65%, #131713);
      border: 4px ridge #9a8353;
      box-shadow: 0 4px 16px #000b, inset 0 1px rgba(255,255,255,.12);
      z-index: 4;
      pointer-events: auto;
    }
    #productionQueue.hidden { display: none; }
    .productionHeader {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 5px;
      color: #d9c98f;
      font: 700 10px monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .productionHeader strong {
      color: #ffe18a;
      font-size: 11px;
      letter-spacing: 0;
      text-transform: none;
    }
    .productionBody { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
    .productionProgress {
      height: 12px;
      background: #111511;
      border: 2px inset #6f6040;
      position: relative;
      overflow: hidden;
    }
    .productionProgress > span {
      display: block;
      height: 100%;
      width: 0;
      background: linear-gradient(90deg, #456d8c, #dfc85c);
      transition: width .08s linear;
    }
    .queueSlots { display: grid; grid-template-columns: repeat(5, 48px); gap: 5px; }
    .queueSlot {
      width: 48px;
      height: 46px;
      min-height: 0;
      padding: 3px;
      position: relative;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        linear-gradient(to top, rgba(65,110,143,.72) var(--queue-progress, 0%), transparent var(--queue-progress, 0%)),
        linear-gradient(#454d46, #252a25);
      border-width: 3px;
      font: 700 10px monospace;
    }
    .queueSlot.active { box-shadow: inset 0 0 0 2px #f0d669; }
    .queueSlot.queued { opacity: .9; }
    .queueSlot.empty { opacity: .32; cursor: default; }
    .queueSlot .queueIndex {
      position: absolute;
      left: 3px;
      top: 2px;
      font-size: 8px;
      color: #cbbd8d;
    }
    .queueSlot .queueIcon { color: #f7e2a0; font-size: 14px; }
    .queueSlot .queueTime {
      position: absolute;
      right: 2px;
      bottom: 1px;
      padding: 0 2px;
      background: #101410bb;
      color: #e5d79d;
      font-size: 8px;
    }
    .queueHelp { margin-top: 4px; color: #aa9f7e; font: 9px monospace; }
    @media (max-width: 1050px) { #productionQueue { bottom: 220px; } }
    @media (max-width: 760px) {
      #productionQueue { bottom: 265px; }
      .productionBody { grid-template-columns: 1fr; }
      .queueSlots { grid-template-columns: repeat(5, minmax(42px, 1fr)); }
      .queueSlot { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

function initials(typeId) {
  const unit = UNIT_TYPES[typeId];
  const words = (unit?.short || unit?.name || typeId).split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

export function installProductionUI(UI) {
  installStyles();

  UI.prototype.ensureProductionHud = function ensureProductionHud() {
    if (this.productionHud) return this.productionHud;

    const panel = document.createElement('section');
    panel.id = 'productionQueue';
    panel.className = 'hidden';
    panel.setAttribute('aria-label', 'Production queue');
    panel.innerHTML = `
      <div class="productionHeader">
        <span>Production queue</span>
        <strong class="productionCurrent">Idle</strong>
      </div>
      <div class="productionBody">
        <div>
          <div class="productionProgress" aria-label="Current production progress"><span></span></div>
          <div class="queueHelp">Click a queued unit to cancel and refund it.</div>
        </div>
        <div class="queueSlots"></div>
      </div>
    `;

    const slots = [];
    const slotsContainer = panel.querySelector('.queueSlots');
    for (let index = 0; index < 5; index += 1) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'queueSlot empty';
      slot.dataset.index = String(index);
      slot.innerHTML = `<span class="queueIndex">${index + 1}</span><span class="queueIcon">—</span><span class="queueTime"></span>`;
      slot.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || slot.disabled) return;
        event.preventDefault();
        const buildingId = Number(panel.dataset.buildingId);
        const queueIndex = Number(slot.dataset.index);
        const item = this.g.buildings.find((building) => building.id === buildingId)?.queue[queueIndex];
        const label = item ? UNIT_TYPES[item.type]?.short || UNIT_TYPES[item.type]?.name : 'Production order';
        if (this.g.cancelQueueItem(buildingId, queueIndex)) this.toast(`${label} cancelled and refunded.`);
        else this.toast(this.g.lastError);
        this.refresh();
      });
      slotsContainer.appendChild(slot);
      slots.push(slot);
    }

    document.querySelector('#shell').appendChild(panel);
    this.productionHud = {
      panel,
      current: panel.querySelector('.productionCurrent'),
      progress: panel.querySelector('.productionProgress > span'),
      slots,
    };
    return this.productionHud;
  };

  UI.prototype.updateProductionHud = function updateProductionHud(entities) {
    const hud = this.ensureProductionHud();
    const building =
      entities.length === 1 && BUILDING_TYPES[entities[0]?.type] && entities[0].team === TEAM.UA
        ? entities[0]
        : null;
    if (!building || !this.g.isProductionBuilding(building)) {
      hud.panel.classList.add('hidden');
      return;
    }

    hud.panel.classList.remove('hidden');
    hud.panel.dataset.buildingId = String(building.id);
    const current = building.queue[0];
    const progress = current ? Math.max(0, Math.min(1, 1 - current.left / current.duration)) : 0;
    hud.current.textContent = current
      ? `${UNIT_TYPES[current.type].short || UNIT_TYPES[current.type].name} · ${Math.max(0, Math.ceil(current.left))}s`
      : 'Queue empty';
    hud.progress.style.width = `${Math.round(progress * 100)}%`;

    for (let index = 0; index < hud.slots.length; index += 1) {
      const slot = hud.slots[index];
      const item = building.queue[index];
      const icon = slot.querySelector('.queueIcon');
      const time = slot.querySelector('.queueTime');
      if (!item) {
        slot.className = 'queueSlot empty';
        slot.disabled = true;
        slot.style.setProperty('--queue-progress', '0%');
        slot.title = `Queue slot ${index + 1} is empty`;
        icon.textContent = '—';
        time.textContent = '';
        continue;
      }
      const itemProgress = index === 0 ? progress : 0;
      slot.className = `queueSlot ${index === 0 ? 'active' : 'queued'}`;
      slot.disabled = false;
      slot.style.setProperty('--queue-progress', `${Math.round(itemProgress * 100)}%`);
      slot.title = `Cancel ${UNIT_TYPES[item.type].name}`;
      icon.textContent = initials(item.type);
      time.textContent = index === 0 ? `${Math.max(0, Math.ceil(item.left))}s` : `#${index + 1}`;
    }
  };

  const originalAppendProduction = UI.prototype.appendProduction;
  UI.prototype.appendProduction = function appendProductionWithRally(building) {
    if (this.g.isProductionBuilding(building)) {
      const armed = this.g.pendingRally?.buildingId === building.id;
      this.commandButton({
        title: armed ? 'Choose Rally Point' : 'Set Rally Point',
        description: 'New units exit toward and assemble at this location.',
        meta: 'R',
        className: `rally-command ${armed ? 'armed' : ''}`,
        onClick: () => {
          if (this.g.armRallyPoint(building.id)) {
            this.toast('Choose a rally point on the battlefield. Right-click or Esc cancels.');
          } else {
            this.toast(this.g.lastError);
          }
          this.refresh();
        },
      });
    }
    return originalAppendProduction.call(this, building);
  };

  const originalCommandStateSignature = UI.prototype.commandStateSignature;
  UI.prototype.commandStateSignature = function commandStateSignatureWithRally(entities) {
    const base = originalCommandStateSignature.call(this, entities);
    const rally = this.g.pendingRally ? `armed:${this.g.pendingRally.buildingId}` : 'idle';
    const points = entities
      .filter((entity) => BUILDING_TYPES[entity.type])
      .map((building) => `${building.id}:${Math.round(building.rallyPoint?.x || 0)}:${Math.round(building.rallyPoint?.y || 0)}`)
      .join('|');
    return `${base}::${rally}::${points}`;
  };

  const originalRefresh = UI.prototype.refresh;
  UI.prototype.refresh = function refreshWithProductionHud() {
    const result = originalRefresh.call(this);
    if (!this.g.mission) return result;
    const entities = this.g.selectedEntities();
    this.updateProductionHud(entities);
    document.body.classList.toggle('rallying', Boolean(this.g.pendingRally));
    if (this.g.pendingRally) {
      this.e.name.textContent = 'Choose Rally Point';
      this.e.stats.textContent = 'Left-click the battlefield to set where newly produced units assemble. Right-click or Esc cancels.';
    }
    return result;
  };

  for (const methodName of ['setMission', 'showMissionSelect']) {
    const original = UI.prototype[methodName];
    UI.prototype[methodName] = function resetProductionHud(...args) {
      const result = original.apply(this, args);
      this.productionHud?.panel.classList.add('hidden');
      document.body.classList.remove('rallying');
      return result;
    };
  }
}
