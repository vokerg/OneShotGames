import {
  COMBAT_CUE_KINDS,
  COMBAT_CUE_SEVERITIES,
  COMBAT_IMPACT_OUTCOMES,
} from '../ui/combat-readability.js';

function screenPoint(renderer, point) {
  return renderer.sp(point.x, point.y);
}

function cueLabel(cue) {
  if (cue.kind === COMBAT_CUE_KINDS.DAMAGE) return `-${Math.round(cue.value)}`;
  if (cue.text) return cue.text;
  if (cue.outcome === COMBAT_IMPACT_OUTCOMES.MISS) return 'MISS';
  if (cue.outcome === COMBAT_IMPACT_OUTCOMES.DEFLECT) return 'DEFLECT';
  if (cue.outcome === COMBAT_IMPACT_OUTCOMES.PENETRATE) return 'PENETRATION';
  return '';
}

export function drawCombatReadabilityOverlay({ game, renderer, snapshot }) {
  if (!snapshot || !renderer?.x || typeof renderer.sp !== 'function') return false;
  const context = renderer.x;
  const zoom = Number(game?.camera?.z) || 1;
  context.save();

  for (const ring of snapshot.rangeRings) {
    const position = screenPoint(renderer, ring.position);
    context.strokeStyle = 'rgba(255, 228, 123, 0.72)';
    context.lineWidth = 1.5;
    context.setLineDash([]);
    context.beginPath();
    context.arc(position.x, position.y, ring.maxRange * zoom, 0, Math.PI * 2);
    context.stroke();
    if (ring.minRange > 0) {
      context.strokeStyle = 'rgba(255, 160, 90, 0.68)';
      context.setLineDash([6, 5]);
      context.beginPath();
      context.arc(position.x, position.y, ring.minRange * zoom, 0, Math.PI * 2);
      context.stroke();
    }
  }

  for (const line of snapshot.targetLines) {
    const from = screenPoint(renderer, line.from);
    const to = screenPoint(renderer, line.to);
    context.strokeStyle = 'rgba(255, 225, 112, 0.85)';
    context.lineWidth = 1.5;
    context.setLineDash([7, 5]);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  context.setLineDash([]);
  context.textAlign = 'center';
  context.font = 'bold 12px monospace';
  for (const cue of snapshot.cues) {
    const position = screenPoint(renderer, cue.position);
    const alpha = Math.max(0.25, Math.min(1, cue.remainingTicks / Math.max(1, cue.durationTicks)));
    context.globalAlpha = alpha;
    if (cue.kind === COMBAT_CUE_KINDS.INCOMING) {
      context.strokeStyle = cue.severity === COMBAT_CUE_SEVERITIES.CRITICAL ? '#ff705f' : '#ffd36c';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(position.x, position.y, 20, Math.PI * 1.15, Math.PI * 1.85);
      context.stroke();
    }
    const label = cueLabel(cue);
    if (!label) continue;
    context.fillStyle = cue.kind === COMBAT_CUE_KINDS.DAMAGE
      ? '#fff0a5'
      : cue.severity === COMBAT_CUE_SEVERITIES.CRITICAL
        ? '#ff8b78'
        : '#f4df9a';
    context.fillText(label, position.x, position.y - 22);
  }

  context.globalAlpha = 1;
  context.restore();
  return true;
}

export function installCombatReadabilityOverlay({ game, renderer }) {
  if (!game || typeof game.combatReadabilitySnapshot !== 'function') {
    throw new TypeError('Combat readability overlay requires game.combatReadabilitySnapshot().');
  }
  if (!renderer || typeof renderer.render !== 'function') {
    throw new TypeError('Combat readability overlay requires renderer.render().');
  }
  const originalRender = renderer.render;
  renderer.render = () => {
    const result = originalRender.call(renderer);
    drawCombatReadabilityOverlay({ game, renderer, snapshot: game.combatReadabilitySnapshot() });
    return result;
  };
  return () => {
    renderer.render = originalRender;
  };
}
