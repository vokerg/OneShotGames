(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');
const menu = document.getElementById('menu');
const ui = document.getElementById('ui');
const startBtn = document.getElementById('start');
const healthValue = document.getElementById('healthValue');
const healthFill = document.getElementById('healthFill');
const weaponName = document.getElementById('weaponName');
const ammoValue = document.getElementById('ammoValue');
const scoreValue = document.getElementById('scoreValue');
const hostilesValue = document.getElementById('hostilesValue');
const sectorEl = document.getElementById('sector');
const objectiveEl = document.getElementById('objective');
const messageEl = document.getElementById('message');
const crosshair = document.getElementById('crosshair');

ctx.imageSmoothingEnabled = false;
mctx.imageSmoothingEnabled = false;

let W = canvas.width;
let H = canvas.height;
let depth = new Float32Array(W);
let floorFrame = ctx.createImageData(W, H);
const FOV = Math.PI / 3;
const MAX_DIST = 26;
const TEX = 64;
const keys = new Set();
let mouseDown = false;
let last = 0;
let running = false;
let audio = null;
let screenShake = 0;
let damageFlash = 0;
let muzzle = 0;
let hitMarker = 0;
let messageTimer = 0;
let visualClock = 0;
let grainPhase = 0;
let state = {};

function resize() {
  const aspect = Math.max(.75, window.innerWidth / Math.max(1, window.innerHeight));
  const targetW = Math.max(640, Math.min(960, Math.floor(window.innerWidth * .72)));
  const targetH = Math.max(360, Math.min(600, Math.floor(targetW / aspect)));
  if (canvas.width === targetW && canvas.height === targetH) return;
  canvas.width = targetW;
  canvas.height = targetH;
  W = targetW;
  H = targetH;
  depth = new Float32Array(W);
  floorFrame = ctx.createImageData(W, H);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const levels = [
  { name: 'SECTOR I — ADMINISTRATION', start: [2.5, 2.5, 0], map: [
    '11111111111111111111','10000000000000000001','10P00000111100000001','10001100100100022001','10001000100100020001','10001000000100020001','10001111111100020001','10000000000000020001','10000033000000020001','11110033001111121111','10000000001000000001','10002222001000333001','10002002000000303001','10002002011110303001','10000002010000300001','10111112010000333301','10000000010000000001','100000000000000000E1','10000000000000000001','11111111111111111111'
  ], enemies: [[8.5,3.5,'rifle'],[14.5,4.5,'rifle'],[5.5,8.5,'guard'],[16.5,11.5,'guard'],[12.5,16.5,'rifle']], pickups: [[3.5,10.5,'shells'],[8.5,14.5,'health'],[15.5,7.5,'bullets']] },
  { name: 'SECTOR II — MOTOR POOL', start: [2.5,17.5,-Math.PI/2], map: [
    '11111111111111111111','10000000000000000001','10003333333002222001','10003000003002002001','10003000003002002001','10003300333002222001','10000000300000000001','11111000300111110001','10001000300100010001','10001000000100010001','10001111111100010001','10000000000000010001','10222200033333010001','10200200030003010001','10200200030003010001','10222200033333010001','10000000000000000001','10000000111111111111','1E000000000000000001','11111111111111111111'
  ], enemies: [[5.5,3.5,'guard'],[10.5,3.5,'rifle'],[16.5,3.5,'heavy'],[7.5,8.5,'rifle'],[15.5,9.5,'guard'],[5.5,14.5,'heavy'],[12.5,14.5,'rifle']], pickups: [[2.5,8.5,'health'],[9.5,6.5,'shells'],[17.5,12.5,'bullets'],[10.5,17.5,'health']] },
  { name: 'SECTOR III — CENTRAL BUNKER', start: [2.5,2.5,0], map: [
    '11111111111111111111','10000000000000000001','10001111111111111001','10001000000000001001','10001022222000001001','10001020002033331001','10001020002030001001','10000020000030000001','11111022222033331111','10001000000000001001','10001011111111001001','10001010000001001001','10000010044001000001','10333010044001111001','10303010000000001001','10303011111111101001','10333000000000001001','100000000000000000E1','10000000000000000001','11111111111111111111'
  ], enemies: [[8.5,3.5,'rifle'],[15.5,3.5,'heavy'],[7.5,7.5,'guard'],[13.5,7.5,'rifle'],[3.5,11.5,'guard'],[8.5,12.5,'heavy'],[14.5,12.5,'rifle'],[4.5,17.5,'heavy'],[11.5,17.5,'guard'],[16.5,17.5,'commander']], pickups: [[3.5,6.5,'bullets'],[17.5,6.5,'health'],[6.5,15.5,'shells'],[13.5,15.5,'health']] }
];

const weapons = [
  { name: 'TOKAREV', ammo: 'bullets', clip: 8, damage: 34, delay: 300, spread: .014, pellets: 1, range: 13, kick: 1.9 },
  { name: 'TRENCH GUN', ammo: 'shells', clip: 5, damage: 17, delay: 760, spread: .1, pellets: 7, range: 8.5, kick: 5.3 },
  { name: 'PPSh-41', ammo: 'bullets', clip: 35, damage: 17, delay: 105, spread: .043, pellets: 1, range: 12, kick: 2.4 }
];

const enemyStats = {
  guard: { hp: 55, speed: .65, damage: 7, rate: 1100, range: 6, score: 100 },
  rifle: { hp: 75, speed: .52, damage: 10, rate: 950, range: 8, score: 150 },
  heavy: { hp: 130, speed: .38, damage: 14, rate: 1250, range: 7, score: 250 },
  commander: { hp: 260, speed: .46, damage: 17, rate: 700, range: 9, score: 600 }
};

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeTexture(kind, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = g.createImageData(TEX, TEX);
  const d = img.data;
  let base;
  if (kind === 'concrete') base = [94, 89, 79];
  else if (kind === 'steel') base = [102, 35, 32];
  else if (kind === 'green') base = [58, 70, 64];
  else if (kind === 'gate') base = [119, 25, 29];
  else if (kind === 'floor') base = [56, 49, 43];
  else base = [40, 40, 39];
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = (y * TEX + x) * 4;
      const coarse = (rnd() - .5) * 24;
      const fine = (Math.sin(x * .71 + y * .17) + Math.sin(y * .39)) * 3;
      d[i] = Math.max(0, Math.min(255, base[0] + coarse + fine));
      d[i+1] = Math.max(0, Math.min(255, base[1] + coarse * .8 + fine));
      d[i+2] = Math.max(0, Math.min(255, base[2] + coarse * .65 + fine));
      d[i+3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'source-over';

  if (kind === 'concrete') {
    g.strokeStyle = 'rgba(22,20,17,.55)';
    g.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      let x = rnd() * TEX, y = rnd() * TEX;
      g.moveTo(x, y);
      for (let p = 0; p < 5; p++) { x += (rnd() - .5) * 14; y += rnd() * 10; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(190,177,145,.08)';
    for (let i = 0; i < 18; i++) g.fillRect(rnd()*TEX, rnd()*TEX, 1+rnd()*3, 1+rnd()*2);
  } else if (kind === 'steel' || kind === 'gate') {
    g.fillStyle = 'rgba(13,9,8,.44)';
    for (let x = 0; x < TEX; x += 16) g.fillRect(x, 0, 2, TEX);
    g.fillStyle = 'rgba(224,101,64,.14)';
    for (let x = 3; x < TEX; x += 16) g.fillRect(x, 0, 1, TEX);
    g.fillStyle = '#2a1714';
    for (let x = 7; x < TEX; x += 16) for (let y = 7; y < TEX; y += 16) g.fillRect(x, y, 2, 2);
    g.fillStyle = 'rgba(214,126,67,.22)';
    for (let i = 0; i < 28; i++) g.fillRect(rnd()*TEX, rnd()*TEX, 1+rnd()*4, 1+rnd()*2);
    if (kind === 'gate') {
      g.fillStyle = 'rgba(237,190,68,.72)';
      g.fillRect(29, 7, 6, 50);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI/2 + i*Math.PI/5;
        const r = i%2 ? 7 : 15;
        const x = 32 + Math.cos(a)*r, y = 32 + Math.sin(a)*r;
        i ? g.lineTo(x,y) : g.moveTo(x,y);
      }
      g.closePath(); g.fill();
    }
  } else if (kind === 'green') {
    g.fillStyle = 'rgba(8,17,14,.38)';
    g.fillRect(0, 31, TEX, 2);
    g.fillRect(31, 0, 2, TEX);
    g.fillStyle = 'rgba(161,181,153,.08)';
    g.fillRect(2, 2, 28, 1);
    g.fillRect(34, 34, 28, 1);
  } else if (kind === 'floor') {
    g.fillStyle = 'rgba(10,10,9,.42)';
    g.fillRect(0, 0, TEX, 2);
    g.fillRect(0, 31, TEX, 3);
    g.fillRect(0, 62, TEX, 2);
    g.fillRect(0, 0, 2, TEX);
    g.fillRect(31, 0, 3, TEX);
    g.fillRect(62, 0, 2, TEX);
    g.strokeStyle = 'rgba(151,126,91,.12)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(rnd()*TEX, rnd()*TEX);
      g.lineTo(rnd()*TEX, rnd()*TEX);
      g.stroke();
    }
  } else if (kind === 'ceiling') {
    g.fillStyle = 'rgba(0,0,0,.45)';
    for (let y = 0; y < TEX; y += 12) g.fillRect(0, y, TEX, 3);
    g.fillStyle = 'rgba(125,115,91,.12)';
    for (let x = 4; x < TEX; x += 20) g.fillRect(x, 0, 2, TEX);
  }

  return { canvas: c, pixels: g.getImageData(0, 0, TEX, TEX).data };
}

const textures = {
  '1': makeTexture('concrete', 11),
  '2': makeTexture('steel', 22),
  '3': makeTexture('green', 33),
  '4': makeTexture('gate', 44),
  floor: makeTexture('floor', 55),
  ceiling: makeTexture('ceiling', 66)
};

function makeEnemySprite(type, dead = false) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 144;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  const heavy = type === 'heavy';
  const commander = type === 'commander';
  const coat = commander ? '#746033' : heavy ? '#4b503f' : '#4f5c48';
  const coatDark = commander ? '#332719' : '#252c24';
  const trim = commander ? '#b49c51' : '#73775d';

  if (dead) {
    g.save();
    g.translate(48, 112);
    g.rotate(-.16);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(0, 18, 43, 10, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = coatDark; g.fillRect(-34, -3, 69, 18);
    g.fillStyle = coat; g.fillRect(-24, -13, 48, 22);
    g.fillStyle = '#ad8a64'; g.fillRect(22, -10, 14, 13);
    g.fillStyle = '#171817'; g.fillRect(-36, 7, 22, 8);
    g.restore();
    return c;
  }

  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.ellipse(48, 134, 34, 7, 0, 0, Math.PI*2); g.fill();

  g.fillStyle = '#191b18';
  g.fillRect(25, 111, 18, 23); g.fillRect(54, 111, 18, 23);
  g.fillStyle = '#0f100f';
  g.fillRect(21, 129, 24, 8); g.fillRect(52, 129, 24, 8);

  const body = g.createLinearGradient(22, 52, 77, 112);
  body.addColorStop(0, trim); body.addColorStop(.22, coat); body.addColorStop(1, coatDark);
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(28, 52); g.lineTo(68, 52); g.lineTo(78, 112); g.lineTo(18, 112); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.34)'; g.fillRect(46, 53, 4, 59);
  g.fillStyle = '#352a1d'; g.fillRect(18, 86, 60, 9);
  g.fillStyle = '#b08a43'; g.fillRect(43, 85, 11, 11);
  g.fillStyle = '#161812'; g.fillRect(46, 88, 5, 5);

  if (heavy) {
    g.fillStyle = '#2d332c';
    g.fillRect(16, 54, 15, 48); g.fillRect(66, 54, 15, 48);
    g.fillStyle = '#151915'; g.fillRect(13, 59, 9, 37); g.fillRect(75, 59, 9, 37);
  } else {
    g.fillStyle = coatDark;
    g.beginPath(); g.moveTo(28,58); g.lineTo(17,64); g.lineTo(13,99); g.lineTo(26,101); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(68,58); g.lineTo(80,64); g.lineTo(84,99); g.lineTo(71,101); g.closePath(); g.fill();
  }

  g.fillStyle = '#ad8d67'; g.fillRect(34, 27, 28, 27);
  g.fillStyle = '#6a4d38'; g.fillRect(35, 47, 27, 8);
  g.fillStyle = '#30251e'; g.fillRect(37, 37, 8, 3); g.fillRect(52, 37, 8, 3);
  g.fillStyle = '#0b0b0b'; g.fillRect(40, 38, 3, 2); g.fillRect(55, 38, 3, 2);
  g.fillStyle = '#87694d'; g.fillRect(47, 40, 4, 7);
  g.fillStyle = '#3e2a22'; g.fillRect(42, 49, 15, 3);

  g.fillStyle = heavy ? '#33382f' : commander ? '#5b4326' : '#31382f';
  g.fillRect(31, 20, 35, 10);
  g.beginPath(); g.moveTo(35,20); g.lineTo(40,13); g.lineTo(59,13); g.lineTo(65,20); g.closePath(); g.fill();
  g.fillStyle = commander ? '#c7a848' : '#a0292b';
  g.fillRect(47, 16, 5, 5);

  g.save();
  g.translate(50, 77);
  g.rotate(-.08);
  g.fillStyle = '#161817'; g.fillRect(-31, -6, 65, 10);
  g.fillStyle = '#2e302c'; g.fillRect(-17, -11, 29, 18);
  g.fillStyle = '#121312'; g.fillRect(28, -4, 22, 6);
  g.fillStyle = '#6f4b2f'; g.fillRect(-29, 4, 17, 7);
  g.restore();

  if (commander) {
    g.fillStyle = '#b49c51';
    g.fillRect(31, 59, 4, 13); g.fillRect(62, 59, 4, 13);
    g.fillStyle = '#9d2528'; g.fillRect(36, 63, 7, 5);
  }
  return c;
}

function makePickupSprite(kind) {
  const c = document.createElement('canvas');
  c.width = 72; c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.42)';
  g.beginPath(); g.ellipse(36, 70, 26, 6, 0, 0, Math.PI*2); g.fill();
  if (kind === 'health') {
    const grd = g.createLinearGradient(14, 22, 58, 64);
    grd.addColorStop(0, '#dbd3b7'); grd.addColorStop(1, '#777163');
    g.fillStyle = grd; g.fillRect(14, 20, 44, 42);
    g.fillStyle = '#5d1316'; g.fillRect(30, 25, 12, 32); g.fillRect(20, 35, 32, 12);
    g.strokeStyle = '#2d2a24'; g.lineWidth = 3; g.strokeRect(14,20,44,42);
  } else {
    g.fillStyle = kind === 'shells' ? '#7b2724' : '#6a5838';
    g.fillRect(13, 29, 46, 31);
    g.fillStyle = '#c6a55d';
    for (let i = 0; i < 5; i++) g.fillRect(18+i*8, 22, 5, 26);
    g.fillStyle = '#2b251b'; g.fillRect(13, 48, 46, 12);
    g.strokeStyle = '#171512'; g.lineWidth = 3; g.strokeRect(13,29,46,31);
  }
  return c;
}

