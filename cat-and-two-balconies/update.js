"use strict";

function isDoorGap(side, y) {
  return Math.abs(y - doors[side === "left" ? 0 : 1].y) < doorHalf - 8;
}

function constrainEntity(entity, isCat = false) {
  const r = entity.r;
  const leftDoor = doors[0];
  const rightDoor = doors[1];
  const inLeftBalcony = entity.x < room.left;
  const inRightBalcony = entity.x > room.right;

  entity.y = clamp(entity.y, room.top + r, room.bottom - r);

  if (!inLeftBalcony && !inRightBalcony) {
    if (entity.x - r < room.left) {
      if (leftDoor.open && isDoorGap("left", entity.y)) {
        entity.x = Math.max(leftDoor.balcony.left + r, entity.x);
        entity.y = clamp(entity.y, leftDoor.balcony.top + r, leftDoor.balcony.bottom - r);
      } else {
        entity.x = room.left + r;
        entity.vx = Math.max(0, entity.vx);
      }
    }
    if (entity.x + r > room.right) {
      if (rightDoor.open && isDoorGap("right", entity.y)) {
        entity.x = Math.min(rightDoor.balcony.right - r, entity.x);
        entity.y = clamp(entity.y, rightDoor.balcony.top + r, rightDoor.balcony.bottom - r);
      } else {
        entity.x = room.right - r;
        entity.vx = Math.min(0, entity.vx);
      }
    }
  } else if (inLeftBalcony) {
    entity.x = clamp(entity.x, leftDoor.balcony.left + r + 8, room.left + r);
    entity.y = clamp(entity.y, leftDoor.balcony.top + r + 6, leftDoor.balcony.bottom - r - 6);
    if (entity.x + r > room.left && !(leftDoor.open && isDoorGap("left", entity.y))) entity.x = room.left - r;
  } else if (inRightBalcony) {
    entity.x = clamp(entity.x, room.right - r, rightDoor.balcony.right - r - 8);
    entity.y = clamp(entity.y, rightDoor.balcony.top + r + 6, rightDoor.balcony.bottom - r - 6);
    if (entity.x - r < room.right && !(rightDoor.open && isDoorGap("right", entity.y))) entity.x = room.right + r;
  }

  if (isCat && cat.state === "room") {
    entity.y = clamp(entity.y, room.top + r + 8, room.bottom - r - 8);
  }
}

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
  const len = Math.hypot(dx, dy) || 1;
  const coldPenalty = temperature < 18 ? 0.88 : 1;
  const speed = 238 * coldPenalty;
  const targetVX = dx / len * speed;
  const targetVY = dy / len * speed;
  const response = 1 - Math.exp(-dt * 14);
  player.vx = lerp(player.vx, targetVX, response);
  player.vy = lerp(player.vy, targetVY, response);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  if (Math.hypot(player.vx, player.vy) > 10) player.facing = Math.atan2(player.vy, player.vx);
  constrainEntity(player);
}

function chooseWanderTarget() {
  cat.targetX = room.left + 90 + Math.random() * (room.right - room.left - 180);
  cat.targetY = room.top + 105 + Math.random() * (room.bottom - room.top - 190);
  cat.wander = 1.8 + Math.random() * 2.8;
}

