import { BUILDING_TYPES, TEAM } from './config.js';

export function installProductionRenderer(Renderer) {
  Renderer.prototype.drawProductionProgress = function drawProductionProgress() {
    const q = this.x;
    const z = this.g.camera.z;
    q.save();
    q.textAlign = 'center';
    q.font = '9px monospace';
    for (const building of this.g.buildings) {
      if (building.team !== TEAM.UA || building.underConstruction || !building.queue.length) continue;
      const current = building.queue[0];
      const progress = Math.max(0, Math.min(1, 1 - current.left / current.duration));
      const screen = this.sp(building.x, building.y);
      const type = BUILDING_TYPES[building.type];
      const width = Math.max(48, Math.min(72, type.w * z));
      const x = screen.x - width / 2;
      const y = screen.y - type.h * z * 0.72 - 18;
      q.fillStyle = 'rgba(13,17,13,.88)';
      q.fillRect(x - 2, y - 2, width + 4, 15);
      q.strokeStyle = '#b89a54';
      q.lineWidth = 1;
      q.strokeRect(x - 1.5, y - 1.5, width + 3, 14);
      q.fillStyle = '#426f91';
      q.fillRect(x, y, width * progress, 7);
      q.fillStyle = '#efd576';
      q.fillText(`${Math.ceil(current.left)}s · ${building.queue.length}`, screen.x, y + 12);
    }
    q.restore();
  };

  Renderer.prototype.drawRallyPoint = function drawRallyPoint() {
    let building = null;
    let point = null;
    if (this.g.pendingRally) {
      building = this.g.buildings.find((candidate) => candidate.id === this.g.pendingRally.buildingId);
      point = { x: this.g.mouse.wx, y: this.g.mouse.wy };
    } else {
      building = this.g.selectedEntities().find(
        (entity) => entity.team === TEAM.UA && BUILDING_TYPES[entity.type] && this.g.isProductionBuilding(entity),
      );
      point = building?.rallyPoint || null;
    }
    if (!building || !point) return;

    const q = this.x;
    const start = this.sp(building.x, building.y);
    const end = this.sp(point.x, point.y);
    q.save();
    q.strokeStyle = this.g.pendingRally ? '#e8dc80' : 'rgba(224,199,91,.8)';
    q.fillStyle = '#e0c75b';
    q.lineWidth = 2;
    q.setLineDash([8, 6]);
    q.beginPath();
    q.moveTo(start.x, start.y);
    q.lineTo(end.x, end.y);
    q.stroke();
    q.setLineDash([]);

    q.beginPath();
    q.arc(end.x, end.y, 10, 0, Math.PI * 2);
    q.stroke();
    q.fillRect(end.x - 1, end.y - 22, 3, 22);
    q.beginPath();
    q.moveTo(end.x + 2, end.y - 22);
    q.lineTo(end.x + 16, end.y - 17);
    q.lineTo(end.x + 2, end.y - 11);
    q.closePath();
    q.fill();
    q.font = 'bold 10px monospace';
    q.textAlign = 'center';
    q.fillStyle = '#fff0a0';
    q.fillText(this.g.pendingRally ? 'SET RALLY' : 'RALLY', end.x, end.y + 24);
    q.restore();
  };

  const originalRender = Renderer.prototype.render;
  Renderer.prototype.render = function renderWithProductionOverlays() {
    originalRender.call(this);
    this.drawProductionProgress();
    this.drawRallyPoint();
  };
}