function makeExitSprite() {
  const c = document.createElement('canvas'); c.width = 96; c.height = 144;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(10, 10, 88, 135);
  grd.addColorStop(0, '#a62b2b'); grd.addColorStop(1, '#3f0c0f');
  g.fillStyle = grd; g.fillRect(8, 8, 80, 128);
  g.fillStyle = '#17100e';
  for (let x = 14; x < 88; x += 16) g.fillRect(x, 8, 4, 128);
  g.fillStyle = '#d7ad42';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI/2 + i*Math.PI/5, r = i%2 ? 10 : 22;
    const x = 48 + Math.cos(a)*r, y = 69 + Math.sin(a)*r;
    i ? g.lineTo(x,y) : g.moveTo(x,y);
  }
  g.closePath(); g.fill();
  g.fillStyle = '#e6cb75'; g.fillRect(44, 104, 8, 18);
  g.strokeStyle = '#d4b762'; g.lineWidth = 3; g.strokeRect(8,8,80,128);
  return c;
}

function makeWeaponSprite(kind) {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 240;
  const g = c.getContext('2d');
  const metal = g.createLinearGradient(80, 20, 270, 190);
  metal.addColorStop(0, '#74756e'); metal.addColorStop(.16, '#242827'); metal.addColorStop(.58, '#111413'); metal.addColorStop(1, '#4d514d');
  const wood = g.createLinearGradient(90, 120, 220, 230);
  wood.addColorStop(0, '#8d603b'); wood.addColorStop(.45, '#4f301f'); wood.addColorStop(1, '#25150f');
  const glove = g.createLinearGradient(0, 120, 200, 240);
  glove.addColorStop(0, '#4f4a3e'); glove.addColorStop(1, '#171814');

  g.fillStyle = glove;
  g.beginPath(); g.moveTo(84,240); g.lineTo(100,169); g.lineTo(151,147); g.lineTo(188,185); g.lineTo(207,240); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(276,240); g.lineTo(259,176); g.lineTo(220,157); g.lineTo(185,192); g.lineTo(170,240); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(190,176,139,.18)'; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(94+i*11, 183+i*4); g.lineTo(127+i*9, 224); g.stroke(); }

  if (kind === 0) {
    g.fillStyle = wood;
    g.beginPath(); g.moveTo(151,136); g.lineTo(209,136); g.lineTo(217,221); g.lineTo(154,221); g.closePath(); g.fill();
    g.fillStyle = '#1a1d1c'; g.fillRect(155, 121, 52, 25);
    g.fillStyle = metal;
    g.beginPath(); g.moveTo(133,63); g.lineTo(226,63); g.lineTo(236,129); g.lineTo(145,129); g.closePath(); g.fill();
    g.fillStyle = '#090a0a'; g.fillRect(145, 47, 84, 25);
    g.fillStyle = '#8c8f86'; g.fillRect(151, 51, 58, 3);
    g.fillStyle = '#0b0c0c'; g.fillRect(166, 79, 52, 17);
    g.fillStyle = '#5f635d'; g.fillRect(131, 111, 22, 12);
    g.strokeStyle = '#080909'; g.lineWidth = 4; g.strokeRect(147,68,84,59);
  } else if (kind === 1) {
    g.fillStyle = wood; g.fillRect(125, 142, 111, 55);
    g.fillStyle = metal; g.fillRect(151, 78, 58, 91);
    g.fillStyle = '#111413'; g.fillRect(166, 16, 29, 137);
    g.fillStyle = '#72756e'; g.fillRect(172, 12, 17, 112);
    g.fillStyle = wood; g.fillRect(133, 107, 95, 37);
    g.strokeStyle = '#1d110c'; g.lineWidth = 4; g.strokeRect(133,107,95,37);
    for (let y=114; y<140; y+=7) { g.strokeStyle='rgba(25,13,8,.7)'; g.beginPath(); g.moveTo(143,y); g.lineTo(218,y); g.stroke(); }
  } else {
    g.fillStyle = wood; g.fillRect(104, 145, 151, 51);
    g.fillStyle = metal; g.fillRect(113, 95, 138, 66);
    g.fillStyle = '#101211'; g.fillRect(168, 22, 32, 119);
    g.fillStyle = '#5f625c'; g.fillRect(176, 18, 15, 94);
    g.fillStyle = '#161817';
    g.beginPath(); g.ellipse(180, 163, 69, 38, 0, 0, Math.PI*2); g.fill();
    g.strokeStyle = '#62645e'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(180, 163, 52, 27, 0, 0, Math.PI*2); g.stroke();
    g.fillStyle = '#393b37'; g.fillRect(235, 110, 58, 18);
    g.fillStyle = '#090a09'; g.fillRect(284, 115, 48, 8);
  }
  return c;
}

