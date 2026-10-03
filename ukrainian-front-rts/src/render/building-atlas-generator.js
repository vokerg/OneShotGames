import { validateSpriteAtlasManifest } from './sprite-atlas-manifest.js';
import {
  BUILDING_ATLAS_ATTACHMENTS,
  BUILDING_ATLAS_DIMENSIONS,
  BUILDING_ATLAS_FAMILY,
  BUILDING_ATLAS_IDS,
  BUILDING_ATLAS_PROVENANCE,
  BUILDING_ATLAS_SCHEMA_VERSION,
  BUILDING_ATLAS_SOURCE_SCHEMA,
  BUILDING_ATLAS_STATES,
  buildingAtlasAnimation,
  buildingAtlasFrame,
  buildingAtlasId,
} from './building-atlas.js';

const MAX_ATLAS_WIDTH = 1024;
const PADDING = 2;
const REVIEW_COLUMNS = 8;
const REVIEW_CELL = 132;

const PALETTE = Object.freeze({
  ink: '#111512',
  metal: '#9aa291',
  fire: '#d95b3f',
  smoke: '#5e625b',
  diagnostic: '#ff4fa3',
  white: '#ffffff',
  ua: Object.freeze({ deep: '#18271f', shadow: '#293c30', base: '#50684c', light: '#81956a', accent: '#e4ca54', optic: '#4e8db2' }),
  ru: Object.freeze({ deep: '#2a211b', shadow: '#41342a', base: '#6c5947', light: '#94775a', accent: '#cdbd9d', optic: '#786957' }),
});

const EXPECTED_ROLES = Object.freeze([
  'air-defense', 'command', 'engineer', 'fires', 'infantry', 'logistics', 'uas-ew', 'vehicle',
]);

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sameRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength;
}

export function validateBuildingArtSource(value) {
  const input = requireObject(value, 'Building art source');
  if (input.schema !== BUILDING_ATLAS_SOURCE_SCHEMA) throw new TypeError(`Building art source schema must be ${BUILDING_ATLAS_SOURCE_SCHEMA}.`);
  if (input.version !== BUILDING_ATLAS_SCHEMA_VERSION) throw new TypeError(`Unsupported building art source version: ${input.version}.`);
  if (input.family !== BUILDING_ATLAS_FAMILY) throw new TypeError(`Building art source family must be ${BUILDING_ATLAS_FAMILY}.`);
  const provenance = requireObject(input.provenance, 'Building art provenance');
  if (!sameRecord(provenance, BUILDING_ATLAS_PROVENANCE)) throw new TypeError('Building art provenance does not match the runtime contract.');
  if (!Array.isArray(input.buildings)) throw new TypeError('Building art source buildings must be an array.');
  const expectedIds = Object.values(BUILDING_ATLAS_IDS).flat().sort(stableCompare);
  const ids = new Set();
  const rolesByFaction = { ukraine: new Set(), russia: new Set() };
  const buildings = input.buildings.map((value, index) => {
    const building = requireObject(value, `Building art source entry ${index}`);
    const id = requireString(building.id, `Building art source entry ${index} id`);
    if (ids.has(id)) throw new TypeError(`Duplicate building art source ID: ${id}.`);
    ids.add(id);
    const faction = requireString(building.faction, `${id} faction`);
    if (!Object.hasOwn(BUILDING_ATLAS_IDS, faction) || !BUILDING_ATLAS_IDS[faction].includes(id)) {
      throw new TypeError(`${id}: faction does not match the canonical building atlas contract.`);
    }
    const role = requireString(building.role, `${id} role`);
    if (!EXPECTED_ROLES.includes(role)) throw new TypeError(`${id}: unsupported building role ${role}.`);
    rolesByFaction[faction].add(role);
    if (!Number.isInteger(building.tier) || building.tier < 0 || building.tier > 2) throw new TypeError(`${id}: tier must be an integer from 0 through 2.`);
    return Object.freeze({ id, faction, role, tier: building.tier, silhouette: requireString(building.silhouette, `${id} silhouette`) });
  }).sort((left, right) => stableCompare(left.id, right.id));
  if (!sameRecord(buildings.map((building) => building.id), expectedIds)) throw new TypeError('Building art source does not cover the exact canonical production-structure roster.');
  for (const faction of Object.keys(rolesByFaction)) {
    if (!sameRecord([...rolesByFaction[faction]].sort(stableCompare), [...EXPECTED_ROLES])) {
      throw new TypeError(`${faction}: building art source must cover every visual role exactly once.`);
    }
  }
  return Object.freeze({
    schema: input.schema,
    version: input.version,
    id: requireString(input.id, 'Building art source id'),
    family: input.family,
    provenance: BUILDING_ATLAS_PROVENANCE,
    buildings: Object.freeze(buildings),
  });
}

function colorsFor(faction) {
  return faction === 'ukraine' ? PALETTE.ua : PALETTE.ru;
}

