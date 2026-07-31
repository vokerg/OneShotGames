import { LEVELS, TILE, WORLD_WIDTH, WORLD_HEIGHT, tileRect } from "./levels.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const hudLevel = document.querySelector("#hud-level");
const hudTime = document.querySelector("#hud-time");
const hudGold = document.querySelector("#hud-gold");
const hudScore = document.querySelector("#hud-score");
const hudDeaths = document.querySelector("#hud-deaths");
const soundButton = document.querySelector("#sound-toggle");

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const input = {
  held: new Set(),
  pressed: new Set(),
  virtual: new Set(),
  isDown(...codes) {
    return codes.some((code) => this.held.has(code) || this.virtual.has(code));
  },
  take(...codes) {
    const found = codes.some((code) => this.pressed.has(code));
    codes.forEach((code) => this.pressed.delete(code));
    return found;
  },
  anyPressed() {
    return this.pressed.size > 0;
  },
  clearPressed() {
    this.pressed.clear();
  },
};

const blockedKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);
window.addEventListener("keydown", (event) => {
  if (blockedKeys.has(event.code)) event.preventDefault();
  if (!event.repeat) input.pressed.add(event.code);
  input.held.add(event.code);

  if (event.code === "KeyP" || event.code === "Escape") {
    game.togglePause();
  }
  if (event.code === "KeyM") {
    audio.toggle();
  }
});
window.addEventListener("keyup", (event) => input.held.delete(event.code));
window.addEventListener("blur", () => {
  input.held.clear();
  input.virtual.clear();
  if (game.state === "playing") game.state = "paused";
});

