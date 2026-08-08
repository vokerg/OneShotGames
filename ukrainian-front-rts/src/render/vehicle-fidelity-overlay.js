const ANGLES = Object.freeze({ n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 });
const STATES = new Set(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);
const DIRECTIONS = new Set(Object.keys(ANGLES));

function color(source, key, fallback) {
  return source?.paletteTokens?.[key] ?? fallback;
}

function identity(frameId, units) {
  if (frameId === 'missing' || frameId.endsWith('.portrait') || frameId.endsWith('.icon')) return null;
  const parts = frameId.split('.');
  const frame = parts.pop();
  const direction = parts.pop();
  const state = parts.pop();
  const unitId = parts.join('.');
  if (!/^f\d+$/.test(frame) || !STATES.has(state) || !DIRECTIONS.has(direction)) return null;
  const unit = units.get(unitId);
  return unit ? { unit, state, direction } : null;
}

function details(source, faction, profile, state) {
  const deep = color(source, 'deep', '#29342c');
  const light = color(source, 'light', '#8d947d');
  const metal = color(source, 'metal', '#97998d');
  const optic = color(source, 'optic', '#5e7c82');
  const accent = color(source, 'accent', '#d4c36c');
  const opacity = state === 'wreck' || state === 'death' ? 0.48 : state === 'damaged' || state === 'hit' ? 0.68 : 0.88;
  const profileDetail = profile === 'tank'
    ? `<path d="M28 24h9M31 22v5" stroke="${metal}" stroke-width="1"/><rect x="39" y="25" width="3" height="3" fill="${optic}"/>`
    : profile === 'ifv'
      ? `<rect x="30" y="24" width="4" height="3" fill="${optic}"/><rect x="35" y="25" width="3" height="2" fill="${light}"/>`
      : profile === 'recovery'
        ? `<path d="M22 38h18M24 36v4M37 36v4" stroke="${metal}" stroke-width="1"/>`
        : profile === 'engineering'
          ? `<path d="M43 24l6-2M43 31h7M43 38l6 3" stroke="${metal}" stroke-width="1"/>`
          : `<rect x="29" y="24" width="4" height="3" fill="${optic}"/>`;
  const recognition = faction === 'ukraine'
    ? `<g data-detail="recognition-panel" data-faction-detail="ukraine"><rect x="19" y="20" width="6" height="3" fill="${accent}"/><rect x="19" y="23" width="6" height="2" fill="${optic}"/></g>`
    : `<g data-detail="recognition-panel" data-faction-detail="russia"><rect x="19" y="20" width="6" height="5" fill="${accent}" opacity=".72"/><path d="M20 21h4M20 23h4" stroke="${deep}" stroke-width="1"/></g>`;
  return `<g opacity="${opacity}"><g data-detail="road-wheels" fill="${deep}" stroke="${metal}" stroke-width="1"><circle cx="13" cy="24" r="2.3"/><circle cx="13" cy="32" r="2.3"/><circle cx="13" cy="40" r="2.3"/><circle cx="51" cy="24" r="2.3"/><circle cx="51" cy="32" r="2.3"/><circle cx="51" cy="40" r="2.3"/></g><g data-detail="side-skirts" fill="none" stroke="${light}" stroke-width="1"><path d="M9 20h9v26H9"/><path d="M55 20h-9v26h9"/></g><g data-detail="hatch-lines" fill="none" stroke="${deep}" stroke-width="1"><path d="M24 34h17M26 37h13"/><path d="M22 29l4-2M42 29l-4-2"/></g><g data-detail="optic-cluster">${profileDetail}</g><g data-detail="tow-cable" fill="none" stroke="${metal}" stroke-width="1"><path d="M22 46c5 3 14 3 20-1"/></g>${recognition}</g>`;
}

export function enhanceVehicleAtlasSvg(generated, { faction } = {}) {
  if (!generated?.svg || !generated?.manifestObject || !generated?.source) throw new TypeError('Vehicle fidelity overlay requires generated atlas output.');
  if (!['ukraine', 'russia'].includes(faction)) throw new TypeError('Vehicle fidelity faction must be ukraine or russia.');
  const units = new Map(generated.source.units.map((unit) => [unit.id, unit]));
  const overlays = [];
  for (const [frameId, frame] of Object.entries(generated.manifestObject.frames)) {
    const current = identity(frameId, units);
    if (!current) continue;
    overlays.push(`<g transform="translate(${frame.rect.x} ${frame.rect.y})" data-fidelity-frame="${frameId}"><g transform="rotate(${ANGLES[current.direction]} 32 32)">${details(generated.source, faction, current.unit.profile, current.state)}</g></g>`);
  }
  const svg = generated.svg.replace('</svg>', `<g id="paired-vehicle-fidelity-v1" data-fidelity="paired-vehicle-v1">${overlays.join('')}</g></svg>`);
  return Object.freeze({ ...generated, svg, fidelity: Object.freeze({ version: 'paired-vehicle-v1', faction, overlayFrames: overlays.length }) });
}