function largeRoleMarkup(building, colors) {
  const ua = building.faction === 'ukraine';
  switch (building.role) {
    case 'command': return ua ? [
      `<rect x="68" y="18" width="4" height="38" fill="${PALETTE.ink}"/>`,
      `<rect x="69" y="17" width="2" height="39" fill="${PALETTE.metal}"/>`,
      `<path d="M58 25h24M61 19h18M64 31h12" stroke="${colors.accent}" stroke-width="3"/>`,
      `<path d="M53 35q8-13 16 0" fill="none" stroke="${colors.optic}" stroke-width="4"/>`,
      `<rect x="25" y="31" width="25" height="7" fill="${colors.deep}"/>`,
      `<rect x="28" y="28" width="7" height="7" fill="${colors.optic}"/>`,
      `<rect x="38" y="28" width="7" height="7" fill="${colors.optic}"/>`,
    ].join('') : [
      `<rect x="68" y="13" width="6" height="43" fill="${PALETTE.ink}"/>`,
      `<rect x="70" y="12" width="2" height="44" fill="${PALETTE.metal}"/>`,
      `<path d="M57 18h27M60 27h21M63 36h15" stroke="${colors.accent}" stroke-width="4"/>`,
      `<rect x="20" y="28" width="39" height="12" fill="${colors.deep}"/>`,
      `<rect x="24" y="31" width="12" height="5" fill="${colors.optic}"/>`,
      `<rect x="40" y="31" width="14" height="5" fill="${colors.optic}"/>`,
    ].join('');
    case 'logistics': return ua ? [
      `<rect x="16" y="49" width="17" height="21" fill="${colors.shadow}"/>`,
      `<rect x="35" y="44" width="18" height="26" fill="${colors.light}"/>`,
      `<rect x="55" y="49" width="18" height="21" fill="${colors.shadow}"/>`,
      `<path d="M18 53h13M37 49h14M57 53h14" stroke="${colors.accent}" stroke-width="2"/>`,
      `<rect x="22" y="72" width="48" height="5" fill="${PALETTE.metal}"/>`,
    ].join('') : [
      `<rect x="13" y="48" width="22" height="26" fill="${colors.deep}"/>`,
      `<rect x="38" y="44" width="21" height="30" fill="${colors.shadow}"/>`,
      `<rect x="62" y="48" width="22" height="26" fill="${colors.deep}"/>`,
      `<rect x="17" y="52" width="14" height="5" fill="${colors.light}"/>`,
      `<rect x="42" y="49" width="13" height="5" fill="${colors.light}"/>`,
      `<rect x="66" y="52" width="14" height="5" fill="${colors.light}"/>`,
      `<path d="M12 76h73" stroke="${PALETTE.metal}" stroke-width="5"/>`,
    ].join('');
    case 'infantry': return ua ? [
      `<rect x="17" y="36" width="14" height="29" fill="${colors.shadow}"/>`,
      `<rect x="34" y="30" width="14" height="35" fill="${colors.light}"/>`,
      `<rect x="51" y="36" width="14" height="29" fill="${colors.shadow}"/>`,
      `<rect x="20" y="40" width="8" height="4" fill="${colors.optic}"/>`,
      `<rect x="37" y="34" width="8" height="4" fill="${colors.optic}"/>`,
      `<rect x="54" y="40" width="8" height="4" fill="${colors.optic}"/>`,
    ].join('') : [
      `<rect x="13" y="33" width="58" height="30" fill="${colors.shadow}"/>`,
      `<path d="M18 33v-7h8v7m9 0v-10h8v10m9 0v-7h8v7" fill="${colors.light}"/>`,
      `<path d="M18 43h45M18 52h45" stroke="${colors.deep}" stroke-width="4"/>`,
    ].join('');
    case 'vehicle': return ua ? [
      `<rect x="15" y="51" width="67" height="22" fill="${colors.deep}"/>`,
      `<rect x="20" y="56" width="18" height="13" fill="${PALETTE.ink}"/>`,
      `<rect x="42" y="56" width="18" height="13" fill="${PALETTE.ink}"/>`,
      `<rect x="64" y="56" width="13" height="13" fill="${PALETTE.ink}"/>`,
      `<path d="M23 53h51" stroke="${colors.accent}" stroke-width="3"/>`,
      `<path d="M67 50V30h5v20l11-9" fill="none" stroke="${PALETTE.metal}" stroke-width="4"/>`,
    ].join('') : [
      `<rect x="11" y="48" width="74" height="27" fill="${colors.deep}"/>`,
      `<rect x="17" y="54" width="28" height="16" fill="${PALETTE.ink}"/>`,
      `<rect x="50" y="54" width="29" height="16" fill="${PALETTE.ink}"/>`,
      `<path d="M16 49h64" stroke="${colors.light}" stroke-width="4"/>`,
      `<path d="M70 49V25h6v24l9-12" fill="none" stroke="${PALETTE.metal}" stroke-width="5"/>`,
    ].join('');
    case 'uas-ew': return ua ? [
      `<rect x="45" y="16" width="4" height="42" fill="${PALETTE.ink}"/>`,
      `<rect x="46" y="15" width="2" height="43" fill="${PALETTE.metal}"/>`,
      `<path d="M29 23h35M34 31h25" stroke="${colors.optic}" stroke-width="4"/>`,
      `<path d="M32 18q14-12 28 0" fill="none" stroke="${colors.accent}" stroke-width="3"/>`,
      `<rect x="19" y="44" width="19" height="18" fill="${colors.shadow}"/>`,
      `<rect x="55" y="44" width="20" height="18" fill="${colors.shadow}"/>`,
    ].join('') : [
      `<rect x="45" y="10" width="6" height="49" fill="${PALETTE.ink}"/>`,
      `<path d="M20 20h57M27 29h43M34 38h29" stroke="${colors.optic}" stroke-width="5"/>`,
      `<path d="M23 17l9-8M73 17l-9-8" stroke="${PALETTE.metal}" stroke-width="4"/>`,
      `<rect x="16" y="46" width="64" height="17" fill="${colors.deep}"/>`,
    ].join('');
    case 'fires': return ua ? [
      `<rect x="22" y="38" width="51" height="16" fill="${colors.shadow}"/>`,
      `<rect x="29" y="31" width="37" height="8" fill="${PALETTE.metal}"/>`,
      `<path d="M32 29h31l-5-8H37z" fill="${colors.accent}"/>`,
      `<rect x="18" y="58" width="18" height="13" fill="${colors.deep}"/>`,
      `<rect x="59" y="58" width="18" height="13" fill="${colors.deep}"/>`,
    ].join('') : [
      `<rect x="16" y="38" width="64" height="17" fill="${colors.shadow}"/>`,
      `<rect x="22" y="29" width="52" height="10" fill="${PALETTE.metal}"/>`,
      `<path d="M27 28h42l-7-10H34z" fill="${colors.light}"/>`,
      `<rect x="12" y="58" width="25" height="15" fill="${colors.deep}"/>`,
      `<rect x="60" y="58" width="25" height="15" fill="${colors.deep}"/>`,
    ].join('');
    case 'air-defense': return ua ? [
      `<rect x="44" y="21" width="5" height="35" fill="${PALETTE.ink}"/>`,
      `<path d="M47 18L26 33h42z" fill="${colors.optic}" stroke="${PALETTE.ink}" stroke-width="3"/>`,
      `<rect x="31" y="38" width="33" height="9" fill="${colors.shadow}"/>`,
      `<path d="M18 57l12-8M77 57l-12-8" stroke="${PALETTE.metal}" stroke-width="5"/>`,
    ].join('') : [
      `<rect x="45" y="16" width="6" height="41" fill="${PALETTE.ink}"/>`,
      `<path d="M48 13L22 34h52z" fill="${colors.optic}" stroke="${PALETTE.ink}" stroke-width="4"/>`,
      `<rect x="27" y="38" width="42" height="11" fill="${colors.deep}"/>`,
      `<path d="M14 60l17-11M82 60L65 49" stroke="${PALETTE.metal}" stroke-width="6"/>`,
    ].join('');
    case 'engineer': return ua ? [
      `<rect x="18" y="50" width="59" height="19" fill="${colors.shadow}"/>`,
      `<path d="M22 50l13-18h27l12 18z" fill="${colors.light}"/>`,
      `<path d="M47 48V25h5v23l16-15" fill="none" stroke="${colors.accent}" stroke-width="4"/>`,
      `<rect x="25" y="63" width="44" height="7" fill="${PALETTE.metal}"/>`,
    ].join('') : [
      `<rect x="13" y="48" width="71" height="22" fill="${colors.shadow}"/>`,
      `<path d="M18 48l15-19h32l15 19z" fill="${colors.light}"/>`,
      `<path d="M49 47V19h6v28l19-16" fill="none" stroke="${colors.accent}" stroke-width="5"/>`,
      `<rect x="19" y="63" width="59" height="8" fill="${PALETTE.metal}"/>`,
    ].join('');
    default: throw new RangeError(`Unknown building role: ${building.role}.`);
  }
}

