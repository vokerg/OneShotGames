#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function patch(path, transform) {
  const file = resolve(root, path);
  const before = await readFile(file, 'utf8');
  const after = transform(before);
  if (after === before) return false;
  await writeFile(file, after);
  return true;
}

function replaceBlock(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    if (source.includes(replacement.slice(0, Math.min(80, replacement.length)))) return source;
    throw new Error(`Unable to locate ${label}`);
  }
  return source.replace(pattern, replacement);
}

const uaStandingBody = `function standingBody(motion, pose, palette, uniform, light) {
  const faceShade = pose.vector.x >= 0 ? palette['uniform-dark'] : light;
  const oppositeShade = pose.vector.x >= 0 ? light : palette['uniform-dark'];
  return \`<g data-human-body="standing" data-directional-body="fixed-upright">
    <g data-detail="boots-knees">
      <rect x="13" y="31" width="8" height="13" rx="2" fill="\${palette.ink}" transform="translate(\${motion.leftLeg} 0)"/>
      <rect x="27" y="31" width="8" height="13" rx="2" fill="\${palette.ink}" transform="translate(\${motion.rightLeg} 0)"/>
      <rect x="15" y="31" width="5" height="7" fill="\${uniform}" opacity=".9" transform="translate(\${motion.leftLeg} 0)"/>
      <rect x="28" y="31" width="5" height="7" fill="\${uniform}" opacity=".9" transform="translate(\${motion.rightLeg} 0)"/>
      <rect x="14" y="36" width="7" height="3" rx="1" fill="\${palette.shadow}" transform="translate(\${motion.leftLeg} 0)"/>
      <rect x="27" y="36" width="7" height="3" rx="1" fill="\${palette.shadow}" transform="translate(\${motion.rightLeg} 0)"/>
      <rect x="13" y="41" width="9" height="3" rx="1" fill="\${palette['uniform-dark']}" transform="translate(\${motion.leftLeg} 0)"/>
      <rect x="26" y="41" width="9" height="3" rx="1" fill="\${palette['uniform-dark']}" transform="translate(\${motion.rightLeg} 0)"/>
    </g>
    <rect x="8" y="18" width="8" height="15" rx="3" fill="\${oppositeShade}"/>
    <rect x="32" y="18" width="8" height="15" rx="3" fill="\${faceShade}"/>
    <path d="M12 18 Q24 12 36 18 L33 35 Q24 40 15 35 Z" fill="\${uniform}" stroke="\${palette.ink}" stroke-width="1.5"/>
    <path d="M14 19 Q19 15 24 15 L22 35 Q18 36 15 33 Z" fill="\${light}" opacity=".82"/>
    <path d="M24 15 Q30 15 34 19 L33 33 Q29 36 24 35 Z" fill="\${palette['uniform-dark']}" opacity=".78"/>
    <g data-detail="load-bearing-kit">
      <path d="M17 18 L21 18 L20 34 L16 33 Z M27 18 L31 19 L32 33 L28 34 Z" fill="\${palette.shadow}" opacity=".72"/>
      <rect x="19" y="21" width="10" height="9" rx="1" fill="\${palette.shadow}" opacity=".62"/>
      <rect x="18" y="29" width="5" height="5" rx="1" fill="\${palette['uniform-dark']}"/>
      <rect x="25" y="29" width="5" height="5" rx="1" fill="\${palette['uniform-dark']}"/>
      <path d="M20 23 H28 M24 20 V32" stroke="\${palette.equipment}" stroke-width="1" opacity=".48"/>
    </g>
    <circle cx="\${pose.headX}" cy="\${pose.headY}" r="7.5" fill="\${light}" stroke="\${palette.ink}" stroke-width="1.5"/>
    <path d="M\${pose.headX - 7.5} \${pose.headY} Q\${pose.headX} \${pose.headY - 10} \${pose.headX + 7.5} \${pose.headY} L\${pose.headX + 7} \${pose.headY + 4} L\${pose.headX - 7} \${pose.headY + 4} Z" fill="\${palette['uniform-dark']}"/>
    <g data-detail="helmet-fittings">
      <path d="M\${pose.headX - 6} \${pose.headY - 1} H\${pose.headX + 6}" stroke="\${palette.shadow}" stroke-width="1.5"/>
      <rect x="\${pose.headX - 2}" y="\${pose.headY - 6}" width="4" height="3" rx="1" fill="\${palette.ink}"/>
      <rect x="\${pose.headX + pose.vector.x * 4 - 1.5}" y="\${pose.headY + pose.vector.y * 2 - 1.5}" width="3" height="3" fill="\${palette.equipment}"/>
    </g>
    <rect x="\${pose.headX - 3}" y="\${pose.headY + 1}" width="6" height="2.5" fill="\${palette.ink}" opacity=".58"/>
  </g>\`;
}`;