const enemySprites = {
  guard: makeEnemySprite('guard'),
  rifle: makeEnemySprite('rifle'),
  heavy: makeEnemySprite('heavy'),
  commander: makeEnemySprite('commander'),
  guardDead: makeEnemySprite('guard', true),
  rifleDead: makeEnemySprite('rifle', true),
  heavyDead: makeEnemySprite('heavy', true),
  commanderDead: makeEnemySprite('commander', true)
};
const pickupSprites = {
  health: makePickupSprite('health'),
  shells: makePickupSprite('shells'),
  bullets: makePickupSprite('bullets')
};
const exitSprite = makeExitSprite();
const weaponSprites = [makeWeaponSprite(0), makeWeaponSprite(1), makeWeaponSprite(2)];

function resetGame() {
  state = {
    level: 0,
    score: 0,
    player: { x: 0, y: 0, a: 0, hp: 100, weapon: 0, ammo: { bullets: 72, shells: 18 }, cooldown: 0, bob: 0, recoil: 0 },
    enemies: [], pickups: [], map: [], exitReady: false, won: false, particles: []
  };
  loadLevel(0, true);
}

function loadLevel(i, first = false) {
  const L = levels[i];
  state.level = i;
  state.map = L.map;
  Object.assign(state.player, { x: L.start[0], y: L.start[1], a: L.start[2], cooldown: 0, recoil: 0 });
  if (!first) state.player.hp = Math.min(100, state.player.hp + 25);
  state.enemies = L.enemies.map((e, n) => ({
    id: n, x: e[0], y: e[1], type: e[2], hp: enemyStats[e[2]].hp,
    alive: true, cooldown: 300 + Math.random()*700, hit: 0, flash: 0,
    phase: Math.random()*Math.PI*2, death: 0
  }));
  state.pickups = L.pickups.map((p, n) => ({ id:n, x:p[0], y:p[1], type:p[2], taken:false, phase:Math.random()*Math.PI*2 }));
  state.exitReady = false;
  sectorEl.textContent = L.name;
  announce(L.name, 2600);
}