function iconRoleMarkup(role, colors) {
  const common = `<rect x="7" y="22" width="26" height="11" fill="${colors.shadow}"/>`;
  switch (role) {
    case 'command': return `${common}<rect x="25" y="7" width="2" height="16" fill="${colors.accent}"/><rect x="21" y="6" width="10" height="3" fill="${colors.optic}"/>`;
    case 'logistics': return `${common}<rect x="8" y="17" width="7" height="7" fill="${colors.light}"/><rect x="17" y="15" width="7" height="9" fill="${colors.base}"/><rect x="26" y="17" width="7" height="7" fill="${colors.light}"/>`;
    case 'infantry': return `${common}<rect x="9" y="12" width="5" height="11" fill="${colors.light}"/><rect x="17" y="9" width="6" height="14" fill="${colors.base}"/><rect x="26" y="12" width="5" height="11" fill="${colors.light}"/>`;
    case 'vehicle': return `${common}<rect x="9" y="16" width="22" height="9" fill="${colors.deep}"/><rect x="15" y="19" width="10" height="5" fill="${PALETTE.metal}"/>`;
    case 'uas-ew': return `${common}<rect x="19" y="7" width="2" height="16" fill="${colors.optic}"/><rect x="11" y="10" width="18" height="3" fill="${colors.optic}"/>`;
    case 'fires': return `${common}<rect x="11" y="13" width="18" height="7" fill="${colors.base}"/><rect x="15" y="9" width="10" height="4" fill="${colors.accent}"/>`;
    case 'air-defense': return `${common}<path d="M20 8L10 20h20z" fill="${colors.optic}"/><rect x="18" y="18" width="4" height="6" fill="${colors.deep}"/>`;
    case 'engineer': return `${common}<path d="M10 22l6-10h8l6 10z" fill="${colors.light}"/><rect x="19" y="9" width="3" height="13" fill="${colors.accent}"/>`;
    default: throw new RangeError(`Unknown building role: ${role}.`);
  }
}

