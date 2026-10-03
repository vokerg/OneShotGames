import { TEAM } from '../config.js';

/** A missing/loading sprite must never make a live unit invisible. */
export function drawFallbackContact(renderer, entity, stats = {}, { portrait = false } = {}) {
  const q = portrait ? renderer.px : renderer.x;
  if (!q?.save || !entity) return;
  const z = portrait ? 2 : renderer.g.camera.z;
  const point = portrait ? { x: 72, y: 53 } : renderer.sp(entity.x, entity.y);
  const friendly = entity.team === TEAM.UA;
  const width = (stats.armor ? 24 : 18) * z, height = 14 * z;
  q.save();
  if (portrait) { q.clearRect(0, 0, 144, 112); q.fillStyle = '#13211f'; q.fillRect(0, 0, 144, 112); }
  q.translate(point.x, point.y);
  q.fillStyle = friendly ? '#214b5d' : '#5d302a';
  q.strokeStyle = entity.selected ? '#ffe39a' : friendly ? '#95d6e8' : '#ffad91';
  q.lineWidth = entity.selected ? 3 : 2;
  q.fillRect(-width / 2, -height / 2, width, height);
  q.strokeRect(-width / 2, -height / 2, width, height);
  q.beginPath();
  if (stats.armor) q.ellipse(0, 0, width * .3, height * .28, 0, 0, Math.PI * 2);
  else { q.moveTo(-width * .35, -height * .35); q.lineTo(width * .35, height * .35); q.moveTo(width * .35, -height * .35); q.lineTo(-width * .35, height * .35); }
  q.stroke();
  if (portrait) {
    q.font = '10px system-ui'; q.textAlign = 'center'; q.fillStyle = '#dce9e0';
    q.fillText(stats.short || 'FIELD UNIT', 0, 36, 126);
  }
  q.restore();
  if (!portrait && renderer.selection) renderer.selection(entity, point, { size: stats.size || 12 }, z);
}