function tile(x, y) {
  const iy = Math.floor(y), ix = Math.floor(x);
  if (iy < 0 || ix < 0 || iy >= state.map.length || ix >= state.map[0].length) return '1';
  return state.map[iy][ix];
}
function solid(x, y) { return '1234'.includes(tile(x, y)); }
function norm(a) { while (a > Math.PI) a -= Math.PI*2; while (a < -Math.PI) a += Math.PI*2; return a; }
function announce(text, ms = 1800) { messageEl.textContent = text; messageTimer = ms; }

function movePlayer(dx, dy) {
  const p = state.player, r = .22;
  if (!solid(p.x + dx + Math.sign(dx)*r, p.y)) p.x += dx;
  if (!solid(p.x, p.y + dy + Math.sign(dy)*r)) p.y += dy;
}

function hasLOS(x1, y1, x2, y2) {
  const d = Math.hypot(x2-x1, y2-y1), steps = Math.ceil(d*14);
  for (let i = 1; i < steps; i++) {
    const t = i/steps;
    if (solid(x1+(x2-x1)*t, y1+(y2-y1)*t)) return false;
  }
  return true;
}

function tone(freq, dur, type='square', vol=.035, slide=0) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, audio.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freq+slide), audio.currentTime+dur);
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime+dur);
  o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime+dur);
}
function noise(dur=.08, vol=.05) {
  if (!audio) return;
  const len = audio.sampleRate*dur, b = audio.createBuffer(1, len, audio.sampleRate), d = b.getChannelData(0);
  for (let i=0;i<len;i++) d[i] = (Math.random()*2-1)*(1-i/len);
  const s = audio.createBufferSource(), g = audio.createGain();
  s.buffer = b; g.gain.value = vol; s.connect(g).connect(audio.destination); s.start();
}

function addImpactParticles(amount=8) {
  for (let i=0;i<amount;i++) state.particles.push({
    x: W/2 + (Math.random()-.5)*18,
    y: H/2 + (Math.random()-.5)*18,
    vx: (Math.random()-.5)*.09,
    vy: (Math.random()-.5)*.09 - .03,
    life: 150 + Math.random()*180,
    size: 1 + Math.random()*2
  });
}