function constructionMarkup(building, state, colors) {
  const ua = building.faction === 'ukraine';
  const pad = ua
    ? `<path d="M9 78L23 61h54l10 17-7 10H16z" fill="${colors.deep}"/><path d="M16 77L28 65h43l9 12-6 6H21z" fill="${colors.shadow}"/>`
    : `<path d="M6 77L18 58h63l10 19-7 11H13z" fill="${colors.deep}"/><path d="M11 76L23 63h52l9 13-6 7H18z" fill="${colors.shadow}"/>`;
  if (state === 'placement') return `${pad}<path d="M10 78L24 57h52l11 21-8 10H18z" fill="none" stroke="${colors.accent}" stroke-width="2" stroke-dasharray="5 3"/><path d="M17 81L80 62M19 63l60 20" stroke="${colors.optic}" stroke-width="2" opacity=".9"/>`;
  if (state === 'foundation') return `${pad}<path d="M18 72h61v11H18z" fill="${PALETTE.metal}"/><path d="M23 69h51v7H23z" fill="${colors.base}"/><path d="M28 68v15M48 68v15M68 68v15" stroke="${colors.deep}" stroke-width="3"/>`;
  if (state === 'frame') return `${pad}<path d="M19 70V39l12-13h39l10 13v31M21 42h57M31 27v43M48 27v43M66 27v43" fill="none" stroke="${PALETTE.metal}" stroke-width="5"/><path d="M20 70h59" stroke="${colors.accent}" stroke-width="3"/>`;
  if (state === 'fitout') return `${pad}<path d="M17 43l13-15h39l12 15v37H17z" fill="${colors.deep}"/><path d="M22 44l11-11h33l10 11v31H22z" fill="${colors.base}"/><path d="M22 44h54L66 33H33z" fill="${colors.light}"/><rect x="40" y="59" width="16" height="16" fill="${PALETTE.ink}"/>`;
  return null;
}