for (const button of document.querySelectorAll("[data-action]")) {
  const action = button.dataset.action;
  const press = (event) => {
    event.preventDefault();
    input.virtual.add(action);
    input.pressed.add(action);
    button.classList.add("is-active");
    button.setPointerCapture?.(event.pointerId);
  };
  const release = (event) => {
    event.preventDefault();
    input.virtual.delete(action);
    button.classList.remove("is-active");
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

class TinyAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
  }

  ensure() {
    if (!this.enabled) return null;
    this.context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === "suspended") this.context.resume();
    return this.context;
  }

  tone(frequency, duration = 0.08, type = "sine", volume = 0.035, slide = 0) {
    const ac = this.ensure();
    if (!ac) return;
    const now = ac.currentTime;
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(ac.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  toggle() {
    this.enabled = !this.enabled;
    soundButton.textContent = this.enabled ? "Sound: on" : "Sound: off";
    soundButton.setAttribute("aria-pressed", String(this.enabled));
    if (this.enabled) this.tone(540, 0.06, "triangle", 0.025, 120);
  }
}

const audio = new TinyAudio();
soundButton.addEventListener("click", () => audio.toggle());

class Game {
  constructor() {
    this.levelIndex = 0;
    this.level = null;
    this.state = "intro";
    this.score = 0;
    this.checkpointScore = 0;
    this.deaths = 0;
    this.totalGold = 0;
    this.checkpointGold = 0;
    this.bestScore = Number(localStorage.getItem("way-of-the-ninja-best") || 0);
    this.switchActive = false;
    this.timer = 0;
    this.worldTime = 0;
    this.stateTimer = 0;
    this.shake = 0;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.resize();
    this.loadLevel(0, false);
    window.addEventListener("resize", () => this.resize());
    requestAnimationFrame((time) => this.frame(time));
  }

  resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = WORLD_WIDTH * dpr;
    canvas.height = WORLD_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  loadLevel(index, preserveCheckpoint = true) {
    this.levelIndex = index;
    const source = LEVELS[index];
    this.level = {
      ...source,
      solids: source.solids.map(tileRect),
      gold: source.gold.map((item, i) => ({
        id: i,
        x: item.x * TILE,
        y: item.y * TILE,
        collected: false,
      })),
      mines: source.mines.map((item) => ({
        x: item.x * TILE,
        y: item.y * TILE,
        state: "idle",
        fuse: 0.34,
        blast: 0,
      })),
      turrets: source.turrets.map((item, i) => ({
        x: item.x * TILE,
        y: item.y * TILE,
        angle: item.angle ?? 0,
        cooldown: 0.65 + i * 0.35,
        flash: 0,
      })),
      drones: source.drones.map((item, i) => ({
        x: item.x1 * TILE,
        x1: item.x1 * TILE,
        x2: item.x2 * TILE,
        y: item.y * TILE,
        speed: item.speed * TILE,
        direction: i % 2 ? -1 : 1,
        phase: i * 1.7,
      })),
      spikes: source.spikes.map(tileRect),
    };

    if (!preserveCheckpoint) {
      this.score = 0;
      this.deaths = 0;
      this.totalGold = 0;
      this.checkpointGold = 0;
    } else {
      this.score = this.checkpointScore;
      this.totalGold = this.checkpointGold;
    }

    this.checkpointScore = this.score;
    this.switchActive = false;
    this.timer = source.par + 18;
    this.projectiles = [];
    this.particles = [];
    this.stateTimer = 0;
    this.spawnPlayer();
    this.updateHud();
  }

  spawnPlayer() {
    const spawn = this.level.spawn;
    this.player = {
      x: spawn.x * TILE - 12,
      y: spawn.y * TILE - 34,
      w: 24,
      h: 34,
      vx: 0,
      vy: 0,
      grounded: false,
      touchLeft: false,
      touchRight: false,
      coyote: 0,
      jumpBuffer: 0,
      facing: 1,
      squash: 0,
      trail: [],
    };
  }

  togglePause() {
    if (this.state === "playing") {
      this.state = "paused";
      input.clearPressed();
    } else if (this.state === "paused") {
      this.state = "playing";
      this.lastFrame = performance.now();
      input.clearPressed();
    }
  }

  frame(now) {
    const elapsed = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.accumulator += elapsed;
    const step = 1 / 120;
    while (this.accumulator >= step) {
      this.update(step);
      this.accumulator -= step;
    }
    this.render();
    requestAnimationFrame((time) => this.frame(time));
  }

  update(dt) {
    this.worldTime += dt;
    this.shake = Math.max(0, this.shake - dt * 18);

    if (this.state === "intro") {
      this.updateParticles(dt);
      if (input.anyPressed()) {
        this.state = "playing";
        audio.tone(330, 0.08, "triangle", 0.03, 240);
        input.clearPressed();
      }
      return;
    }

    if (this.state === "paused") return;

    if (this.state === "dead") {
      this.stateTimer -= dt;
      this.updateParticles(dt);
      if (this.stateTimer <= 0) {
        this.loadLevel(this.levelIndex, true);
        this.state = "playing";
      }
      return;
    }

    if (this.state === "complete") {
      this.stateTimer -= dt;
      this.updateParticles(dt);
      if (this.stateTimer <= 0 && (input.anyPressed() || this.stateTimer < -0.8)) {
        input.clearPressed();
        if (this.levelIndex + 1 < LEVELS.length) {
          this.loadLevel(this.levelIndex + 1, true);
          this.state = "playing";
        } else {
          this.state = "victory";
          this.bestScore = Math.max(this.bestScore, this.score);
          localStorage.setItem("way-of-the-ninja-best", String(this.bestScore));
          audio.tone(440, 0.15, "triangle", 0.04, 440);
        }
      }
      return;
    }

    if (this.state === "victory") {
      this.updateParticles(dt);
      if (input.take("KeyR", "Enter", "Space", "jump")) {
        this.loadLevel(0, false);
        this.state = "playing";
      }
      return;
    }

    if (input.take("KeyR", "restart")) {
      this.deaths += 1;
      this.loadLevel(this.levelIndex, true);
      this.state = "playing";
      audio.tone(180, 0.08, "square", 0.018, -50);
      return;
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      this.die("time");
      return;
    }

    this.updatePlayer(dt);
    this.updateGold();
    this.updateSwitchAndExit();
    this.updateMines(dt);
    this.updateTurrets(dt);
    this.updateDrones(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateHud();
  }

  updatePlayer(dt) {
    const p = this.player;
    const left = input.isDown("ArrowLeft", "KeyA", "left");
    const right = input.isDown("ArrowRight", "KeyD", "right");
    const jumpHeld = input.isDown("ArrowUp", "KeyW", "KeyZ", "Space", "jump");
    const jumpPressed = input.take("ArrowUp", "KeyW", "KeyZ", "Space", "jump");

    if (jumpPressed) p.jumpBuffer = 0.13;
    else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    p.coyote = Math.max(0, p.coyote - dt);

    const axis = Number(right) - Number(left);
    if (axis) {
      const acceleration = p.grounded ? 2350 : 1500;
      p.vx += axis * acceleration * dt;
      p.vx = clamp(p.vx, -350, 350);
      p.facing = axis;
    } else if (p.grounded) {
      p.vx *= Math.pow(0.00035, dt);
      if (Math.abs(p.vx) < 1) p.vx = 0;
    } else {
      p.vx *= Math.pow(0.42, dt);
    }

    const wallSide = p.touchLeft ? -1 : p.touchRight ? 1 : 0;
    if (p.jumpBuffer > 0) {
      if (p.grounded || p.coyote > 0) {
        p.vy = -625;
        p.grounded = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.squash = -0.28;
        this.emit(p.x + p.w / 2, p.y + p.h, 8, "#d7f9ff", 110);
        audio.tone(260, 0.07, "triangle", 0.025, 90);
      } else if (wallSide) {
        p.vx = -wallSide * 435;
        p.vy = -590;
        p.jumpBuffer = 0;
        p.facing = -wallSide;
        this.emit(p.x + (wallSide > 0 ? p.w : 0), p.y + p.h * 0.6, 9, "#98e9ff", 130);
        audio.tone(300, 0.06, "square", 0.018, 70);
      }
    }

    if (!jumpHeld && p.vy < -220) p.vy += 2200 * dt;

    const pressingWall = (p.touchLeft && left) || (p.touchRight && right);
    const gravity = pressingWall && p.vy > 0 ? 950 : 1900;
    p.vy = Math.min(p.vy + gravity * dt, pressingWall ? 190 : 900);

    const wasGrounded = p.grounded;
    p.touchLeft = false;
    p.touchRight = false;
    this.moveHorizontal(p, p.vx * dt);
    p.grounded = false;
    this.moveVertical(p, p.vy * dt);
    this.refreshWallContacts(p);

    if (!wasGrounded && p.grounded && p.vy === 0) {
      p.squash = 0.35;
      this.emit(p.x + p.w / 2, p.y + p.h, 5, "#f4f7f8", 70);
      audio.tone(95, 0.035, "sine", 0.012);
    }
    p.squash = lerp(p.squash, 0, 1 - Math.pow(0.0008, dt));

    p.trail.unshift({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
    if (p.trail.length > 7) p.trail.pop();

    if (p.y > WORLD_HEIGHT + 80) this.die("fall");

    for (const spike of this.level.spikes) {
      if (overlap(p, spike)) {
        this.die("spikes");
        return;
      }
    }
  }

  moveHorizontal(body, amount) {
    body.x += amount;
    for (const solid of this.level.solids) {
      if (!overlap(body, solid)) continue;
      if (amount > 0) {
        body.x = solid.x - body.w;
        body.touchRight = true;
      } else if (amount < 0) {
        body.x = solid.x + solid.w;
        body.touchLeft = true;
      }
      body.vx = 0;
    }
  }

  moveVertical(body, amount) {
    body.y += amount;
    for (const solid of this.level.solids) {
      if (!overlap(body, solid)) continue;
      if (amount > 0) {
        body.y = solid.y - body.h;
        body.vy = 0;
        body.grounded = true;
        body.coyote = 0.1;
      } else if (amount < 0) {
        body.y = solid.y + solid.h;
        body.vy = 0;
      }
    }
  }

  refreshWallContacts(body) {
    const leftProbe = { x: body.x - 1.5, y: body.y + 2, w: 1.5, h: body.h - 4 };
    const rightProbe = { x: body.x + body.w, y: body.y + 2, w: 1.5, h: body.h - 4 };
    body.touchLeft ||= this.level.solids.some((solid) => overlap(leftProbe, solid));
    body.touchRight ||= this.level.solids.some((solid) => overlap(rightProbe, solid));
  }

  updateGold() {
    const center = this.playerCenter();
    for (const gold of this.level.gold) {
      if (gold.collected) continue;
      if (Math.hypot(center.x - gold.x, center.y - gold.y) < 28) {
        gold.collected = true;
        this.score += 100;
        this.totalGold += 1;
        this.timer += 0.35;
        this.emit(gold.x, gold.y, 13, "#ffd84a", 145);
        audio.tone(680, 0.07, "triangle", 0.028, 260);
      }
    }
  }

  updateSwitchAndExit() {
    const p = this.player;
    const switchRect = {
      x: this.level.switch.x * TILE - 15,
      y: this.level.switch.y * TILE - 10,
      w: 30,
      h: 20,
    };
    if (!this.switchActive && overlap(p, switchRect)) {
      this.switchActive = true;
      this.score += 250;
      this.emit(switchRect.x + 15, switchRect.y + 8, 22, "#67f7c0", 180);
      audio.tone(410, 0.15, "sawtooth", 0.025, 390);
    }

    if (this.switchActive) {
      const exitRect = this.getExitRect();
      if (overlap(p, exitRect)) {
        const bonus = Math.max(0, Math.floor(this.timer * 10));
        this.score += bonus;
        this.checkpointScore = this.score;
        this.checkpointGold = this.totalGold;
        this.state = "complete";
        this.stateTimer = 0.75;
        this.emit(exitRect.x + exitRect.w / 2, exitRect.y + exitRect.h / 2, 34, "#67f7c0", 230);
        audio.tone(520, 0.18, "triangle", 0.04, 420);
      }
    }
  }

  updateMines(dt) {
    const center = this.playerCenter();
    for (const mine of this.level.mines) {
      if (mine.state === "exploded") {
        mine.blast = Math.max(0, mine.blast - dt * 3.5);
        continue;
      }
      const distance = Math.hypot(center.x - mine.x, center.y - mine.y);
      if (mine.state === "idle" && distance < 55) {
        mine.state = "armed";
        audio.tone(820, 0.04, "square", 0.015);
      }
      if (mine.state === "armed") {
        mine.fuse -= dt;
        if (mine.fuse <= 0) {
          mine.state = "exploded";
          mine.blast = 1;
          this.shake = Math.max(this.shake, 8);
          this.emit(mine.x, mine.y, 30, "#ff5e64", 270);
          audio.tone(95, 0.2, "sawtooth", 0.045, -55);
          if (distance < 104) this.die("mine");
        }
      }
    }
  }

  updateTurrets(dt) {
    const center = this.playerCenter();
    for (const turret of this.level.turrets) {
      turret.cooldown -= dt;
      turret.flash = Math.max(0, turret.flash - dt * 7);
      const targetAngle = Math.atan2(center.y - turret.y, center.x - turret.x);
      const delta = ((targetAngle - turret.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      turret.angle += clamp(delta, -2.8 * dt, 2.8 * dt);
      const distance = Math.hypot(center.x - turret.x, center.y - turret.y);
      if (turret.cooldown <= 0 && distance < 760 && this.hasLineOfSight(turret.x, turret.y, center.x, center.y)) {
        turret.cooldown = 1.65;
        turret.flash = 1;
        const speed = 430;
        this.projectiles.push({
          x: turret.x + Math.cos(turret.angle) * 20,
          y: turret.y + Math.sin(turret.angle) * 20,
          vx: Math.cos(turret.angle) * speed,
          vy: Math.sin(turret.angle) * speed,
          life: 2.4,
        });
        audio.tone(150, 0.055, "square", 0.02, 70);
      }
    }
  }

  updateDrones(dt) {
    const p = this.player;
    for (const drone of this.level.drones) {
      drone.x += drone.direction * drone.speed * dt;
      if (drone.x <= drone.x1 || drone.x >= drone.x2) {
        drone.x = clamp(drone.x, drone.x1, drone.x2);
        drone.direction *= -1;
      }
      drone.phase += dt * 4;
      const rect = { x: drone.x - 18, y: drone.y + Math.sin(drone.phase) * 7 - 15, w: 36, h: 30 };
      if (overlap(p, rect)) this.die("drone");
    }
  }

  updateProjectiles(dt) {
    const p = this.player;
    for (const shot of this.projectiles) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      const shotRect = { x: shot.x - 5, y: shot.y - 5, w: 10, h: 10 };
      if (overlap(p, shotRect)) {
        shot.life = 0;
        this.die("turret");
      } else if (this.level.solids.some((solid) => overlap(shotRect, solid))) {
        shot.life = 0;
        this.emit(shot.x, shot.y, 5, "#ff7478", 70);
      }
    }
    this.projectiles = this.projectiles.filter((shot) => shot.life > 0);
  }

  hasLineOfSight(x1, y1, x2, y2) {
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(distance / 18);
    for (let i = 2; i < steps; i += 1) {
      const t = i / steps;
      const point = { x: lerp(x1, x2, t) - 2, y: lerp(y1, y2, t) - 2, w: 4, h: 4 };
      if (this.level.solids.some((solid) => overlap(point, solid))) return false;
    }
    return true;
  }

  die() {
    if (this.state !== "playing") return;
    this.state = "dead";
    this.stateTimer = 0.72;
    this.deaths += 1;
    this.shake = 12;
    const center = this.playerCenter();
    this.emit(center.x, center.y, 42, "#ff6671", 320);
    audio.tone(120, 0.28, "sawtooth", 0.05, -75);
  }

  emit(x, y, count, color, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.25 + Math.random() * 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.35 + Math.random() * 0.45,
        maxLife: 0.8,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 520 * dt;
      particle.vx *= Math.pow(0.2, dt);
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  playerCenter() {
    return { x: this.player.x + this.player.w / 2, y: this.player.y + this.player.h / 2 };
  }

  getExitRect() {
    return {
      x: this.level.exit.x * TILE - 20,
      y: this.level.exit.y * TILE - 56,
      w: 40,
      h: 72,
    };
  }

  updateHud() {
    const collected = this.level.gold.filter((gold) => gold.collected).length;
    hudLevel.textContent = `${this.levelIndex + 1}/${LEVELS.length} · ${this.level.name}`;
    hudTime.textContent = Math.max(0, this.timer).toFixed(1);
    hudTime.classList.toggle("danger", this.timer < 10);
    hudGold.textContent = `${collected}/${this.level.gold.length}`;
    hudScore.textContent = String(this.score).padStart(5, "0");
    hudDeaths.textContent = String(this.deaths);
  }

  render() {
    ctx.save();
    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.translate(shakeX, shakeY);
    this.drawBackground();
    this.drawSolids();
    this.drawSpikes();
    this.drawExit();
    this.drawSwitch();
    this.drawGold();
    this.drawMines();
    this.drawTurrets();
    this.drawDrones();
    this.drawProjectiles();
    this.drawPlayer();
    this.drawParticles();
    ctx.restore();
    this.drawOverlay();
  }

  drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    gradient.addColorStop(0, "#151a24");
    gradient.addColorStop(1, "#090c12");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.strokeStyle = "rgba(160, 190, 215, 0.055)";
    ctx.lineWidth = 1;
    const offset = (this.worldTime * 8) % 32;
    for (let x = -32 + offset; x < WORLD_WIDTH + 32; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < WORLD_HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_WIDTH, y);
      ctx.stroke();
    }
  }

  drawSolids() {
    for (const solid of this.level.solids) {
      ctx.fillStyle = "#d8dde2";
      ctx.fillRect(solid.x, solid.y, solid.w, solid.h);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(solid.x, solid.y, solid.w, 3);
      ctx.fillStyle = "rgba(33,42,52,0.2)";
      ctx.fillRect(solid.x, solid.y + solid.h - 5, solid.w, 5);
      ctx.strokeStyle = "rgba(24,31,40,0.16)";
      ctx.lineWidth = 1;
      for (let x = solid.x + 16; x < solid.x + solid.w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, solid.y + 5);
        ctx.lineTo(x + 12, solid.y + Math.min(18, solid.h - 5));
        ctx.stroke();
      }
    }
  }

  drawSpikes() {
    ctx.fillStyle = "#ff5964";
    for (const spike of this.level.spikes) {
      const teeth = Math.max(1, Math.round(spike.w / 16));
      const toothWidth = spike.w / teeth;
      for (let i = 0; i < teeth; i += 1) {
        ctx.beginPath();
        ctx.moveTo(spike.x + i * toothWidth, spike.y + spike.h);
        ctx.lineTo(spike.x + (i + 0.5) * toothWidth, spike.y);
        ctx.lineTo(spike.x + (i + 1) * toothWidth, spike.y + spike.h);
        ctx.fill();
      }
    }
  }

  drawGold() {
    for (const gold of this.level.gold) {
      if (gold.collected) continue;
      const pulse = 1 + Math.sin(this.worldTime * 6 + gold.id) * 0.08;
      ctx.save();
      ctx.translate(gold.x, gold.y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = "#ffd84a";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        const radius = i % 2 ? 7 : 12;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(-2, -7, 4, 14);
      ctx.restore();
    }
  }

  drawSwitch() {
    const x = this.level.switch.x * TILE;
    const y = this.level.switch.y * TILE;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = this.switchActive ? "#67f7c0" : "#68c9ff";
    ctx.shadowBlur = this.switchActive ? 22 : 10;
    ctx.fillStyle = this.switchActive ? "#67f7c0" : "#68c9ff";
    ctx.fillRect(-16, -8, 32, 14);
    ctx.fillStyle = "#0d1520";
    ctx.fillRect(-8, -4, 16, 6);
    ctx.restore();
  }

  drawExit() {
    const door = this.getExitRect();
    const open = this.switchActive;
    ctx.save();
    ctx.shadowColor = open ? "#67f7c0" : "#ff5964";
    ctx.shadowBlur = open ? 26 : 8;
    ctx.strokeStyle = open ? "#67f7c0" : "#ff5964";
    ctx.lineWidth = 6;
    ctx.strokeRect(door.x, door.y, door.w, door.h);
    if (!open) {
      ctx.fillStyle = "rgba(255,89,100,0.45)";
      for (let y = door.y + 7; y < door.y + door.h; y += 12) ctx.fillRect(door.x + 5, y, door.w - 10, 4);
    } else {
      ctx.fillStyle = "rgba(103,247,192,0.14)";
      ctx.fillRect(door.x + 4, door.y + 4, door.w - 8, door.h - 8);
    }
    ctx.restore();
  }

  drawMines() {
    for (const mine of this.level.mines) {
      if (mine.state === "exploded" && mine.blast <= 0) continue;
      ctx.save();
      ctx.translate(mine.x, mine.y);
      if (mine.state === "exploded") {
        ctx.globalAlpha = mine.blast;
        ctx.strokeStyle = "#ff5964";
        ctx.lineWidth = 8 * mine.blast;
        ctx.beginPath();
        ctx.arc(0, 0, 90 * (1 - mine.blast), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const armed = mine.state === "armed";
        ctx.rotate(this.worldTime * (armed ? 7 : 0.8));
        ctx.fillStyle = armed && Math.floor(this.worldTime * 18) % 2 ? "#ffffff" : "#ff5964";
        ctx.shadowColor = "#ff5964";
        ctx.shadowBlur = armed ? 24 : 9;
        ctx.beginPath();
        for (let i = 0; i < 16; i += 1) {
          const angle = (i / 16) * Math.PI * 2;
          const radius = i % 2 ? 9 : 15;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1a1015";
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawTurrets() {
    for (const turret of this.level.turrets) {
      ctx.save();
      ctx.translate(turret.x, turret.y);
      ctx.rotate(turret.angle);
      ctx.fillStyle = "#aeb8c3";
      ctx.beginPath();
      ctx.moveTo(-13, -14);
      ctx.lineTo(18, 0);
      ctx.lineTo(-13, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = turret.flash ? "#ffffff" : "#ff5964";
      ctx.shadowColor = "#ff5964";
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.arc(2, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawDrones() {
    for (const drone of this.level.drones) {
      const y = drone.y + Math.sin(drone.phase) * 7;
      ctx.save();
      ctx.translate(drone.x, y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = "#ff5964";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#ff5964";
      ctx.fillRect(-14, -14, 28, 28);
      ctx.fillStyle = "#1b1117";
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
  }

  drawProjectiles() {
    ctx.fillStyle = "#ff7478";
    ctx.shadowColor = "#ff5964";
    ctx.shadowBlur = 12;
    for (const shot of this.projectiles) {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  drawPlayer() {
    if (this.state === "dead") return;
    const p = this.player;
    for (let i = p.trail.length - 1; i >= 1; i -= 1) {
      const point = p.trail[i];
      ctx.globalAlpha = (p.trail.length - i) * 0.015;
      ctx.fillStyle = "#82e7ff";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const stretch = clamp(Math.abs(p.vy) / 900, 0, 0.18);
    const scaleX = 1 - stretch + p.squash;
    const scaleY = 1 + stretch - p.squash;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.scale(scaleX, scaleY);

    ctx.strokeStyle = "rgba(130,231,255,0.65)";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#06080c";
    ctx.beginPath();
    ctx.roundRect(-12, -17, 24, 34, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#eafcff";
    ctx.fillRect(p.facing > 0 ? 1 : -9, -9, 8, 3);
    ctx.fillStyle = "#82e7ff";
    ctx.fillRect(p.facing > 0 ? 6 : -8, -9, 2, 2);

    ctx.strokeStyle = "#82e7ff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-p.facing * 6, -5);
    ctx.quadraticCurveTo(-p.facing * 20, -12 - p.vy * 0.006, -p.facing * 28, -4 - p.vy * 0.01);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles() {
    for (const particle of this.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  drawOverlay() {
    if (this.state === "playing") return;
    ctx.save();
    ctx.fillStyle = "rgba(5, 7, 11, 0.72)";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f3f6f8";

    if (this.state === "intro") {
      ctx.font = "800 72px Inter, system-ui, sans-serif";
      ctx.fillText("WAY OF THE NINJA", WORLD_WIDTH / 2, 245);
      ctx.fillStyle = "#82e7ff";
      ctx.font = "700 23px Inter, system-ui, sans-serif";
      ctx.fillText("MOMENTUM TRIAL", WORLD_WIDTH / 2, 286);
      ctx.fillStyle = "#cbd4dc";
      ctx.font = "500 20px Inter, system-ui, sans-serif";
      ctx.fillText("Move with A/D or arrows · jump with Space/Z · wall-jump to climb", WORLD_WIDTH / 2, 350);
      ctx.fillText("Touch the blue switch, then reach the exit. Gold is optional; survival is not.", WORLD_WIDTH / 2, 384);
      ctx.fillStyle = "#67f7c0";
      ctx.font = "700 21px Inter, system-ui, sans-serif";
      ctx.fillText("PRESS ANY KEY", WORLD_WIDTH / 2, 455 + Math.sin(this.worldTime * 4) * 4);
    } else if (this.state === "paused") {
      ctx.font = "800 62px Inter, system-ui, sans-serif";
      ctx.fillText("PAUSED", WORLD_WIDTH / 2, 315);
      ctx.fillStyle = "#cbd4dc";
      ctx.font = "500 20px Inter, system-ui, sans-serif";
      ctx.fillText("Press P or Escape to return", WORLD_WIDTH / 2, 365);
    } else if (this.state === "complete") {
      ctx.font = "800 58px Inter, system-ui, sans-serif";
      ctx.fillText("SECTOR CLEAR", WORLD_WIDTH / 2, 300);
      ctx.fillStyle = "#67f7c0";
      ctx.font = "700 25px Inter, system-ui, sans-serif";
      ctx.fillText(`Score ${this.score}`, WORLD_WIDTH / 2, 350);
      ctx.fillStyle = "#cbd4dc";
      ctx.font = "500 18px Inter, system-ui, sans-serif";
      ctx.fillText("Press any key for the next trial", WORLD_WIDTH / 2, 392);
    } else if (this.state === "victory") {
      ctx.font = "800 62px Inter, system-ui, sans-serif";
      ctx.fillText("TRIAL COMPLETE", WORLD_WIDTH / 2, 255);
      ctx.fillStyle = "#ffd84a";
      ctx.font = "800 32px Inter, system-ui, sans-serif";
      ctx.fillText(`FINAL SCORE ${this.score}`, WORLD_WIDTH / 2, 318);
      ctx.fillStyle = "#cbd4dc";
      ctx.font = "500 21px Inter, system-ui, sans-serif";
      ctx.fillText(`Gold ${this.totalGold} · Deaths ${this.deaths} · Best ${this.bestScore}`, WORLD_WIDTH / 2, 365);
      ctx.fillStyle = "#67f7c0";
      ctx.font = "700 19px Inter, system-ui, sans-serif";
      ctx.fillText("Press R, Enter, or Space to run again", WORLD_WIDTH / 2, 425);
    } else if (this.state === "dead") {
      ctx.font = "800 54px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#ff7478";
      ctx.fillText("RECALIBRATING", WORLD_WIDTH / 2, 330);
    }
    ctx.restore();
  }
}

const game = new Game();