function shoot() {
  const p = state.player, w = weapons[p.weapon], now = performance.now();
  if (now < p.cooldown) return;
  if (p.ammo[w.ammo] <= 0) {
    tone(90,.08,'square',.03,-35); p.cooldown = now+220; announce('OUT OF '+w.ammo.toUpperCase(),700); return;
  }
  p.ammo[w.ammo]--;
  p.cooldown = now+w.delay;
  p.recoil = w.kick;
  muzzle = 95;
  screenShake = w.kick;
  noise(w.name==='TRENCH GUN'?.14:.06, w.name==='TRENCH GUN'?.12:.055);
  tone(w.name==='PPSh-41'?120:75,.08,'sawtooth',.025,-40);

  let hitAny = false;
  for (let pellet=0; pellet<w.pellets; pellet++) {
    const shotA = p.a + (Math.random()-.5)*w.spread*2;
    let best = null, bestD = w.range;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x-p.x,e.y-p.y);
      const a = Math.abs(norm(Math.atan2(e.y-p.y,e.x-p.x)-shotA));
      const hitWidth = .28/Math.max(.4,d);
      if (d<bestD && a<hitWidth && hasLOS(p.x,p.y,e.x,e.y)) { best=e; bestD=d; }
    }
    if (best) {
      best.hp -= w.damage*(.85+Math.random()*.3);
      best.hit = 115;
      hitAny = true;
      if (best.hp <= 0) {
        best.alive = false;
        best.death = 7000;
        state.score += enemyStats[best.type].score;
        tone(55,.16,'sawtooth',.04,-20);
      }
    }
  }
  if (hitAny) {
    hitMarker = 120;
    addImpactParticles(w.pellets > 1 ? 15 : 7);
    tone(420,.035,'square',.015,-100);
  }
}

function update(dt) {
  const p = state.player;
  visualClock += dt;
  grainPhase += dt;
  if (messageTimer > 0) { messageTimer -= dt; if (messageTimer <= 0) messageEl.textContent = ''; }
  muzzle = Math.max(0, muzzle-dt);
  hitMarker = Math.max(0, hitMarker-dt);
  damageFlash = Math.max(0, damageFlash-dt);
  screenShake = Math.max(0, screenShake-dt*.018);
  p.recoil += (0-p.recoil)*Math.min(1,dt*.012);

  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const spd = (sprint?3.3:2.25)*dt/1000, rot = 1.8*dt/1000;
  let moving = false;
  if (keys.has('ArrowLeft')) p.a -= rot;
  if (keys.has('ArrowRight')) p.a += rot;
  if (keys.has('KeyW')||keys.has('ArrowUp')) { movePlayer(Math.cos(p.a)*spd,Math.sin(p.a)*spd); moving=true; }
  if (keys.has('KeyS')||keys.has('ArrowDown')) { movePlayer(-Math.cos(p.a)*spd,-Math.sin(p.a)*spd); moving=true; }
  if (keys.has('KeyA')) { movePlayer(Math.cos(p.a-Math.PI/2)*spd,Math.sin(p.a-Math.PI/2)*spd); moving=true; }
  if (keys.has('KeyD')) { movePlayer(Math.cos(p.a+Math.PI/2)*spd,Math.sin(p.a+Math.PI/2)*spd); moving=true; }
  p.bob += moving ? dt*(sprint?.018:.012) : dt*.003;
  if (mouseDown) shoot();

  for (const q of state.pickups) {
    if (q.taken) continue;
    if (Math.hypot(q.x-p.x,q.y-p.y)<.55) {
      q.taken = true;
      if (q.type==='health') { p.hp=Math.min(100,p.hp+35); announce('FIELD KIT +35',900); tone(620,.12,'sine',.03,260); }
      else if (q.type==='shells') { p.ammo.shells+=10; announce('SHELLS +10',900); tone(360,.08,'square',.02,130); }
      else { p.ammo.bullets+=36; announce('AMMO +36',900); tone(420,.08,'square',.02,170); }
    }
  }

  let living = 0;
  for (const e of state.enemies) {
    e.hit = Math.max(0,e.hit-dt);
    e.flash = Math.max(0,e.flash-dt);
    if (!e.alive) { e.death=Math.max(0,e.death-dt); continue; }
    living++;
    const s=enemyStats[e.type], dx=p.x-e.x, dy=p.y-e.y, d=Math.hypot(dx,dy);
    e.cooldown -= dt;
    if (d<11 && hasLOS(e.x,e.y,p.x,p.y)) {
      if (d>s.range*.58) {
        const step=s.speed*dt/1000, mx=dx/d*step, my=dy/d*step;
        if (!solid(e.x+mx,e.y) && !state.enemies.some(o=>o!==e&&o.alive&&Math.hypot(o.x-(e.x+mx),o.y-e.y)<.45)) e.x+=mx;
        if (!solid(e.x,e.y+my)) e.y+=my;
      } else if (e.cooldown<=0) {
        e.cooldown=s.rate*(.75+Math.random()*.55);
        e.flash=95;
        if (Math.random()<.72) {
          p.hp-=s.damage; damageFlash=150; screenShake=3.5; tone(70,.1,'sawtooth',.035,-20);
          if (p.hp<=0) { p.hp=0; gameOver(); return; }
        }
      }
    }
  }

  if (living===0&&!state.exitReady) { state.exitReady=true; announce('SECTOR CLEAR — FIND THE RED GATE',2400); tone(220,.18,'square',.03,440); }
  if (state.exitReady&&tile(p.x,p.y)==='E') {
    if (state.level<levels.length-1) { state.score+=500; loadLevel(state.level+1); }
    else { state.score+=1500; winGame(); }
  }

  for (const part of state.particles) {
    part.life-=dt; part.x+=part.vx*dt; part.y+=part.vy*dt; part.vy+=.00028*dt;
  }
  state.particles=state.particles.filter(particle=>particle.life>0);
}