function groundAndShellMarkup(building, colors) {
  const ua = building.faction === 'ukraine';
  const ground = [
    `<ellipse cx="49" cy="86" rx="${ua ? 42 : 45}" ry="${ua ? 7 : 8}" fill="${PALETTE.ink}" opacity=".7"/>`,
    ua
      ? `<path d="M8 76l14-21h56l10 21-9 11H17z" fill="${colors.deep}"/><path d="M14 75l13-15h46l8 15-7 7H21z" fill="${colors.shadow}"/>`
      : `<path d="M5 76l13-24h64l11 24-9 12H13z" fill="${colors.deep}"/><path d="M11 75l13-17h52l10 17-8 8H18z" fill="${colors.shadow}"/><path d="M8 70h10M80 70h10M14 61h10M74 61h10" stroke="${PALETTE.metal}" stroke-width="4"/>`,
  ].join('');
  const shell = ua ? [
    `<path d="M17 43L31 27h38l13 16v36H17z" fill="${colors.deep}"/>`,
    `<path d="M22 44L34 32h32l11 12v30H22z" fill="${colors.base}"/>`,
    `<path d="M22 44h55L66 32H34z" fill="${colors.light}"/>`,
    `<path d="M22 44v30h55V44l-7 6H29z" fill="${colors.base}" opacity=".78"/>`,
    `<path d="M29 50h41M29 56h41" stroke="${colors.shadow}" stroke-width="2"/>`,
    `<rect x="39" y="59" width="18" height="16" fill="${PALETTE.ink}"/><rect x="43" y="63" width="10" height="12" fill="${colors.shadow}"/>`,
    `<path d="M18 78h63" stroke="${PALETTE.metal}" stroke-width="3"/>`,
    `<rect x="24" y="47" width="8" height="5" fill="${colors.optic}"/><rect x="67" y="47" width="7" height="5" fill="${colors.optic}"/>`,
  ].join('') : [
    `<path d="M12 45L25 28h48l14 17v35H12z" fill="${colors.deep}"/>`,
    `<path d="M17 45L29 33h40l12 12v30H17z" fill="${colors.base}"/>`,
    `<path d="M17 45h64L69 33H29z" fill="${colors.light}"/>`,
    `<path d="M17 45v30h64V45l-8 7H25z" fill="${colors.shadow}" opacity=".7"/>`,
    `<path d="M23 52h52M23 60h52" stroke="${colors.deep}" stroke-width="3"/>`,
    `<rect x="38" y="59" width="21" height="17" fill="${PALETTE.ink}"/><rect x="43" y="63" width="11" height="13" fill="${colors.shadow}"/>`,
    `<path d="M13 79h74" stroke="${PALETTE.metal}" stroke-width="4"/>`,
    `<rect x="22" y="48" width="11" height="5" fill="${colors.optic}"/><rect x="66" y="48" width="10" height="5" fill="${colors.optic}"/>`,
  ].join('');
  return ground + shell;
}

function surfaceDetailMarkup(building, colors) {
  const ua = building.faction === 'ukraine';
  const tier = building.tier;
  return [
    ua
      ? `<path d="M31 36h34M27 41h42" stroke="${colors.shadow}" stroke-width="2"/><rect x="28" y="67" width="7" height="5" fill="${colors.accent}"/>`
      : `<path d="M28 37h42M24 42h50" stroke="${colors.shadow}" stroke-width="3"/><rect x="66" y="67" width="8" height="5" fill="${colors.accent}"/>`,
    tier > 0 ? `<rect x="${ua ? 60 : 23}" y="54" width="10" height="5" fill="${PALETTE.metal}"/>` : '',
    tier > 1 ? `<path d="M${ua ? 59 : 27} 54v-8h11v8" fill="none" stroke="${colors.optic}" stroke-width="3"/>` : '',
  ].join('');
}

function damageMarkup(state) {
  if (state === 'damaged') return '<path d="M25 34l8 8-6 9 10 9M63 45l7 7-5 10" fill="none" stroke="#111512" stroke-width="4"/><path d="M61 24h11v13H61z" fill="#5e625b" opacity=".85"/>';
  if (state === 'critical') return '<path d="M22 31l12 11-8 11 14 12M62 29l-9 13 11 10-8 13" fill="none" stroke="#111512" stroke-width="4"/><path d="M59 17h17v24H59z" fill="#5e625b" opacity=".9"/><path d="M63 38l5-15 7 15z" fill="#d95b3f"/><rect x="67" y="28" width="5" height="12" fill="#e49346"/>';
  return '';
}

function destructionMarkup(phase, colors) {
  if (phase === 0) return `<path d="M12 58l15-24h45l14 24v27H12z" fill="${colors.deep}"/><path d="M20 57l12-17h34l12 17" fill="${colors.base}"/><path d="M18 60l14-14 9 8 12-22 20 25" fill="none" stroke="${PALETTE.ink}" stroke-width="5"/><path d="M61 25h13v18H61z" fill="${PALETTE.smoke}"/>`;
  if (phase === 1) return `<path d="M9 67l17-25 18 13 12-21 28 32v20H9z" fill="${colors.shadow}"/><path d="M19 66l13-13 10 8 13-20 20 22" fill="none" stroke="${PALETTE.ink}" stroke-width="6"/><path d="M56 20h18v26H56z" fill="${PALETTE.smoke}"/><path d="M61 48l6-20 8 20z" fill="${PALETTE.fire}"/>`;
  return `<path d="M7 79l15-21 16 10 12-19 15 16 13-10 12 24-6 9H13z" fill="${colors.shadow}"/><path d="M18 76l14-11 11 7 12-14 17 12" fill="none" stroke="${PALETTE.ink}" stroke-width="6"/><rect x="29" y="66" width="15" height="9" fill="${PALETTE.metal}"/><path d="M58 57l5-18 8 18z" fill="${PALETTE.fire}"/>`;
}