const uaWeapon = `function serviceWeapon(pose, palette, accent, width = 4) {
  const vx = pose.vector.x;
  const vy = pose.vector.y;
  const stockX = pose.shoulderX - vx * 5;
  const stockY = pose.shoulderY - vy * 4;
  const receiverX = pose.shoulderX + vx * 5;
  const receiverY = pose.shoulderY + vy * 3.5;
  return \`<g data-equipment="service-weapon" data-detail="weapon-material">
    <path d="M\${stockX} \${stockY} L\${pose.weaponX} \${pose.weaponY}" stroke="\${palette.ink}" stroke-width="\${width + 2}" stroke-linecap="square"/>
    <path d="M\${pose.shoulderX} \${pose.shoulderY} L\${pose.weaponX} \${pose.weaponY}" stroke="\${palette.equipment}" stroke-width="\${width}" stroke-linecap="square"/>
    <path d="M\${stockX} \${stockY} L\${pose.shoulderX} \${pose.shoulderY}" stroke="\${palette['uniform-dark']}" stroke-width="\${Math.max(3, width)}"/>
    <circle cx="\${receiverX}" cy="\${receiverY}" r="\${Math.max(1.5, width * 0.45)}" fill="\${palette.shadow}" stroke="\${palette.ink}" stroke-width="1"/>
    <rect x="\${pose.shoulderX - 3}" y="\${pose.shoulderY + 2}" width="7" height="5" fill="\${accent}"/>
  </g>\`;
}`;

const ruDirectionalHelpers = `const DIRECTION_VECTORS = Object.freeze({
  n: Object.freeze({ x: 0, y: -1 }),
  ne: Object.freeze({ x: 0.72, y: -0.72 }),
  e: Object.freeze({ x: 1, y: 0 }),
  se: Object.freeze({ x: 0.72, y: 0.72 }),
  s: Object.freeze({ x: 0, y: 1 }),
  sw: Object.freeze({ x: -0.72, y: 0.72 }),
  w: Object.freeze({ x: -1, y: 0 }),
  nw: Object.freeze({ x: -0.72, y: -0.72 }),
});

function directionalPose(direction, recoil = 0) {
  const vector = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.n;
  const shoulderX = 24 + vector.x * 2.8;
  const shoulderY = 21 + vector.y * 1.4;
  const weaponX = shoulderX + vector.x * (16 - recoil);
  const weaponY = shoulderY + vector.y * (11 - recoil * 0.45);
  const headX = 24 + vector.x * 1.7;
  const headY = 11 + vector.y * 1.0;
  return Object.freeze({ vector, shoulderX, shoulderY, weaponX, weaponY, headX, headY });
}`;

const ruEquipment = `function equipmentSvg(unit, p, pose) {
  const vx = pose.vector.x;
  const vy = pose.vector.y;
  const sx = pose.shoulderX;
  const sy = pose.shoulderY;
  const wx = pose.weaponX;
  const wy = pose.weaponY;
  const weapon = \`<g data-detail="weapon-material"><path d="M\${sx - vx * 5} \${sy - vy * 4} L\${wx} \${wy}" stroke="\${p.ink}" stroke-width="6"/><path d="M\${sx} \${sy} L\${wx} \${wy}" stroke="\${p.metal}" stroke-width="3"/><circle cx="\${sx + vx * 5}" cy="\${sy + vy * 3.5}" r="2" fill="\${p.deep}"/></g>\`;
  if (unit.equipment === 'tool') return \`<g data-role="tool"><path d="M15 28 L\${15 - vx * 10} \${27 - vy * 8}" stroke="\${p.metal}" stroke-width="4"/><path d="M\${12 - vx * 10} \${25 - vy * 8} L\${18 - vx * 10} \${30 - vy * 8}" stroke="\${p.accent}" stroke-width="4"/></g>\`;
  if (unit.equipment === 'radio') return \`\${weapon}<g data-role="radio"><rect x="10" y="21" width="9" height="12" rx="2" fill="\${p.deep}"/><rect x="12" y="23" width="5" height="4" fill="\${p.accent}"/><path d="M14 21 L12 7" stroke="\${p.metal}" stroke-width="2"/></g>\`;
  if (unit.equipment === 'launcher') return \`<g data-detail="weapon-material" data-role="launcher"><path d="M\${sx - vx * 4} \${sy - vy * 3} L\${wx} \${wy}" stroke="\${p.ink}" stroke-width="9"/><path d="M\${sx} \${sy} L\${wx} \${wy}" stroke="\${p.deep}" stroke-width="6"/><circle cx="\${wx - vx * 3}" cy="\${wy - vy * 2}" r="3" fill="\${p.accent}"/></g>\`;
  if (unit.equipment === 'air-defense') return \`<g data-role="air-defense"><path d="M15 28 L\${17 + vx * 18} \${23 + vy * 14}" stroke="\${p.ink}" stroke-width="8"/><path d="M19 29 L\${21 + vx * 18} \${25 + vy * 14}" stroke="\${p.ink}" stroke-width="8"/><path d="M15 28 L\${17 + vx * 18} \${23 + vy * 14}" stroke="\${p.metal}" stroke-width="3"/><path d="M19 29 L\${21 + vx * 18} \${25 + vy * 14}" stroke="\${p.metal}" stroke-width="3"/><rect x="12" y="27" width="10" height="5" fill="\${p.accent}"/></g>\`;
  if (unit.equipment === 'optic') return \`\${weapon}<circle cx="\${sx + vx * 8}" cy="\${sy + vy * 5}" r="3" fill="\${p.optic}" stroke="\${p.ink}"/>\`;
  if (unit.equipment === 'medical') return \`<g data-role="medical"><rect x="17" y="21" width="14" height="12" rx="2" fill="\${p.medical}" stroke="\${p.ink}"/><rect x="22" y="22" width="4" height="10" fill="\${p.medicalMark}"/><rect x="19" y="25" width="10" height="4" fill="\${p.medicalMark}"/></g>\`;
  if (unit.equipment === 'grenade') return \`\${weapon}<circle cx="14" cy="28" r="3" fill="\${p.accent}" stroke="\${p.ink}"/>\`;
  return weapon;
}`;