function gameOver() {
  running=false; document.exitPointerLock?.(); menu.classList.remove('hidden'); ui.classList.add('hidden');
  document.querySelector('h1').innerHTML='MISSION<br>FAILED';
  document.querySelector('.subtitle').textContent='THE FORTRESS ENDURES';
  document.querySelector('.brief').textContent=`Final score: ${state.score}. Return with a steadier hand.`;
  startBtn.textContent='Restart mission';
}
function winGame() {
  running=false; state.won=true; document.exitPointerLock?.(); menu.classList.remove('hidden'); ui.classList.add('hidden');
  document.querySelector('h1').innerHTML='FORTRESS<br>FALLEN';
  document.querySelector('.subtitle').textContent='ALL THREE SECTORS CLEARED';
  document.querySelector('.brief').textContent=`Final score: ${state.score}. The extraction corridor is open.`;
  startBtn.textContent='Play again';
}

function renderFloorAndCeiling() {
  const p = state.player;
  const data = floorFrame.data;
  const floorPix = textures.floor.pixels;
  const ceilPix = textures.ceiling.pixels;
  const dirX = Math.cos(p.a), dirY = Math.sin(p.a);
  const planeScale = Math.tan(FOV/2);
  const planeX = -dirY*planeScale, planeY = dirX*planeScale;
  const rayDirX0 = dirX-planeX, rayDirY0 = dirY-planeY;
  const rayDirX1 = dirX+planeX, rayDirY1 = dirY+planeY;
  const horizon = Math.floor(H*.5);
  const fog = [10,11,13];

  for (let y=0; y<H; y++) {
    if (y===horizon) continue;
    const isFloor = y>horizon;
    const py = isFloor ? y-horizon : horizon-y;
    const rowDistance = (H*.52)/Math.max(1,py);
    const stepX = rowDistance*(rayDirX1-rayDirX0)/W;
    const stepY = rowDistance*(rayDirY1-rayDirY0)/W;
    let floorX = p.x+rowDistance*rayDirX0;
    let floorY = p.y+rowDistance*rayDirY0;
    const source = isFloor ? floorPix : ceilPix;
    const maxLight = isFloor ? .9 : .58;
    const distanceShade = Math.max(.1, Math.min(maxLight, 1-rowDistance/22));
    const flicker = .97 + Math.sin(visualClock*.012)*.025;
    const wet = isFloor ? .05 + Math.max(0,Math.sin((floorX+floorY)*2.1))*.035 : 0;
    for (let x=0; x<W; x++) {
      const tx = ((floorX*TEX)|0)&(TEX-1), ty=((floorY*TEX)|0)&(TEX-1);
      const si=(ty*TEX+tx)*4, di=(y*W+x)*4;
      const s=distanceShade*flicker;
      data[di] = source[si]*s + fog[0]*(1-s) + source[si]*wet;
      data[di+1] = source[si+1]*s + fog[1]*(1-s) + source[si+1]*wet;
      data[di+2] = source[si+2]*s + fog[2]*(1-s) + source[si+2]*wet;
      data[di+3]=255;
      floorX+=stepX; floorY+=stepY;
    }
  }
  ctx.putImageData(floorFrame,0,0);

  const sky=ctx.createLinearGradient(0,0,0,horizon);
  sky.addColorStop(0,'rgba(4,5,7,.82)');
  sky.addColorStop(1,'rgba(31,25,25,.16)');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,horizon);
}

function castWalls() {
  const p=state.player;
  const horizon=H*.5;
  for (let x=0;x<W;x++) {
    const cameraX=2*x/W-1;
    const rayA=p.a+Math.atan(cameraX*Math.tan(FOV/2));
    const rdx=Math.cos(rayA), rdy=Math.sin(rayA);
    let mapX=Math.floor(p.x), mapY=Math.floor(p.y), side=0, wall='1';
    const ddx=Math.abs(1/(rdx||1e-8)), ddy=Math.abs(1/(rdy||1e-8));
    const stepX=rdx<0?-1:1, stepY=rdy<0?-1:1;
    let sideDistX=rdx<0?(p.x-mapX)*ddx:(mapX+1-p.x)*ddx;
    let sideDistY=rdy<0?(p.y-mapY)*ddy:(mapY+1-p.y)*ddy;
    for (let n=0;n<72;n++) {
      if (sideDistX<sideDistY) { sideDistX+=ddx; mapX+=stepX; side=0; }
      else { sideDistY+=ddy; mapY+=stepY; side=1; }
      wall=tile(mapX+.01,mapY+.01);
      if ('1234'.includes(wall)) break;
    }
    let dist=side===0?(mapX-p.x+(1-stepX)/2)/(rdx||1e-8):(mapY-p.y+(1-stepY)/2)/(rdy||1e-8);
    dist=Math.max(.01,dist*Math.cos(rayA-p.a));
    depth[x]=dist;
    const wallH=Math.min(H*3,H/dist);
    const top=Math.floor(horizon-wallH/2);
    let wallX=side===0?p.y+dist*rdy:p.x+dist*rdx;
    wallX-=Math.floor(wallX);
    let texX=Math.floor(wallX*TEX);
    if ((side===0&&rdx>0)||(side===1&&rdy<0)) texX=TEX-texX-1;
    const tex=textures[wall]||textures['1'];
    ctx.drawImage(tex.canvas,texX,0,1,TEX,x,top,1,wallH);

    const sideShade=side?.17:0;
    const fogAmount=Math.max(0,Math.min(.78,dist/MAX_DIST));
    const shadow=Math.min(.86,.13+sideShade+fogAmount*.67);
    ctx.fillStyle=`rgba(5,6,7,${shadow})`;
    ctx.fillRect(x,top,1,wallH);

    const local=wallX;
    const lampBand=(wall==='2'&&mapY%4===0&&local>.44&&local<.56);
    if (lampBand&&dist<8) {
      const glow=Math.max(0,1-dist/8)*.34;
      ctx.fillStyle=`rgba(185,48,34,${glow})`;
      ctx.fillRect(x,top+wallH*.18,1,wallH*.6);
    }
    if (wall==='4'&&dist<12) {
      ctx.fillStyle=`rgba(225,172,54,${Math.max(.04,.22-dist*.012)})`;
      ctx.fillRect(x,top+wallH*.22,1,wallH*.56);
    }
    if (top>0) {
      ctx.fillStyle='rgba(0,0,0,.42)'; ctx.fillRect(x,top,1,Math.max(1,wallH*.025));
    }
  }
}