function rubbleMarkup(building, colors) {
  const ua = building.faction === 'ukraine';
  return [
    `<ellipse cx="49" cy="86" rx="${ua ? 42 : 45}" ry="8" fill="${PALETTE.ink}" opacity=".7"/>`,
    `<path d="M7 80l14-19 13 9 14-21 12 18 14-11 15 24-7 8H14z" fill="${colors.shadow}"/>`,
    `<path d="M18 78l13-11 10 7 10-14 15 10 10-7" fill="none" stroke="${colors.deep}" stroke-width="6"/>`,
    `<rect x="27" y="69" width="16" height="8" fill="${PALETTE.metal}"/><rect x="57" y="72" width="14" height="7" fill="${colors.base}"/>`,
    ua ? `<rect x="18" y="73" width="7" height="5" fill="${colors.accent}"/>` : `<rect x="72" y="73" width="8" height="5" fill="${colors.accent}"/>`,
  ].join('');
}

function runtimeMarkup(building, state, phase) {
  const colors = colorsFor(building.faction);
  if (state === 'icon') {
    return `<rect x="2" y="2" width="36" height="36" fill="${colors.deep}"/><path d="M5 31V13l6-6h18l6 6v18z" fill="${colors.base}"/><path d="M5 13h30L29 7H11z" fill="${colors.light}"/>${iconRoleMarkup(building.role, colors)}<rect x="6" y="6" width="5" height="5" fill="${colors.accent}"/>`;
  }
  const construction = constructionMarkup(building, state, colors);
  if (construction) return `<ellipse cx="49" cy="86" rx="43" ry="7" fill="${PALETTE.ink}" opacity=".65"/>${construction}<rect x="44" y="78" width="8" height="8" fill="${colors.accent}"/>`;
  if (state === 'destruction') return `<ellipse cx="49" cy="86" rx="44" ry="8" fill="${PALETTE.ink}" opacity=".7"/>${destructionMarkup(phase, colors)}`;
  if (state === 'rubble') return rubbleMarkup(building, colors);
  return [
    groundAndShellMarkup(building, colors),
    surfaceDetailMarkup(building, colors),
    largeRoleMarkup(building, colors),
    state === 'active'
      ? `<path d="M24 79h49" stroke="${colors.accent}" stroke-width="4"/><rect x="78" y="28" width="8" height="8" fill="${colors.optic}"/><rect x="80" y="30" width="4" height="4" fill="${PALETTE.white}"/>`
      : '',
    damageMarkup(state),
    `<rect x="44" y="78" width="8" height="8" fill="${colors.accent}"/>`,
  ].join('');
}

function diagnosticMarkup() {
  return `<rect x="1" y="1" width="38" height="38" fill="${PALETTE.diagnostic}"/><path d="M1 1h10v10H1zm20 0h10v10H21zM11 11h10v10H11zm20 0h8v10h-8zM1 21h10v10H1zm20 0h10v10H21zM11 31h10v8H11zm20 0h8v8h-8z" fill="${PALETTE.ink}"/><rect x="1" y="1" width="38" height="38" fill="none" stroke="${PALETTE.white}" stroke-width="2"/>`;
}

function frameSpecs(buildings) {
  const frames = [];
  for (const building of buildings) {
    for (const [state, contract] of Object.entries(BUILDING_ATLAS_STATES)) {
      for (let phase = 0; phase < contract.frames; phase += 1) {
        const icon = state === 'icon';
        const dimensions = icon ? BUILDING_ATLAS_DIMENSIONS.icon : BUILDING_ATLAS_DIMENSIONS.battlefield;
        frames.push({
          id: buildingAtlasFrame(building.id, state, { phase }),
          building,
          state,
          phase,
          width: dimensions.width,
          height: dimensions.height,
          anchor: dimensions.anchor,
          markup: runtimeMarkup(building, state, phase),
        });
      }
    }
  }
  frames.push({
    id: `buildings.${buildings[0].faction}.missing`,
    building: null,
    state: 'missing',
    phase: 0,
    width: 40,
    height: 40,
    anchor: { x: 20, y: 20 },
    markup: diagnosticMarkup(),
  });
  return frames.sort((left, right) => stableCompare(left.id, right.id));
}

function packFrames(frames) {
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  let usedWidth = 0;
  const placed = [];
  for (const frame of frames) {
    if (x > PADDING && x + frame.width + PADDING > MAX_ATLAS_WIDTH) {
      x = PADDING;
      y += rowHeight + PADDING;
      rowHeight = 0;
    }
    placed.push(Object.freeze({ ...frame, x, y }));
    usedWidth = Math.max(usedWidth, x + frame.width + PADDING);
    rowHeight = Math.max(rowHeight, frame.height);
    x += frame.width + PADDING;
  }
  return Object.freeze({ frames: Object.freeze(placed), width: usedWidth, height: y + rowHeight + PADDING });
}