function updateCat(dt) {
  const stage = currentStage();
  cat.tail += dt * (4 + Math.hypot(cat.vx, cat.vy) * .015);
  catGrace = Math.max(0, catGrace - dt);

  if (cat.state === "balcony") {
    rescueTimer -= dt;
    composure = Math.max(0, composure - dt * 1.8);
    const door = doors[cat.balcony];
    const outerX = cat.balcony === 0 ? door.balcony.left + 30 : door.balcony.right - 30;
    const panic = 1 - clamp(rescueTimer / stage.rescue, 0, 1);
    const targetY = door.y + Math.sin(elapsed * 4.5) * 42;
    const targetVX = (outerX - cat.x) * (0.55 + panic * .62);
    const targetVY = (targetY - cat.y) * 1.8;
    cat.vx = lerp(cat.vx, targetVX, 1 - Math.exp(-dt * 4.5));
    cat.vy = lerp(cat.vy, targetVY, 1 - Math.exp(-dt * 4.5));
    cat.x += cat.vx * dt;
    cat.y += cat.vy * dt;
    constrainEntity(cat, true);
    if (rescueTimer <= 0) {
      endGame(false, "The rescue window ran out and the cat jumped from the balcony.");
    }
    return;
  }

  const openDoors = doors.map((door, i) => door.open ? i : -1).filter(i => i >= 0);
  cat.wander -= dt;
  if (cat.wander <= 0) chooseWanderTarget();

  let targetX = cat.targetX;
  let targetY = cat.targetY;
  let desiredSpeed = 58 * stage.cat;

  if (openDoors.length && catGrace <= 0) {
    let chosen = openDoors[0];
    if (openDoors.length === 2) {
      const d0 = Math.abs(cat.x - room.left);
      const d1 = Math.abs(cat.x - room.right);
      chosen = d0 < d1 ? 0 : 1;
    }
    const door = doors[chosen];
    const urge = clamp((curiosity - 35) / 65, 0, 1);
    targetX = door.x + (chosen === 0 ? -70 : 70);
    targetY = door.y;
    desiredSpeed = lerp(72, 188, urge) * stage.cat;
  }

  const playerDistance = dist(player, cat);
  if (playerDistance < 112 && openDoors.length) {
    const awayX = cat.x - player.x;
    const awayY = cat.y - player.y;
    const len = Math.hypot(awayX, awayY) || 1;
    targetX = cat.x + awayX / len * 130;
    targetY = cat.y + awayY / len * 130;
    desiredSpeed *= 1.18;
  }

  const dx = targetX - cat.x;
  const dy = targetY - cat.y;
  const len = Math.hypot(dx, dy) || 1;
  const desiredVX = dx / len * desiredSpeed;
  const desiredVY = dy / len * desiredSpeed;
  const response = 1 - Math.exp(-dt * (3.0 + stage.cat));
  cat.vx = lerp(cat.vx, desiredVX, response);
  cat.vy = lerp(cat.vy, desiredVY, response);
  cat.x += cat.vx * dt;
  cat.y += cat.vy * dt;
  if (Math.hypot(cat.vx, cat.vy) > 5) cat.facing = Math.atan2(cat.vy, cat.vx);
  constrainEntity(cat, true);

  if (cat.x < room.left - 10) enterBalcony(0);
  else if (cat.x > room.right + 10) enterBalcony(1);
}

function enterBalcony(index) {
  if (cat.state === "balcony") return;
  cat.state = "balcony";
  cat.balcony = index;
  rescueTimer = currentStage().rescue;
  curiosity = 100;
  composure = Math.max(0, composure - 8);
  flash = 1;
  shake = 8;
  soundWarning();
  showToast("Cat on the balcony — get close and press E!", 2.4);
}

function updateClimate(dt) {
  const openCount = doors.filter(d => d.open).length;
  const stage = currentStage();
  let rate;
  if (openCount === 0) rate = 0.225 * stage.heat;
  else if (openCount === 1) rate = 0.1125 * stage.heat;
  else rate = -0.34 / Math.sqrt(stage.heat);
  temperature = clamp(temperature + rate * dt, 15.5, 35.5);

  const catMultiplier = cat.state === "balcony" ? 0 : 1;
  if (openCount === 0) curiosity -= 19 * dt;
  else curiosity += (openCount === 1 ? 6.4 : 10.2) * stage.curiosity * dt * catMultiplier;
  curiosity = clamp(curiosity, 0, 100);

  if (temperature > 29) composure -= (temperature - 29) * .18 * dt;
  if (temperature >= 35) endGame(false, "The temperature reached 35°C before the room could cool down.");
}

function updateProgress(dt) {
  elapsed += dt;
  stageElapsed += dt;
  score += dt * (7 + composure * .035);
  const stage = currentStage();

  distractionTimer -= dt;
  if (stageIndex >= 2 && distractionTimer <= 0 && cat.state === "room") {
    distractionTimer = stageIndex === 2 ? 12 + Math.random() * 5 : 8 + Math.random() * 4;
    curiosity = clamp(curiosity + 18 + stageIndex * 3, 0, 100);
    showToast("A noise from the street catches the cat's attention", 1.8);
    tone(260, .08, "square", .018, 90);
  }

  if (stageElapsed >= stage.seconds) {
    if (stageIndex >= stages.length - 1) {
      endGame(true);
      return;
    }
    stageIndex += 1;
    stageElapsed = 0;
    catGrace = 2.3;
    distractionTimer = 10;
    flash = .65;
    soundStage();
    showToast(`Stage ${stageIndex + 1}: ${currentStage().name}`, 2.2);
  }
}

function updateDoors(dt) {
  doors.forEach(door => {
    const target = door.open ? 1 : 0;
    door.anim = lerp(door.anim, target, 1 - Math.exp(-dt * 9));
  });
}

function update(dt) {
  updateDoors(dt);
  if (mode !== "playing") return;

  if (pressed.has("KeyE") || pressed.has("Space")) interact();
  updatePlayer(dt);
  updateClimate(dt);
  if (mode !== "playing") return;
  updateCat(dt);
  if (mode !== "playing") return;
  updateProgress(dt);
  flash = Math.max(0, flash - dt * 1.7);
  shake = Math.max(0, shake - dt * 15);
  toastTimer = Math.max(0, toastTimer - dt);
  if (toastTimer === 0) ui.toast.classList.remove("show");
  updateUI();
}