function drawBillboard(sprite, worldX, worldY, scale=1, yOffset=0, flash=0, opacity=1) {
  const p=state.player;
  const dx=worldX-p.x, dy=worldY-p.y;
  const d=Math.hypot(dx,dy);
  const rel=norm(Math.atan2(dy,dx)-p.a);
  if (Math.abs(rel)>FOV*.72 || d<.15) return;
  const sx=W/2+Math.tan(rel)*W/(2*Math.tan(FOV/2));
  const size=Math.min(H*2,H*scale/d);
  const aspect=sprite.width/sprite.height;
  const width=size*aspect;
  const left=sx-width/2;
  const top=H*.5-size*.73+yOffset*size;
  for (let x=Math.max(0,left|0);x<Math.min(W,(left+width)|0);x++) {
    if (d>=depth[x]) continue;
    const u=Math.max(0,Math.min(sprite.width-1,Math.floor((x-left)/width*sprite.width)));
    ctx.globalAlpha=opacity;
    ctx.drawImage(sprite,u,0,1,sprite.height,x,top,1,size);
    if (flash) {
      ctx.fillStyle=`rgba(236,214,158,${Math.min(.7,flash/120)})`;
      ctx.fillRect(x,top,1,size);
    }
  }
  ctx.globalAlpha=1;
  return {sx,top,size,d};
}

function renderSprites() {
  const p=state.player;
  const items=[];
  for (const e of state.enemies) {
    if (e.alive || e.death>0) items.push({kind:'enemy',obj:e,d:Math.hypot(e.x-p.x,e.y-p.y)});
  }
  for (const q of state.pickups) if (!q.taken) items.push({kind:'pickup',obj:q,d:Math.hypot(q.x-p.x,q.y-p.y)});
  if (state.exitReady) {
    for (let y=0;y<state.map.length;y++) {
      const x=state.map[y].indexOf('E');
      if (x>=0) items.push({kind:'exit',obj:{x:x+.5,y:y+.5},d:Math.hypot(x+.5-p.x,y+.5-p.y)});
    }
  }
  items.sort((a,b)=>b.d-a.d);

  for (const it of items) {
    const o=it.obj;
    if (it.kind==='enemy') {
      const dead=!o.alive;
      const sprite=enemySprites[o.type+(dead?'Dead':'')];
      const bob=dead? .28 : Math.sin(visualClock*.005+o.phase)*.012;
      const drawn=drawBillboard(sprite,o.x,o.y,dead?.67:1.05,bob,o.hit,dead?Math.min(1,o.death/600):1);
      if (drawn&&o.flash&&!dead) {
        const fx=drawn.sx+drawn.size*.17, fy=drawn.top+drawn.size*.54;
        const r=drawn.size*.07*(.7+Math.random()*.6);
        const grd=ctx.createRadialGradient(fx,fy,0,fx,fy,r);
        grd.addColorStop(0,'rgba(255,245,194,.95)'); grd.addColorStop(.25,'rgba(255,174,63,.8)'); grd.addColorStop(1,'rgba(255,88,22,0)');
        ctx.fillStyle=grd; ctx.fillRect(fx-r,fy-r,r*2,r*2);
      }
    } else if (it.kind==='pickup') {
      drawBillboard(pickupSprites[o.type],o.x,o.y,.58,Math.sin(visualClock*.004+o.phase)*.035,0,1);
    } else {
      drawBillboard(exitSprite,o.x,o.y,1.45,0,0,.96);
    }
  }
}

function renderWeapon() {
  const p=state.player;
  const sprite=weaponSprites[p.weapon];
  const bobX=Math.sin(p.bob)*W*.006;
  const bobY=Math.abs(Math.cos(p.bob))*H*.008;
  const recoil=p.recoil*H*.018;
  const targetH=H*(p.weapon===1?.68:.61);
  const targetW=targetH*(sprite.width/sprite.height);
  const x=W/2-targetW/2+bobX;
  const y=H-targetH+bobY+recoil+H*.025;
  ctx.drawImage(sprite,x,y,targetW,targetH);

  if (muzzle) {
    const mx=W/2+(p.weapon===2?targetW*.23:0), my=y+targetH*(p.weapon===1?.08:.17);
    const r=H*(p.weapon===1?.16:.1)*(muzzle/95);
    const grd=ctx.createRadialGradient(mx,my,0,mx,my,r);
    grd.addColorStop(0,'rgba(255,250,197,.98)');
    grd.addColorStop(.2,'rgba(255,205,80,.93)');
    grd.addColorStop(.55,'rgba(255,102,25,.54)');
    grd.addColorStop(1,'rgba(255,70,0,0)');
    ctx.fillStyle=grd; ctx.fillRect(mx-r,my-r,r*2,r*2);
    ctx.save(); ctx.translate(mx,my); ctx.rotate(Math.random()*Math.PI);
    ctx.fillStyle='rgba(255,224,122,.85)';
    for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.fillRect(0,-1,r*1.3,2)}
    ctx.restore();
  }
}

function renderParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha=Math.max(0,p.life/300);
    ctx.fillStyle='#e7c477';
    ctx.fillRect(p.x,p.y,p.size,p.size);
  }
  ctx.globalAlpha=1;
}