function frameRecord(frame) {
  const battlefield = frame.state !== 'icon' && frame.state !== 'missing';
  const attachments = battlefield
    ? {
        entrance: { x: 48, y: 82 },
        exit: { x: 48, y: 84 },
        rally: { x: 48, y: 90 },
        capture: { x: 48, y: 18 },
        effect: { x: 48, y: 22 },
      }
    : { center: { x: frame.width / 2, y: frame.height / 2 } };
  const masks = battlefield
    ? { selection: { x: 4, y: 52, w: 88, h: 40 }, footprint: { x: 8, y: 55, w: 80, h: 37 } }
    : { icon: { x: 1, y: 1, w: frame.width - 2, h: frame.height - 2 } };
  return {
    rect: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
    sourceSize: { w: frame.width, h: frame.height },
    offset: { x: 0, y: 0 },
    anchor: frame.anchor,
    attachments,
    masks,
    tags: frame.building
      ? ['building', frame.building.faction, frame.building.role, frame.state]
      : ['building', 'fallback', 'diagnostic'],
  };
}

function animationsFor(buildings) {
  const animations = {};
  for (const building of buildings) {
    for (const [state, contract] of Object.entries(BUILDING_ATLAS_STATES)) {
      const frames = Array.from({ length: contract.frames }, (_, phase) => ({
        frame: buildingAtlasFrame(building.id, state, { phase }),
        durationMs: state === 'destruction' ? [120, 120, 180][phase] : contract.durationMs,
      }));
      animations[buildingAtlasAnimation(building.id, state)] = {
        loop: contract.loop,
        defaultDurationMs: contract.durationMs,
        frames,
      };
    }
  }
  return Object.fromEntries(Object.entries(animations).sort(([left], [right]) => stableCompare(left, right)));
}

function atlasSvg(faction, layout) {
  const groups = layout.frames.map((frame) =>
    `  <g id="${xmlEscape(frame.id)}" transform="translate(${frame.x} ${frame.y})">${frame.markup}</g>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" shape-rendering="crispEdges">`,
    `  <title>Fields of Resolve ${xmlEscape(faction)} production building atlas</title>`,
    `  <metadata>${xmlEscape(JSON.stringify(BUILDING_ATLAS_PROVENANCE))}</metadata>`,
    ...groups,
    '</svg>',
    '',
  ].join('\n');
}

function generateFactionAtlas(faction, buildings) {
  const layout = packFrames(frameSpecs(buildings));
  const frames = Object.fromEntries(layout.frames.map((frame) => [frame.id, frameRecord(frame)]));
  const fallback = `buildings.${faction}.missing`;
  const manifestValue = {
    schema: 'fields-of-resolve.sprite-atlas',
    version: 1,
    id: buildingAtlasId(faction),
    sampling: 'nearest',
    image: { src: `buildings-${faction}.svg`, width: layout.width, height: layout.height, pixelRatio: 1 },
    directions: { order: ['n'], zero: 'n', clockwise: true },
    paletteTokens: {
      ink: PALETTE.ink,
      metal: PALETTE.metal,
      fire: PALETTE.fire,
      smoke: PALETTE.smoke,
      accent: colorsFor(faction).accent,
      optic: colorsFor(faction).optic,
    },
    frames,
    animations: animationsFor(buildings),
    fallback: { frame: fallback },
  };
  const manifest = validateSpriteAtlasManifest(manifestValue, { source: `${faction} building atlas` });
  return Object.freeze({
    faction,
    manifestValue,
    manifest: `${JSON.stringify(manifestValue, null, 2)}\n`,
    svg: atlasSvg(faction, layout),
    frameCount: layout.frames.length,
    productionFrameCount: layout.frames.length - 1,
    animationCount: Object.keys(manifest.animations).length,
    width: layout.width,
    height: layout.height,
    frameMarkups: Object.freeze(Object.fromEntries(layout.frames.map((frame) => [frame.id, frame.markup]))),
  });
}