const ruFrame = `function renderInfantryFrame(source, unit, state, direction, frameIndex) {
  const p = {
    ink: palette(source, 'ink', '#111512'), deep: palette(source, 'deep', '#2a211b'), shadow: palette(source, 'shadow', '#41342a'),
    base: palette(source, 'base', '#6c5947'), light: palette(source, 'light', '#94775a'), metal: palette(source, 'metal', '#918d7d'),
    accent: palette(source, unit.accent, palette(source, 'accent', '#cdbd9d')), optic: palette(source, 'optic', '#786957'),
    damage: palette(source, 'damage', '#d95f45'), medical: palette(source, 'medical', '#d7d9cf'), medicalMark: palette(source, 'medical-mark', '#9d3835'),
  };
  const move = state === 'move' ? Math.sin((frameIndex / 6) * Math.PI * 2) * 2 : 0;
  const idle = state === 'idle' ? (frameIndex % 2 ? 0.8 : 0) : 0;
  const recoil = state === 'attack' ? [0, 2.2, 0.8][frameIndex] ?? 0 : 0;
  const hit = state === 'hit' ? (frameIndex === 0 ? 1 : 0) : 0;
  const death = state === 'death' ? Math.min(1, frameIndex / 4) : 0;
  const bodyRotate = death * 72 + hit * 5;
  const bodyY = idle + death * 7;
  const opacity = state === 'wreck' ? 0.72 : 1;
  const pose = directionalPose(direction, recoil);
  const damageOverlay = state === 'damaged' || state === 'hit' ? \`<path d="M13 26 L18 22 L22 27 L27 23" stroke="\${p.damage}" stroke-width="2" fill="none"/>\` : '';
  const muzzle = state === 'attack' && frameIndex === 1 ? \`<circle cx="\${pose.weaponX}" cy="\${pose.weaponY}" r="4" fill="#f2d57a"/><rect x="\${pose.weaponX - 1}" y="\${pose.weaponY - 1}" width="2" height="2" fill="#fff1aa"/>\` : '';
  if (state === 'wreck') {
    return \`<g opacity="\${opacity}"><ellipse cx="24" cy="38" rx="15" ry="4" fill="rgba(0,0,0,.3)"/><g data-human-body="prone" transform="rotate(78 24 29)"><rect x="8" y="21" width="32" height="14" rx="4" fill="\${p.shadow}" stroke="\${p.ink}" stroke-width="2"/><circle cx="38" cy="27" r="6" fill="\${p.deep}"/><path d="M18 27 L38 23" stroke="\${p.deep}" stroke-width="4"/></g></g>\`;
  }
  return \`<g opacity="\${opacity}">
    <ellipse cx="24" cy="41" rx="12" ry="3.5" fill="rgba(0,0,0,.28)"/>
    <g data-human-body="standing" data-directional-body="fixed-upright" transform="translate(0 \${bodyY}) rotate(\${bodyRotate} 24 28)">
      <g data-detail="boots-knees">
        <path d="M17 \${31 + move} L16 42" stroke="\${p.ink}" stroke-width="7"/><path d="M30 \${31 - move} L32 42" stroke="\${p.ink}" stroke-width="7"/>
        <path d="M17 \${31 + move} L17 37" stroke="\${p.base}" stroke-width="4"/><path d="M30 \${31 - move} L31 37" stroke="\${p.base}" stroke-width="4"/>
        <rect x="13" y="36" width="8" height="3" rx="1" fill="\${p.shadow}"/><rect x="28" y="36" width="8" height="3" rx="1" fill="\${p.shadow}"/>
        <rect x="13" y="40" width="9" height="3" rx="1" fill="\${p.deep}"/><rect x="27" y="40" width="10" height="3" rx="1" fill="\${p.deep}"/>
      </g>
      <rect x="9" y="19" width="8" height="14" rx="3" fill="\${pose.vector.x >= 0 ? p.light : p.shadow}"/>
      <rect x="31" y="19" width="8" height="14" rx="3" fill="\${pose.vector.x >= 0 ? p.shadow : p.light}"/>
      <path d="M13 18 Q24 13 35 18 L33 35 Q24 39 15 35 Z" fill="\${p.base}" stroke="\${p.ink}" stroke-width="1.5"/>
      <path d="M15 19 L23 16 L21 35 L16 34 Z" fill="\${p.light}" opacity=".72"/><path d="M24 16 L34 19 L32 34 L25 35 Z" fill="\${p.shadow}" opacity=".78"/>
      <g data-detail="load-bearing-kit">
        <path d="M17 18 L21 18 L20 34 L16 33 Z M27 18 L31 19 L32 33 L28 34 Z" fill="\${p.deep}" opacity=".72"/>
        <rect x="19" y="21" width="10" height="9" rx="1" fill="\${p.shadow}"/>
        <rect x="18" y="29" width="5" height="5" rx="1" fill="\${p.deep}"/><rect x="25" y="29" width="5" height="5" rx="1" fill="\${p.deep}"/>
        <path d="M20 23 H28 M24 20 V32" stroke="\${p.metal}" stroke-width="1" opacity=".42"/>
      </g>
      <circle cx="\${pose.headX}" cy="\${pose.headY}" r="7" fill="\${p.light}" stroke="\${p.ink}" stroke-width="1.5"/>
      <path d="M\${pose.headX - 7} \${pose.headY} Q\${pose.headX} \${pose.headY - 9} \${pose.headX + 7} \${pose.headY} L\${pose.headX + 6} \${pose.headY + 3} L\${pose.headX - 6} \${pose.headY + 3} Z" fill="\${p.deep}"/>
      <g data-detail="helmet-fittings"><path d="M\${pose.headX - 5} \${pose.headY - 1} H\${pose.headX + 5}" stroke="\${p.shadow}" stroke-width="1.5"/><rect x="\${pose.headX - 2}" y="\${pose.headY - 5}" width="4" height="3" rx="1" fill="\${p.ink}"/><rect x="\${pose.headX + pose.vector.x * 4 - 1}" y="\${pose.headY + pose.vector.y * 2 - 1}" width="2" height="2" fill="\${p.metal}"/></g>
      \${equipmentSvg(unit, p, pose)}\${damageOverlay}\${muzzle}
    </g>
  </g>\`;
}`;