function renderPostEffects() {
  const horizon=H*.5;
  const lampGlow=ctx.createLinearGradient(0,0,W,0);
  lampGlow.addColorStop(0,'rgba(120,23,21,.05)');
  lampGlow.addColorStop(.5,'rgba(0,0,0,0)');
  lampGlow.addColorStop(1,'rgba(96,16,17,.08)');
  ctx.fillStyle=lampGlow; ctx.fillRect(0,0,W,H);

  const vign=ctx.createRadialGradient(W/2,horizon,W*.15,W/2,horizon,W*.68);
  vign.addColorStop(0,'rgba(0,0,0,0)');
  vign.addColorStop(.63,'rgba(0,0,0,.08)');
  vign.addColorStop(1,'rgba(0,0,0,.76)');
  ctx.fillStyle=vign; ctx.fillRect(0,0,W,H);

  if (damageFlash) { ctx.fillStyle=`rgba(145,0,0,${damageFlash/410})`; ctx.fillRect(0,0,W,H); }
  if (muzzle) { ctx.fillStyle=`rgba(255,190,86,${muzzle/850})`; ctx.fillRect(0,0,W,H); }

  const grainAlpha=.025;
  ctx.fillStyle=`rgba(255,255,255,${grainAlpha})`;
  const step=Math.max(5,Math.floor(W/150));
  for(let i=0;i<85;i++) {
    const x=((i*83+grainPhase*.11)%W)|0, y=((i*47+grainPhase*.07)%H)|0;
    ctx.fillRect(x,y,step,1);
  }
}

function renderMinimap() {
  const p=state.player;
  const mw=minimap.width,mh=minimap.height;
  mctx.clearRect(0,0,mw,mh);
  const pad=12, scale=Math.min((mw-pad*2)/state.map[0].length,(mh-pad*2)/state.map.length);
  mctx.fillStyle='rgba(5,5,5,.94)'; mctx.fillRect(0,0,mw,mh);
  for(let y=0;y<state.map.length;y++) for(let x=0;x<state.map[y].length;x++) {
    const t=state.map[y][x];
    if ('1234'.includes(t)) {
      mctx.fillStyle=t==='2'?'#712623':t==='3'?'#43514c':t==='4'?'#9a2025':'#655f53';
      mctx.fillRect(pad+x*scale,pad+y*scale,Math.ceil(scale),Math.ceil(scale));
    } else if (t==='E') {
      mctx.fillStyle=state.exitReady?'#d0ae4c':'#4b1b1b';
      mctx.fillRect(pad+x*scale,pad+y*scale,Math.ceil(scale),Math.ceil(scale));
    }
  }
  for(const e of state.enemies) if(e.alive) {
    mctx.fillStyle='#c33937';
    mctx.beginPath(); mctx.arc(pad+e.x*scale,pad+e.y*scale,Math.max(2,scale*.17),0,Math.PI*2); mctx.fill();
  }
  const px=pad+p.x*scale, py=pad+p.y*scale;
  mctx.strokeStyle='rgba(225,210,167,.22)'; mctx.fillStyle='rgba(225,210,167,.07)';
  mctx.beginPath(); mctx.moveTo(px,py); mctx.lineTo(px+Math.cos(p.a-FOV/2)*scale*4,py+Math.sin(p.a-FOV/2)*scale*4); mctx.lineTo(px+Math.cos(p.a+FOV/2)*scale*4,py+Math.sin(p.a+FOV/2)*scale*4); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.save(); mctx.translate(px,py); mctx.rotate(p.a);
  mctx.fillStyle='#eadbb0'; mctx.beginPath(); mctx.moveTo(scale*.42,0); mctx.lineTo(-scale*.28,-scale*.25); mctx.lineTo(-scale*.28,scale*.25); mctx.closePath(); mctx.fill(); mctx.restore();
  mctx.strokeStyle='rgba(223,205,163,.45)'; mctx.lineWidth=2; mctx.strokeRect(3,3,mw-6,mh-6);
}

function updateHud() {
  const p=state.player, w=weapons[p.weapon], living=state.enemies.filter(e=>e.alive).length;
  healthValue.textContent=Math.ceil(p.hp);
  healthFill.style.width=`${p.hp}%`;
  weaponName.textContent=w.name;
  ammoValue.textContent=`${p.ammo[w.ammo]} ${w.ammo.toUpperCase()}`;
  scoreValue.textContent=state.score.toLocaleString();
  hostilesValue.textContent=`Hostiles ${living}`;
  objectiveEl.innerHTML=state.exitReady?'OBJECTIVE<br>REACH THE RED EXTRACTION GATE':`OBJECTIVE<br>ELIMINATE ${living} HOSTILE${living===1?'':'S'}`;
  crosshair.style.transform=`scale(${1+(p.recoil*.04)})`;
  crosshair.style.opacity=hitMarker?1:.9;
  if(hitMarker) crosshair.style.filter='drop-shadow(0 0 4px #fff) drop-shadow(0 0 8px #a51d21)';
  else crosshair.style.filter='drop-shadow(0 1px 1px #000) drop-shadow(0 0 3px #000)';
}

function render() {
  ctx.save();
  if(screenShake) ctx.translate((Math.random()-.5)*screenShake,(Math.random()-.5)*screenShake);
  renderFloorAndCeiling();
  castWalls();
  renderSprites();
  renderWeapon();
  renderParticles();
  renderPostEffects();
  ctx.restore();
  renderMinimap();
  updateHud();
}

function frame(ts) {
  if(!running) return;
  const dt=Math.min(34,ts-last||16);
  last=ts;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function begin() {
  resetGame();
  if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume();
  menu.classList.add('hidden');
  ui.classList.remove('hidden');
  running=true;
  last=performance.now();
  canvas.requestPointerLock?.();
  requestAnimationFrame(frame);
}

startBtn.addEventListener('click',begin);
canvas.addEventListener('click',()=>{if(running)canvas.requestPointerLock?.()});
document.addEventListener('pointerlockchange',()=>{
  if(running&&document.pointerLockElement!==canvas) announce('CLICK TO RECAPTURE MOUSE',100000);
});
document.addEventListener('mousemove',e=>{
  if(running&&document.pointerLockElement===canvas) {
    state.player.a+=e.movementX*.00235;
    if(messageTimer>9000){messageTimer=0;messageEl.textContent='';}
  }
});
document.addEventListener('mousedown',e=>{if(e.button===0)mouseDown=true});
document.addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false});
document.addEventListener('keydown',e=>{
  keys.add(e.code);
  if(/^Digit[123]$/.test(e.code)&&running) {
    state.player.weapon=Number(e.code.slice(-1))-1;
    tone(180,.05,'square',.02,80);
  }
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();mouseDown=false});

resetGame();
render();
})();