function contactSheet(atlases) {
  const frames = atlases.flatMap((atlas) => Object.entries(atlas.frameMarkups)
    .filter(([id]) => !id.endsWith('.missing'))
    .map(([id, markup]) => ({ id, markup, manifest: atlas.manifestValue.frames[id] })))
    .sort((left, right) => stableCompare(left.id, right.id));
  const rows = Math.ceil(frames.length / REVIEW_COLUMNS);
  const cells = frames.map((frame, index) => {
    const x = (index % REVIEW_COLUMNS) * REVIEW_CELL;
    const y = Math.floor(index / REVIEW_COLUMNS) * REVIEW_CELL;
    const sourceWidth = frame.manifest.sourceSize.w;
    const sourceHeight = frame.manifest.sourceSize.h;
    const scale = Math.min(92 / sourceWidth, 92 / sourceHeight);
    const drawX = x + (REVIEW_CELL - sourceWidth * scale) / 2;
    const drawY = y + 7 + (92 - sourceHeight * scale) / 2;
    return [
      `  <g transform="translate(${drawX} ${drawY}) scale(${scale})">${frame.markup}</g>`,
      `  <rect x="${x}" y="${y}" width="${REVIEW_CELL}" height="${REVIEW_CELL}" fill="none" stroke="#5b655c"/>`,
      `  <text x="${x + 5}" y="${y + 112}" font-family="monospace" font-size="7" fill="#e5eadf">${xmlEscape(frame.id)}</text>`,
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${REVIEW_COLUMNS * REVIEW_CELL}" height="${rows * REVIEW_CELL}" viewBox="0 0 ${REVIEW_COLUMNS * REVIEW_CELL} ${rows * REVIEW_CELL}">`,
    '  <title>Fields of Resolve production building review sheet</title>',
    '  <rect width="100%" height="100%" fill="#1b211d"/>',
    ...cells,
    '</svg>',
    '',
  ].join('\n');
}

export function generateBuildingArt(sourceValue) {
  const source = validateBuildingArtSource(sourceValue);
  const atlases = Object.freeze(['ukraine', 'russia'].map((faction) =>
    generateFactionAtlas(faction, source.buildings.filter((building) => building.faction === faction)),
  ));
  return Object.freeze({
    source,
    atlases,
    contactSheet: contactSheet(atlases),
    buildingCount: source.buildings.length,
    productionFrameCount: atlases.reduce((sum, atlas) => sum + atlas.productionFrameCount, 0),
    runtimeFrameCount: atlases.reduce((sum, atlas) => sum + atlas.frameCount, 0),
    animationCount: atlases.reduce((sum, atlas) => sum + atlas.animationCount, 0),
  });
}

export function verifyBuildingArtArtifacts(sourceValue) {
  const first = generateBuildingArt(sourceValue);
  const second = generateBuildingArt(sourceValue);
  if (!sameRecord(first.atlases.map((atlas) => atlas.manifest), second.atlases.map((atlas) => atlas.manifest))) {
    throw new Error('Building atlas manifests are not deterministic.');
  }
  if (!sameRecord(first.atlases.map((atlas) => atlas.svg), second.atlases.map((atlas) => atlas.svg))) {
    throw new Error('Building atlas SVG outputs are not deterministic.');
  }
  if (first.contactSheet !== second.contactSheet) throw new Error('Building review sheet is not deterministic.');
  if (first.buildingCount !== 16 || first.productionFrameCount !== 208 || first.runtimeFrameCount !== 210) {
    throw new Error(`Unexpected building art coverage: ${first.buildingCount} buildings, ${first.productionFrameCount} production frames, ${first.runtimeFrameCount} runtime frames.`);
  }
  if (first.animationCount !== 176) throw new Error(`Unexpected building animation count: ${first.animationCount}.`);
  for (const atlas of first.atlases) {
    const manifest = validateSpriteAtlasManifest(JSON.parse(atlas.manifest));
    for (const buildingId of BUILDING_ATLAS_IDS[atlas.faction]) {
      const idleId = buildingAtlasFrame(buildingId, 'idle');
      const idle = manifest.frames[idleId];
      if (!idle) throw new Error(`Missing idle frame ${idleId}.`);
      if (idle.anchor.x !== 48 || idle.anchor.y !== 88) throw new Error(`${idleId}: footprint-origin anchor drift.`);
      for (const attachment of BUILDING_ATLAS_ATTACHMENTS) {
        if (!idle.attachments[attachment]) throw new Error(`${idleId}: missing ${attachment} attachment.`);
      }
      for (const [state, contract] of Object.entries(BUILDING_ATLAS_STATES)) {
        const animationId = buildingAtlasAnimation(buildingId, state);
        const animation = manifest.animations[animationId];
        if (!animation) throw new Error(`Missing animation ${animationId}.`);
        const sequence = animation.frames;
        if (sequence.length !== contract.frames) throw new Error(`${animationId}: expected ${contract.frames} frames.`);
        for (let phase = 0; phase < contract.frames; phase += 1) {
          const frameId = buildingAtlasFrame(buildingId, state, { phase });
          if (!manifest.frames[frameId]) throw new Error(`Missing frame ${frameId}.`);
        }
      }
    }
    const idleMarkups = BUILDING_ATLAS_IDS[atlas.faction].map((id) => atlas.frameMarkups[buildingAtlasFrame(id, 'idle')]);
    if (new Set(idleMarkups).size !== idleMarkups.length) throw new Error(`${atlas.faction}: building role silhouettes are not distinct.`);
  }
  if (/<script\b|<foreignObject\b|href=["']https?:/i.test(first.contactSheet)) throw new Error('Building review sheet contains unsafe external content.');
  return Object.freeze({
    buildingCount: first.buildingCount,
    productionFrameCount: first.productionFrameCount,
    runtimeFrameCount: first.runtimeFrameCount,
    animationCount: first.animationCount,
    atlasBytes: first.atlases.reduce((sum, atlas) => sum + byteLength(atlas.svg) + byteLength(atlas.manifest), 0),
    contactSheetBytes: byteLength(first.contactSheet),
  });
}