let changed = false;
changed = await patch('src/render/ukrainian-infantry-atlas-generator.js', (source) => {
  let out = replaceBlock(source, /function standingBody\([\s\S]*?\n}\n\nfunction proneBody/, `${uaStandingBody}\n\nfunction proneBody`, 'Ukrainian standing body');
  out = replaceBlock(out, /function serviceWeapon\([\s\S]*?\n}\n\nfunction roleMark/, `${uaWeapon}\n\nfunction roleMark`, 'Ukrainian service weapon');
  return out;
}) || changed;

changed = await patch('src/render/russian-infantry-atlas-generator.js', (source) => {
  let out = source;
  if (!out.includes('const DIRECTION_VECTORS')) {
    out = out.replace(/const DIRECTION_ANGLES = Object\.freeze\([^\n]+\);/, (match) => `${match}\n\n${ruDirectionalHelpers}`);
  }
  out = replaceBlock(out, /function equipmentSvg\([\s\S]*?\n}\n\nfunction renderInfantryFrame/, `${ruEquipment}\n\nfunction renderInfantryFrame`, 'Russian equipment');
  out = replaceBlock(out, /function renderInfantryFrame\([\s\S]*?\n}\n\nfunction renderPortrait/, `${ruFrame}\n\nfunction renderPortrait`, 'Russian infantry frame');
  out = out.replace(
    /function directionAttachment\(direction\) \{[\s\S]*?\n}/,
    `function directionAttachment(direction) {\n  const vector = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.n;\n  return { x: Number((24 + vector.x * 18).toFixed(2)), y: Number((24 + vector.y * 18).toFixed(2)) };\n}`,
  );
  return out;
}) || changed;

console.log(changed ? '[issue-215] materialized infantry fidelity changes' : '[issue-215] no changes required');
