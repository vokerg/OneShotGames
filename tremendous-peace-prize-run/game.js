(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startButton = document.getElementById('start-button');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayCopy = document.getElementById('overlay-copy');
  const featureGrid = document.getElementById('feature-grid');
  const zoneNameEl = document.getElementById('zone-name');
  const greatnessValueEl = document.getElementById('greatness-value');
  const greatnessFillEl = document.getElementById('greatness-fill');
  const peaceValueEl = document.getElementById('peace-value');
  const healthValueEl = document.getElementById('health-value');
  const missionTitleEl = document.getElementById('mission-title');
  const missionCopyEl = document.getElementById('mission-copy');
  const toastEl = document.getElementById('toast');

  const W = canvas.width;
  const H = canvas.height;
  const FLOOR = 615;
  const WORLD_END = 8250;
  const GRAVITY = 2200;
  const MOVE_ACCEL = 2500;
  const AIR_ACCEL = 1500;
  const MAX_SPEED = 360;
  const FRICTION = 0.82;
  const JUMP_SPEED = 790;

  const keys = { left: false, right: false, jump: false };
  let jumpPressed = false;
  let state = 'intro';
  let lastTime = 0;
  let elapsed = 0;
  let cameraX = 0;
  let shake = 0;
  let toastTimer = 0;
  let checkpoint = 90;
  let deaths = 0;
  let audioContext = null;

  const zones = [
    {
      start: 0,
      end: 2050,
      name: 'Reciprocal Harbor',
      mission: 'Cross the tariff docks',
      copy: 'Collect deal tokens and avoid the trade-deficit blobs.',
      skyTop: '#2b6fab',
      skyBottom: '#a8d6ee',
      ground: '#6b7784',
      accent: '#d34b3f'
    },
    {
      start: 2050,
      end: 4300,
      name: 'Strait of De-escalation',
      mission: 'Turn escalation into diplomacy',
      copy: 'Land on the gold switches to convert rockets into peace doves.',
      skyTop: '#573867',
      skyBottom: '#dd9e75',
      ground: '#7f694d',
      accent: '#f0bd44'
    },
    {
      start: 4300,
      end: 6500,
      name: 'Unprecedented Avenue',
      mission: 'Climb the superlative skyline',
      copy: 'Reach the top through historic, tremendous and best-ever platforms.',
      skyTop: '#153c79',
      skyBottom: '#8fc5ec',
      ground: '#555d70',
      accent: '#2f78cb'
    },
    {
      start: 6500,
      end: WORLD_END,
      name: 'Oslo Finish',
      mission: 'Reach the fictional peace podium',
      copy: 'One last victory lap. The committee in this game is ready.',
      skyTop: '#132b55',
      skyBottom: '#9ebbd1',
      ground: '#405a65',
      accent: '#e2b849'
    }
  ];

  const player = {
    x: 100, y: FLOOR - 82, w: 47, h: 82,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    health: 3,
    invulnerable: 0,
    greatness: 0,
    peace: 0,
    tokens: 0,
    anim: 0,
    coyote: 0,
    jumpBuffer: 0
  };

  const platforms = [];
  const tokens = [];
  const enemies = [];
  const switches = [];
  const rockets = [];
  const particles = [];
  const signs = [];
  const checkpoints = [];
  const decorations = [];

  function addPlatform(x, y, w, h, type = 'ground', label = '') {
    platforms.push({ x, y, w, h, type, label });
  }

  function addToken(x, y, value = 1, type = 'deal') {
    tokens.push({ x, y, r: type === 'star' ? 15 : 11, value, type, taken: false, bob: Math.random() * Math.PI * 2 });
  }

  function addEnemy(x, y, minX, maxX, type = 'deficit') {
    enemies.push({ x, y, w: 46, h: 38, vx: type === 'poll' ? -45 : -62, minX, maxX, type, alive: true, phase: Math.random() * 10 });
  }

  function addSign(x, y, text, sub = '', style = 'billboard') {
    signs.push({ x, y, text, sub, style });
  }

  function buildWorld() {
    platforms.length = tokens.length = enemies.length = switches.length = rockets.length = particles.length = signs.length = checkpoints.length = decorations.length = 0;

    addPlatform(0, FLOOR, 410, 120);
    addPlatform(455, FLOOR, 260, 120);
    addPlatform(760, FLOOR - 42, 180, 162, 'container', 'IMPORTS');
    addPlatform(980, FLOOR, 235, 120);
    addPlatform(1260, FLOOR - 72, 180, 192, 'container', '25%');
    addPlatform(1490, FLOOR - 135, 170, 255, 'container', 'RECIPROCAL');
    addPlatform(1695, FLOOR - 55, 330, 175, 'container', 'TARIFFS');
    addPlatform(2030, FLOOR, 160, 120);

    addSign(145, 425, 'RECIPROCAL', 'HARBOR', 'gantry');
    addSign(770, 390, 'IMPORT', 'INSPECTION', 'small');
    addSign(1515, 305, 'FAIR &', 'RECIPROCAL', 'small');
    decorations.push({ type: 'crane', x: 620, y: 265 }, { type: 'ship', x: 1100, y: 505 }, { type: 'crane', x: 1810, y: 250 });

    [250, 520, 815, 870, 1040, 1325, 1545, 1760, 1840, 1960].forEach((x, i) => addToken(x, i % 3 === 0 ? 480 : FLOOR - 105 - (i % 2) * 42));
    addToken(1570, 340, 4, 'star');
    addEnemy(545, FLOOR - 38, 470, 690);
    addEnemy(1050, FLOOR - 38, 995, 1190);
    addEnemy(1775, FLOOR - 93, 1710, 1990, 'poll');

    addPlatform(2190, FLOOR, 260, 120, 'sandstone');
    addPlatform(2505, FLOOR - 70, 170, 190, 'table', 'TALKS');
    addPlatform(2735, FLOOR, 205, 120, 'sandstone');
    addPlatform(3010, FLOOR - 95, 185, 215, 'table', 'DEAL');
    addPlatform(3260, FLOOR, 150, 120, 'sandstone');
    addPlatform(3470, FLOOR - 45, 200, 165, 'table', 'CEASEFIRE');
    addPlatform(3740, FLOOR - 135, 170, 255, 'table', 'DIPLOMACY');
    addPlatform(3970, FLOOR - 55, 330, 175, 'sandstone');

    addSign(2220, 415, 'STRAIT OF', 'DE-ESCALATION', 'gantry');
    addSign(3030, 360, 'NEGOTIATION', 'TABLE', 'small');
    addSign(3735, 285, 'PRESS FOR', 'PEACE', 'small');
    decorations.push({ type: 'dome', x: 2290, y: 470 }, { type: 'mountains', x: 2900, y: 400 }, { type: 'dome', x: 4050, y: 470 });

    switches.push({ x: 2608, y: FLOOR - 92, w: 42, h: 16, active: false, rocketIds: [0, 1] });
    switches.push({ x: 3570, y: FLOOR - 67, w: 42, h: 16, active: false, rocketIds: [2, 3, 4] });
    rockets.push(
      { x: 2790, y: 420, baseY: 420, range: 95, speed: 1.8, active: true, phase: 0.1 },
      { x: 2895, y: 495, baseY: 495, range: 75, speed: 2.2, active: true, phase: 2.2 },
      { x: 3770, y: 360, baseY: 360, range: 110, speed: 1.6, active: true, phase: 1.5 },
      { x: 3900, y: 470, baseY: 470, range: 80, speed: 2.0, active: true, phase: 3.0 },
      { x: 4090, y: 405, baseY: 405, range: 100, speed: 1.7, active: true, phase: 4.5 }
    );
    [2260, 2370, 2570, 2640, 2800, 3070, 3150, 3520, 3610, 3790, 3860, 4070, 4180].forEach((x, i) => addToken(x, 470 - (i % 3) * 65));
    addToken(3800, 330, 4, 'star');
    addEnemy(2335, FLOOR - 38, 2210, 2425, 'poll');
    addEnemy(3290, FLOOR - 38, 3270, 3390);
    addEnemy(4070, FLOOR - 93, 3990, 4270, 'poll');

    addPlatform(4300, FLOOR, 260, 120, 'avenue');
    addPlatform(4610, FLOOR - 65, 170, 185, 'podium', 'HISTORIC');
    addPlatform(4850, FLOOR - 145, 160, 265, 'podium', 'BIGGEST');
    addPlatform(5070, FLOOR - 220, 160, 340, 'podium', 'BEST EVER');
    addPlatform(5290, FLOOR - 125, 170, 245, 'podium', 'WINNING');
    addPlatform(5530, FLOOR - 50, 210, 170, 'avenue');
    addPlatform(5795, FLOOR - 125, 180, 245, 'podium', 'TREMENDOUS');
    addPlatform(6045, FLOOR - 205, 180, 325, 'podium', 'UNPRECEDENTED');
    addPlatform(6285, FLOOR - 85, 230, 205, 'avenue');

    addSign(4350, 410, 'UNPRECEDENTED', 'AVENUE', 'gantry');
    addSign(5090, 230, 'THE BEST', 'LEVEL', 'small');
    addSign(6030, 180, 'GREATNESS', 'AHEAD', 'small');
    decorations.push({ type: 'tower', x: 4480, y: 250 }, { type: 'whitehouse', x: 5480, y: 470 }, { type: 'tower', x: 6260, y: 230 });

    [4380, 4490, 4660, 4910, 5125, 5360, 5600, 5710, 5860, 6120, 6370, 6450].forEach((x, i) => addToken(x, 460 - (i % 4) * 70));
    addToken(5135, 330, 4, 'star');
    addToken(6125, 300, 4, 'star');
    addEnemy(4410, FLOOR - 38, 4320, 4530);
    addEnemy(5580, FLOOR - 88, 5550, 5700, 'poll');
    addEnemy(6340, FLOOR - 123, 6300, 6480);

    addPlatform(6515, FLOOR, 350, 120, 'oslo');
    addPlatform(6915, FLOOR - 55, 190, 175, 'ice', 'NORWAY');
    addPlatform(7160, FLOOR - 125, 190, 245, 'ice', 'OSLO');
    addPlatform(7410, FLOOR - 65, 230, 185, 'oslo');
    addPlatform(7695, FLOOR - 135, 170, 255, 'medal', 'PEACE');
    addPlatform(7920, FLOOR, 330, 120, 'stage');

    addSign(6580, 405, 'OSLO', 'THIS WAY', 'gantry');
    addSign(7470, 350, 'COMMITTEE', 'THIS GAME ONLY', 'small');
    decorations.push({ type: 'fjord', x: 6820, y: 500 }, { type: 'cityhall', x: 7860, y: 335 }, { type: 'flags', x: 8080, y: 405 });

    [6610, 6740, 6980, 7210, 7290, 7470, 7550, 7750, 7830, 8010].forEach((x, i) => addToken(x, 455 - (i % 3) * 58));
    addToken(7778, 335, 5, 'star');
    addEnemy(6670, FLOOR - 38, 6550, 6810, 'poll');
    addEnemy(7475, FLOOR - 103, 7435, 7600);

    checkpoints.push({ x: 90, y: FLOOR - 82, zone: 0 }, { x: 2210, y: FLOOR - 82, zone: 1 }, { x: 4330, y: FLOOR - 82, zone: 2 }, { x: 6540, y: FLOOR - 82, zone: 3 });
  }

  function resetGame() {
    buildWorld();
    Object.assign(player, {
      x: 100, y: FLOOR - 82, vx: 0, vy: 0, onGround: false, facing: 1,
      health: 3, invulnerable: 0, greatness: 0, peace: 0, tokens: 0,
      anim: 0, coyote: 0, jumpBuffer: 0
    });
    cameraX = 0;
    checkpoint = 90;
    deaths = 0;
    elapsed = 0;
    updateHud(true);
  }

  function currentZone() {
    return zones.find(z => player.x >= z.start && player.x < z.end) || zones[zones.length - 1];
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function playTone(freq, duration = 0.08, type = 'square', volume = 0.035, slide = 0) {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, audioContext.currentTime + duration);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) {
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    toastTimer = 2.1;
  }

  function burst(x, y, color, count = 10, speed = 170) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 45,
        life: 0.45 + Math.random() * 0.55,
        maxLife: 1,
        size: 3 + Math.random() * 5,
        color,
        kind: Math.random() > 0.7 ? 'star' : 'dot'
      });
    }
  }

  function update(dt) {
    elapsed += dt;
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.classList.remove('show');
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 3.5);

    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.jumpBuffer = jumpPressed ? 0.12 : Math.max(0, player.jumpBuffer - dt);
    jumpPressed = false;

    const acceleration = player.onGround ? MOVE_ACCEL : AIR_ACCEL;
    if (keys.left) {
      player.vx -= acceleration * dt;
      player.facing = -1;
    }
    if (keys.right) {
      player.vx += acceleration * dt;
      player.facing = 1;
    }
    if (!keys.left && !keys.right && player.onGround) player.vx *= Math.pow(FRICTION, dt * 60);
    player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));

    player.coyote = player.onGround ? 0.11 : Math.max(0, player.coyote - dt);
    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.vy = -JUMP_SPEED;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      playTone(260, 0.1, 'square', 0.028, 150);
    }
    if (!keys.jump && player.vy < -300) player.vy += GRAVITY * 1.6 * dt;

    player.vy += GRAVITY * dt;
    player.anim += dt * (3 + Math.abs(player.vx) / 55);

    player.x += player.vx * dt;
    for (const p of platforms) {
      if (!rectsOverlap(player, p)) continue;
      if (player.vx > 0) player.x = p.x - player.w;
      else if (player.vx < 0) player.x = p.x + p.w;
      player.vx = 0;
    }

    const oldBottom = player.y + player.h;
    player.y += player.vy * dt;
    player.onGround = false;
    for (const p of platforms) {
      if (!rectsOverlap(player, p)) continue;
      if (player.vy >= 0 && oldBottom <= p.y + 12) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = p.y + p.h;
        player.vy = 0;
      }
    }

    player.x = Math.max(0, player.x);
    if (player.y > H + 160) damagePlayer(true);

    for (const cp of checkpoints) {
      if (player.x >= cp.x && cp.x > checkpoint) {
        checkpoint = cp.x;
        showToast(`Checkpoint: ${zones[cp.zone].name}`);
        playTone(440, 0.12, 'sine', 0.025, 220);
      }
    }

    for (const token of tokens) {
      token.bob += dt * 3;
      if (token.taken) continue;
      const hit = { x: token.x - token.r, y: token.y - token.r, w: token.r * 2, h: token.r * 2 };
      if (rectsOverlap(player, hit)) {
        token.taken = true;
        const gain = token.type === 'star' ? 12 : 3;
        player.greatness = Math.min(100, player.greatness + gain);
        player.peace += token.value * 100;
        player.tokens += token.value;
        burst(token.x, token.y, token.type === 'star' ? '#ffe066' : '#f8ca4d', token.type === 'star' ? 18 : 8);
        playTone(token.type === 'star' ? 720 : 540, token.type === 'star' ? 0.18 : 0.07, 'sine', 0.04, 160);
        if (token.type === 'star') showToast('UNPRECEDENTED GREATNESS +12%');
      }
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      e.phase += dt * 4;
      e.x += e.vx * dt;
      if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); }
      if (rectsOverlap(player, e)) {
        const playerBottom = player.y + player.h;
        if (player.vy > 100 && playerBottom - e.y < 30) {
          e.alive = false;
          player.vy = -510;
          player.peace += 250;
          player.greatness = Math.min(100, player.greatness + 4);
          burst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'poll' ? '#83b7e8' : '#d44a43', 16);
          playTone(180, 0.1, 'sawtooth', 0.035, -80);
          showToast(e.type === 'poll' ? 'BAD POLL BOUNCED' : 'TRADE DEFICIT DEFEATED');
        } else {
          damagePlayer(false, e.x + e.w / 2);
        }
      }
    }

    for (const sw of switches) {
      const swRect = { x: sw.x, y: sw.y, w: sw.w, h: sw.h };
      if (!sw.active && rectsOverlap(player, swRect) && player.vy >= 0 && player.y + player.h < sw.y + 24) {
        sw.active = true;
        player.peace += 1000;
        player.greatness = Math.min(100, player.greatness + 10);
        for (const id of sw.rocketIds) {
          if (rockets[id]) {
            rockets[id].active = false;
            burst(rockets[id].x, rockets[id].y, '#ffffff', 20, 130);
          }
        }
        playTone(360, 0.2, 'sine', 0.04, 500);
        showToast('DIPLOMACY ACTIVATED — ESCALATION BECAME DOVES');
      }
    }

    for (const rocket of rockets) {
      rocket.y = rocket.baseY + Math.sin(elapsed * rocket.speed + rocket.phase) * rocket.range;
      if (!rocket.active) continue;
      const rr = { x: rocket.x - 18, y: rocket.y - 11, w: 36, h: 22 };
      if (rectsOverlap(player, rr)) damagePlayer(false, rocket.x);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 460 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (player.x > 8070 && state === 'playing') winGame();

    cameraX += ((player.x - 300) - cameraX) * Math.min(1, dt * 5.5);
    cameraX = Math.max(0, Math.min(WORLD_END - W + 80, cameraX));
    updateHud();
  }

  function damagePlayer(fell, sourceX = player.x) {
    if (player.invulnerable > 0) return;
    player.health -= 1;
    player.invulnerable = 1.5;
    player.vx = player.x < sourceX ? -360 : 360;
    player.vy = -430;
    shake = 0.7;
    playTone(120, 0.24, 'sawtooth', 0.05, -65);
    burst(player.x + player.w / 2, player.y + player.h / 2, '#ff5e57', 14);

    if (fell || player.health <= 0) {
      deaths += 1;
      player.health = 3;
      player.x = checkpoint;
      player.y = FLOOR - player.h - 30;
      player.vx = 0;
      player.vy = 0;
      player.greatness = Math.max(0, player.greatness - 8);
      showToast(deaths === 1 ? 'A MINOR SETBACK. STILL WINNING.' : 'REBRANDED AS A STRATEGIC RESET.');
    } else {
      showToast('FAKE NEWS DAMAGE — KEEP MOVING');
    }
  }

  function updateHud(force = false) {
    const zone = currentZone();
    if (force || zoneNameEl.textContent !== zone.name) {
      zoneNameEl.textContent = zone.name;
      missionTitleEl.textContent = zone.mission;
      missionCopyEl.textContent = zone.copy;
    }
    const g = Math.round(player.greatness);
    greatnessValueEl.textContent = `${g}%`;
    greatnessFillEl.style.width = `${g}%`;
    peaceValueEl.textContent = player.peace.toLocaleString('en-US');
    healthValueEl.textContent = '♥'.repeat(player.health) + '♡'.repeat(3 - player.health);
  }

  function showIntro() {
    state = 'intro';
    overlayTitle.innerHTML = 'Tremendous<br />Peace Prize Run';
    overlayCopy.innerHTML = 'Play a cartoon Donald Trump in a classic side-scrolling platformer where every brick, obstacle and victory lap has been replaced by tariffs, dealmaking, Iran de-escalation, superlatives and a very fictional trip to Oslo.';
    featureGrid.style.display = '';
    startButton.textContent = 'Start winning';
    overlay.classList.add('visible');
  }

  function startGame() {
    if (state === 'won' || state === 'lost') resetGame();
    state = 'playing';
    overlay.classList.remove('visible');
    if (audioContext?.state === 'suspended') audioContext.resume();
    lastTime = performance.now();
  }

  function winGame() {
    state = 'won';
    const grade = player.greatness >= 90 ? 'UNPRECEDENTED' : player.greatness >= 65 ? 'TREMENDOUS' : 'A VERY STRONG RESULT';
    player.peace += 10000;
    updateHud();
    playTone(392, 0.25, 'sine', 0.04, 392);
    setTimeout(() => playTone(523, 0.25, 'sine', 0.04, 392), 180);
    setTimeout(() => playTone(659, 0.45, 'sine', 0.04, 392), 360);
    overlayTitle.innerHTML = 'You won the<br />Peace Prize!*';
    overlayCopy.innerHTML = `<strong>${grade}.</strong> Final score: ${player.peace.toLocaleString('en-US')} peace points, ${Math.round(player.greatness)}% greatness and ${deaths} strategic reset${deaths === 1 ? '' : 's'}.<br><br>*Only inside this fictional satire. Real Nobel Peace Prize laureates are selected independently by the Norwegian Nobel Committee.`;
    featureGrid.style.display = 'none';
    startButton.textContent = 'Run it back';
    overlay.classList.add('visible');
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      overlayTitle.innerHTML = 'Executive Time';
      overlayCopy.textContent = 'The game is paused. The markets are waiting.';
      featureGrid.style.display = 'none';
      startButton.textContent = 'Resume winning';
      overlay.classList.add('visible');
    } else if (state === 'paused') {
      startGame();
    }
  }

  function draw() {
    const zone = currentZone();
    const sx = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    drawSky(zone);
    drawDistantWorld(zone);
    ctx.save();
    ctx.translate(-cameraX, 0);
    drawDecorations();
    drawPlatforms(zone);
    drawSigns();
    drawSwitches();
    drawTokens();
    drawRocketsAndDoves();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawFinish();
    ctx.restore();
    drawVignette();
    ctx.restore();
  }

  function drawSky(zone) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, zone.skyTop);
    grad.addColorStop(1, zone.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const sunX = zone.name === 'Strait of De-escalation' ? 955 : 1060;
    const sunY = zone.name === 'Strait of De-escalation' ? 168 : 135;
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 85);
    sun.addColorStop(0, 'rgba(255,242,190,.95)');
    sun.addColorStop(.22, 'rgba(255,227,139,.65)');
    sun.addColorStop(1, 'rgba(255,225,150,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - 100, sunY - 100, 200, 200);

    for (let i = 0; i < 7; i++) {
      const x = ((i * 245 - cameraX * (0.08 + i * .005) + elapsed * (4 + i)) % 1700) - 220;
      const y = 100 + (i % 3) * 72;
      drawCloud(x, y, 0.7 + (i % 2) * .28, i === 3 && zone.name === 'Unprecedented Avenue');
    }
  }

  function drawCloud(x, y, scale, press) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = press ? 'rgba(225,235,247,.72)' : 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.arc(38, 28, 28, 0, Math.PI * 2);
    ctx.arc(72, 17, 36, 0, Math.PI * 2);
    ctx.arc(110, 31, 27, 0, Math.PI * 2);
    ctx.roundRect(20, 26, 110, 38, 19);
    ctx.fill();
    if (press) {
      ctx.fillStyle = 'rgba(16,40,77,.52)';
      ctx.font = '800 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS', 76, 43);
    }
    ctx.restore();
  }

  function drawDistantWorld(zone) {
    ctx.save();
    const offset = -cameraX * 0.17;
    if (zone.name === 'Reciprocal Harbor') {
      ctx.fillStyle = 'rgba(34,58,78,.35)';
      for (let i = -1; i < 8; i++) {
        const x = offset + i * 220;
        ctx.fillRect(x, 390, 130, 220);
        ctx.fillRect(x + 145, 445, 60, 165);
      }
      ctx.fillStyle = 'rgba(32,90,130,.42)';
      ctx.fillRect(0, 560, W, 160);
    } else if (zone.name === 'Strait of De-escalation') {
      ctx.fillStyle = 'rgba(72,43,56,.28)';
      ctx.beginPath();
      ctx.moveTo(0, 470);
      for (let x = 0; x <= W; x += 120) ctx.lineTo(x, 390 + Math.sin((x - offset) / 155) * 75);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    } else if (zone.name === 'Unprecedented Avenue') {
      ctx.fillStyle = 'rgba(23,48,79,.28)';
      for (let i = -2; i < 11; i++) {
        const x = offset + i * 150;
        const h = 150 + (i % 4) * 45;
        ctx.fillRect(x, FLOOR - h, 105, h);
      }
    } else {
      ctx.fillStyle = 'rgba(27,55,75,.32)';
      ctx.beginPath();
      ctx.moveTo(0, 455);
      for (let x = 0; x <= W; x += 95) ctx.lineTo(x, 390 + Math.sin((x - offset) / 110) * 55);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.fillStyle = 'rgba(177,209,224,.35)';
      ctx.fillRect(0, 530, W, 190);
    }
    ctx.restore();
  }

  function drawDecorations() {
    for (const d of decorations) {
      if (d.x < cameraX - 300 || d.x > cameraX + W + 300) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.type === 'crane') drawCrane();
      if (d.type === 'ship') drawShip();
      if (d.type === 'dome') drawDome();
      if (d.type === 'mountains') drawMountains();
      if (d.type === 'tower') drawTower();
      if (d.type === 'whitehouse') drawWhiteHouse();
      if (d.type === 'fjord') drawFjord();
      if (d.type === 'cityhall') drawCityHall();
      if (d.type === 'flags') drawFlags();
      ctx.restore();
    }
  }

  function drawCrane() {
    ctx.strokeStyle = 'rgba(24,49,67,.58)';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(0, 300); ctx.lineTo(0, 0); ctx.lineTo(150, 0); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(80, 300); ctx.moveTo(0, 75); ctx.lineTo(150, 75); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(125, 0); ctx.lineTo(125, 115); ctx.stroke();
    ctx.fillStyle = 'rgba(24,49,67,.58)'; ctx.fillRect(110, 110, 30, 18);
  }

  function drawShip() {
    ctx.fillStyle = 'rgba(31,58,78,.55)';
    ctx.beginPath(); ctx.moveTo(-120, 70); ctx.lineTo(145, 70); ctx.lineTo(100, 120); ctx.lineTo(-75, 120); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(220,75,62,.45)';
    for (let i = 0; i < 4; i++) ctx.fillRect(-75 + i * 55, 20, 48, 45);
  }

  function drawDome() {
    ctx.fillStyle = 'rgba(66,50,46,.34)'; ctx.fillRect(-70, 35, 140, 120);
    ctx.beginPath(); ctx.arc(0, 35, 55, Math.PI, 0); ctx.fill();
    ctx.fillRect(-8, -30, 16, 30);
  }

  function drawMountains() {
    ctx.fillStyle = 'rgba(68,43,52,.25)';
    ctx.beginPath(); ctx.moveTo(-240, 180); ctx.lineTo(-80, -25); ctx.lineTo(20, 100); ctx.lineTo(130, -50); ctx.lineTo(300, 180); ctx.closePath(); ctx.fill();
  }

  function drawTower() {
    ctx.fillStyle = 'rgba(26,47,76,.28)'; ctx.fillRect(-48, -25, 96, 310);
    ctx.fillStyle = 'rgba(231,195,78,.18)';
    for (let y = 10; y < 250; y += 28) for (let x = -34; x < 30; x += 23) ctx.fillRect(x, y, 12, 16);
    ctx.fillStyle = 'rgba(26,47,76,.28)'; ctx.beginPath(); ctx.moveTo(-48, -25); ctx.lineTo(0, -90); ctx.lineTo(48, -25); ctx.fill();
  }

  function drawWhiteHouse() {
    ctx.fillStyle = 'rgba(244,247,246,.52)'; ctx.fillRect(-110, 20, 220, 95);
    ctx.beginPath(); ctx.moveTo(-125, 20); ctx.lineTo(0, -35); ctx.lineTo(125, 20); ctx.fill();
    ctx.fillStyle = 'rgba(36,61,89,.28)';
    for (let x = -85; x <= 85; x += 34) ctx.fillRect(x, 45, 15, 36);
    ctx.fillStyle = 'rgba(244,247,246,.52)';
    for (let x = -65; x <= 65; x += 32) ctx.fillRect(x, 75, 12, 60);
  }

  function drawFjord() {
    ctx.fillStyle = 'rgba(155,203,222,.32)'; ctx.fillRect(-180, 0, 360, 130);
    ctx.fillStyle = 'rgba(242,247,249,.38)';
    ctx.beginPath(); ctx.moveTo(-190, 10); ctx.lineTo(-90, -100); ctx.lineTo(-15, 0); ctx.lineTo(70, -130); ctx.lineTo(190, 10); ctx.fill();
  }

  function drawCityHall() {
    ctx.fillStyle = 'rgba(133,78,61,.5)'; ctx.fillRect(-150, 40, 300, 180);
    ctx.fillRect(-95, -80, 68, 120); ctx.fillRect(35, -80, 68, 120);
    ctx.fillStyle = 'rgba(238,216,159,.48)';
    for (let y = 70; y < 190; y += 32) for (let x = -125; x < 120; x += 42) ctx.fillRect(x, y, 20, 18);
  }

  function drawFlags() {
    for (let i = 0; i < 4; i++) {
      const x = i * 50;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, 0); ctx.stroke();
      ctx.fillStyle = i % 2 ? 'rgba(43,100,174,.72)' : 'rgba(210,56,55,.72)';
      ctx.fillRect(x, 5, 42, 27);
    }
  }

  function drawPlatforms(zone) {
    for (const p of platforms) {
      if (p.x + p.w < cameraX - 80 || p.x > cameraX + W + 80) continue;
      ctx.save();
      const base = platformColors(p.type, zone);
      const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      grad.addColorStop(0, base.top);
      grad.addColorStop(1, base.bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = base.edge;
      ctx.fillRect(p.x, p.y, p.w, Math.min(12, p.h));
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);

      if (p.type === 'container') drawContainerDetails(p);
      if (p.type === 'table') drawTableDetails(p);
      if (p.type === 'podium') drawPodiumDetails(p);
      if (p.type === 'ice' || p.type === 'medal') drawIceDetails(p);
      if (p.label && !['container', 'table', 'podium', 'ice', 'medal'].includes(p.type)) drawPlatformLabel(p);
      ctx.restore();
    }
  }

  function platformColors(type, zone) {
    const colors = {
      ground: { top: '#798590', bottom: '#46505b', edge: '#aeb8c1' },
      container: { top: '#c84d43', bottom: '#7e2e2a', edge: '#ef7669' },
      sandstone: { top: '#ae8860', bottom: '#6f533b', edge: '#d2ae7d' },
      table: { top: '#765b47', bottom: '#463227', edge: '#a5866a' },
      avenue: { top: '#777f91', bottom: '#3e4554', edge: '#b2b9c8' },
      podium: { top: '#2868b0', bottom: '#143867', edge: '#65a0dd' },
      oslo: { top: '#526f7a', bottom: '#2f444d', edge: '#86a5b0' },
      ice: { top: '#d9edf4', bottom: '#7eabbc', edge: '#ffffff' },
      medal: { top: '#d7aa32', bottom: '#815b10', edge: '#f9df72' },
      stage: { top: '#972f33', bottom: '#4f171d', edge: '#d95b59' }
    };
    return colors[type] || { top: zone.ground, bottom: '#313a45', edge: '#aeb8c1' };
  }

  function drawContainerDetails(p) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3;
    for (let x = p.x + 16; x < p.x + p.w; x += 27) {
      ctx.beginPath(); ctx.moveTo(x, p.y + 10); ctx.lineTo(x, p.y + p.h - 8); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = '900 15px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x + p.w / 2, p.y + Math.min(50, p.h / 2));
  }

  function drawTableDetails(p) {
    ctx.fillStyle = 'rgba(238,222,195,.16)'; ctx.fillRect(p.x + 12, p.y + 16, p.w - 24, 16);
    ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x + p.w / 2, p.y + 55);
    ctx.strokeStyle = 'rgba(0,0,0,.24)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(p.x + 28, p.y + 35); ctx.lineTo(p.x + 28, p.y + p.h); ctx.moveTo(p.x + p.w - 28, p.y + 35); ctx.lineTo(p.x + p.w - 28, p.y + p.h); ctx.stroke();
  }

  function drawPodiumDetails(p) {
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let y = p.y + 20; y < p.y + p.h; y += 35) ctx.fillRect(p.x + 12, y, p.w - 24, 12);
    ctx.fillStyle = '#f5cf56'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x + p.w / 2, p.y + 48);
    ctx.fillText('★', p.x + p.w / 2, p.y + 76);
  }

  function drawIceDetails(p) {
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x + 20, p.y + 10); ctx.lineTo(p.x + 55, p.y + 45); ctx.lineTo(p.x + 90, p.y + 18); ctx.lineTo(p.x + 135, p.y + 55); ctx.stroke();
    ctx.fillStyle = p.type === 'medal' ? '#fff4be' : '#204a65'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x + p.w / 2, p.y + 70);
  }

  function drawPlatformLabel(p) {
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x + p.w / 2, p.y + 42);
  }

  function drawSigns() {
    for (const s of signs) {
      if (s.x < cameraX - 250 || s.x > cameraX + W + 250) continue;
      ctx.save(); ctx.translate(s.x, s.y);
      if (s.style === 'gantry') {
        ctx.strokeStyle = 'rgba(28,39,51,.8)'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(-70, 150); ctx.lineTo(-70, 0); ctx.lineTo(120, 0); ctx.lineTo(120, 150); ctx.stroke();
        ctx.fillStyle = '#0a2852'; ctx.fillRect(-95, -25, 240, 78);
        ctx.strokeStyle = '#f6cf57'; ctx.lineWidth = 3; ctx.strokeRect(-92, -22, 234, 72);
        ctx.fillStyle = 'white'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(s.text, 25, 5);
        ctx.fillStyle = '#f5ce57'; ctx.font = '800 12px system-ui'; ctx.fillText(s.sub, 25, 28);
      } else {
        ctx.strokeStyle = '#4a4034'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 110); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = '#f1ede2'; ctx.fillRect(-65, -30, 130, 62);
        ctx.strokeStyle = '#172b50'; ctx.lineWidth = 4; ctx.strokeRect(-62, -27, 124, 56);
        ctx.fillStyle = '#172b50'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(s.text, 0, -5);
        ctx.fillStyle = '#b33836'; ctx.font = '800 9px system-ui'; ctx.fillText(s.sub, 0, 15);
      }
      ctx.restore();
    }
  }

  function drawTokens() {
    for (const t of tokens) {
      if (t.taken || t.x < cameraX - 50 || t.x > cameraX + W + 50) continue;
      const y = t.y + Math.sin(t.bob) * 6;
      ctx.save(); ctx.translate(t.x, y); ctx.rotate(Math.sin(t.bob * .7) * .18);
      if (t.type === 'star') {
        ctx.fillStyle = '#ffe065'; ctx.strokeStyle = '#9a6514'; ctx.lineWidth = 3;
        starPath(ctx, 0, 0, 5, 18, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9b6818'; ctx.font = '900 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('G', 0, 3);
      } else {
        const grad = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15);
        grad.addColorStop(0, '#fff4a5'); grad.addColorStop(.42, '#f7c946'); grad.addColorStop(1, '#b77716');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7d5010'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#84550f'; ctx.font = '900 13px Georgia'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 5);
      }
      ctx.restore();
    }
  }

  function drawSwitches() {
    for (const sw of switches) {
      ctx.save(); ctx.translate(sw.x, sw.y);
      ctx.fillStyle = sw.active ? '#4ea96c' : '#f1c64f';
      ctx.fillRect(0, sw.active ? 8 : 0, sw.w, sw.active ? 8 : sw.h);
      ctx.fillStyle = '#4a3a1b'; ctx.font = '900 8px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(sw.active ? 'PEACE' : 'DEAL', sw.w / 2, sw.active ? 5 : 11);
      ctx.restore();
    }
  }

  function drawRocketsAndDoves() {
    for (const r of rockets) {
      if (r.x < cameraX - 80 || r.x > cameraX + W + 80) continue;
      ctx.save(); ctx.translate(r.x, r.y);
      if (r.active) {
        ctx.rotate(Math.sin(elapsed * r.speed + r.phase) * .12);
        ctx.fillStyle = '#d8dde3'; ctx.beginPath(); ctx.roundRect(-17, -8, 30, 16, 8); ctx.fill();
        ctx.fillStyle = '#bd3f38'; ctx.beginPath(); ctx.moveTo(13, -8); ctx.lineTo(24, 0); ctx.lineTo(13, 8); ctx.fill();
        ctx.fillStyle = '#f0b449'; ctx.beginPath(); ctx.moveTo(-17, -6); ctx.lineTo(-30 - Math.random() * 7, 0); ctx.lineTo(-17, 6); ctx.fill();
        ctx.fillStyle = '#223955'; ctx.font = '800 7px system-ui'; ctx.textAlign = 'center'; ctx.fillText('ESC', -1, 3);
      } else {
        const flap = Math.sin(elapsed * 9 + r.phase) * 8;
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(-14, -18 - flap, -25, -7); ctx.quadraticCurveTo(-14, 0, -3, 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(3, 0); ctx.quadraticCurveTo(14, -18 + flap, 25, -7); ctx.quadraticCurveTo(14, 0, 3, 2); ctx.fill();
        ctx.fillStyle = '#e0a846'; ctx.beginPath(); ctx.moveTo(13, -2); ctx.lineTo(21, 1); ctx.lineTo(13, 4); ctx.fill();
        ctx.strokeStyle = '#4d8d50'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, 3); ctx.quadraticCurveTo(25, 10, 31, 7); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (!e.alive || e.x < cameraX - 70 || e.x > cameraX + W + 70) continue;
      ctx.save(); ctx.translate(e.x, e.y + Math.sin(e.phase) * 2);
      if (e.type === 'poll') drawPollEnemy(e);
      else drawDeficitEnemy(e);
      ctx.restore();
    }
  }

  function drawDeficitEnemy(e) {
    ctx.fillStyle = '#b33c39';
    ctx.beginPath(); ctx.roundRect(0, 4, e.w, e.h - 4, 14); ctx.fill();
    ctx.fillStyle = '#e75c54'; ctx.beginPath(); ctx.arc(13, 10, 12, Math.PI, 0); ctx.arc(31, 10, 12, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(14, 17, 4, 0, Math.PI * 2); ctx.arc(31, 17, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#18233a'; ctx.beginPath(); ctx.arc(15, 18, 2, 0, Math.PI * 2); ctx.arc(30, 18, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd65a'; ctx.font = '900 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('DEFICIT', e.w / 2, 33);
  }

  function drawPollEnemy(e) {
    ctx.fillStyle = '#e9eef5'; ctx.beginPath(); ctx.roundRect(0, 0, e.w, e.h, 7); ctx.fill();
    ctx.strokeStyle = '#476c99'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, e.w - 8, e.h - 8);
    ctx.fillStyle = '#345b87';
    ctx.fillRect(8, 24, 5, 7); ctx.fillRect(17, 18, 5, 13); ctx.fillRect(26, 12, 5, 19); ctx.fillRect(35, 7, 5, 24);
    ctx.fillStyle = '#b63735'; ctx.font = '900 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BAD POLL', e.w / 2, 9);
  }

  function drawPlayer() {
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;
    const run = player.onGround ? Math.sin(player.anim) : 0;
    const lean = Math.max(-0.12, Math.min(0.12, player.vx / 1600));
    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
    ctx.scale(player.facing, 1);
    ctx.rotate(lean);

    ctx.save(); ctx.scale(player.facing, 1); ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(0, 42, 25, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();

    ctx.strokeStyle = '#183c72'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(-23 - run * 3, 25 + run * 3); ctx.stroke();
    ctx.fillStyle = '#e8a16d'; ctx.beginPath(); ctx.arc(-24 - run * 3, 27 + run * 3, 6, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#24344e'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(-8, 24); ctx.lineTo(-12 + run * 6, 43); ctx.moveTo(8, 24); ctx.lineTo(12 - run * 6, 43); ctx.stroke();
    ctx.strokeStyle = '#111820'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-14 + run * 6, 43); ctx.lineTo(-23 + run * 6, 43); ctx.moveTo(14 - run * 6, 43); ctx.lineTo(23 - run * 6, 43); ctx.stroke();

    ctx.fillStyle = '#173d76'; ctx.beginPath(); ctx.roundRect(-21, -9, 42, 44, 8); ctx.fill();
    ctx.fillStyle = '#f5f3ed'; ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(0, 16); ctx.lineTo(10, -8); ctx.fill();
    ctx.fillStyle = '#d53430'; ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(5, -7); ctx.lineTo(3, 22); ctx.lineTo(-2, 26); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(-16, 10, 7, 3);

    ctx.strokeStyle = '#1d467f'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(27 + run * 2, 18 - run * 2); ctx.stroke();
    ctx.fillStyle = '#efaa78'; ctx.beginPath(); ctx.arc(30 + run * 2, 18 - run * 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(29, 14, 13, 5);

    ctx.fillStyle = '#e9a472'; ctx.beginPath(); ctx.ellipse(0, -24, 20, 22, -0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d88d61'; ctx.beginPath(); ctx.arc(17, -23, 5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#efc56b';
    ctx.beginPath();
    ctx.moveTo(-19, -31); ctx.quadraticCurveTo(-9, -51, 14, -43); ctx.quadraticCurveTo(27, -39, 18, -29);
    ctx.quadraticCurveTo(5, -41, -19, -31); ctx.fill();
    ctx.fillStyle = '#d8a84d';
    ctx.beginPath(); ctx.moveTo(-17, -36); ctx.quadraticCurveTo(2, -46, 21, -35); ctx.quadraticCurveTo(8, -42, -17, -31); ctx.fill();

    ctx.strokeStyle = '#75462e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-13, -26); ctx.lineTo(-4, -28); ctx.moveTo(6, -28); ctx.lineTo(14, -26); ctx.stroke();
    ctx.fillStyle = '#253755'; ctx.beginPath(); ctx.arc(-7, -24, 2, 0, Math.PI * 2); ctx.arc(9, -24, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#914f39'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-7, -13); ctx.quadraticCurveTo(1, -9, 9, -14); ctx.stroke();

    ctx.fillStyle = '#ffffff'; ctx.fillRect(10, 2, 7, 5);
    ctx.fillStyle = '#d43a39'; ctx.fillRect(10, 2, 7, 2);
    ctx.fillStyle = '#2d5e9b'; ctx.fillRect(10, 2, 3, 3);

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.translate(p.x, p.y); ctx.fillStyle = p.color;
      if (p.kind === 'star') { starPath(ctx, 0, 0, 5, p.size, p.size * .45); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  function drawFinish() {
    if (cameraX + W < 7800) return;
    ctx.save();
    ctx.fillStyle = '#a82f35'; ctx.fillRect(7920, FLOOR - 8, 330, 18);
    ctx.fillStyle = '#e4e5e8'; ctx.fillRect(8080, 500, 70, 115);
    ctx.fillStyle = '#c7c9cd'; ctx.fillRect(8065, 492, 100, 15);
    const pulse = 1 + Math.sin(elapsed * 4) * .04;
    ctx.translate(8115, 455); ctx.scale(pulse, pulse);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 55);
    glow.addColorStop(0, 'rgba(255,231,117,.65)'); glow.addColorStop(1, 'rgba(255,221,75,0)');
    ctx.fillStyle = glow; ctx.fillRect(-60, -60, 120, 120);
    ctx.fillStyle = '#ddb23b'; ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff0a1'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#705013'; ctx.font = '900 11px Georgia'; ctx.textAlign = 'center'; ctx.fillText('PEACE', 0, -2); ctx.fillText('PRIZE*', 0, 12);
    ctx.restore();
  }

  function drawVignette() {
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * .15, W / 2, H / 2, H * .8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);

    if (state === 'paused') {
      ctx.fillStyle = 'rgba(2,8,20,.25)'; ctx.fillRect(0, 0, W, H);
    }
  }

  function starPath(context, cx, cy, points, outer, inner) {
    let angle = -Math.PI / 2;
    const step = Math.PI / points;
    context.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outer : inner;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
      angle += step;
    }
    context.closePath();
  }

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - lastTime) / 1000 || 0));
    lastTime = now;
    if (state === 'playing') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function setKey(name, down) {
    if (name === 'jump' && down && !keys.jump) jumpPressed = true;
    keys[name] = down;
  }

  window.addEventListener('keydown', (event) => {
    const code = event.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(code)) event.preventDefault();
    if (code === 'ArrowLeft' || code === 'KeyA') setKey('left', true);
    if (code === 'ArrowRight' || code === 'KeyD') setKey('right', true);
    if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') setKey('jump', true);
    if (code === 'KeyP' && !event.repeat) togglePause();
    if (code === 'KeyR' && !event.repeat) { resetGame(); startGame(); }
    if ((code === 'Enter' || code === 'Space') && (state === 'intro' || state === 'won')) startGame();
  });

  window.addEventListener('keyup', (event) => {
    const code = event.code;
    if (code === 'ArrowLeft' || code === 'KeyA') setKey('left', false);
    if (code === 'ArrowRight' || code === 'KeyD') setKey('right', false);
    if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') setKey('jump', false);
  });

  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.jump = false;
    if (state === 'playing') togglePause();
  });

  document.querySelectorAll('#touch-controls button').forEach(button => {
    const key = button.dataset.key;
    const down = (event) => { event.preventDefault(); setKey(key, true); };
    const up = (event) => { event.preventDefault(); setKey(key, false); };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', up);
  });

  startButton.addEventListener('click', startGame);
  buildWorld();
  updateHud(true);
  showIntro();
  requestAnimationFrame(frame);
})();
