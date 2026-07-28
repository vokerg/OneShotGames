"use strict";

function isDoorGap(side, y) {
  return Math.abs(y - doors[side === "left" ? 0 : 1].y) < doorHalf - 8;
}

function doorPassable(index) {
  return doors[index].anim > 0.27;
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
      if (doorPassable(0) && isDoorGap("left", entity.y)) {
        entity.x = Math.max(leftDoor.balcony.left + r, entity.x);
        entity.y = clamp(entity.y, leftDoor.balcony.top + r, leftDoor.balcony.bottom - r);
      } else {
        entity.x = room.left + r;
        entity.vx = Math.max(0, entity.vx);
      }
    }
    if (entity.x + r > room.right) {
      if (doorPassable(1) && isDoorGap("right", entity.y)) {
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
    if (entity.x + r > room.left && !(doorPassable(0) && isDoorGap("left", entity.y))) entity.x = room.left - r;
  } else if (inRightBalcony) {
    entity.x = clamp(entity.x, room.right - r, rightDoor.balcony.right - r - 8);
    entity.y = clamp(entity.y, rightDoor.balcony.top + r + 6, rightDoor.balcony.bottom - r - 6);
    if (entity.x - r < room.right && !(doorPassable(1) && isDoorGap("right", entity.y))) entity.x = room.right + r;
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
  cat.wander = 1.4 + Math.random() * 2.5;
}

function chooseEscapeDoor(openDoors, stage) {
  if (eventDoor >= 0 && openDoors.includes(eventDoor) && eventTelegraph > 0 && Math.random() < 0.76) {
    return eventDoor;
  }
  if (openDoors.length === 1) return openDoors[0];

  const near = Math.abs(cat.x - room.left) < Math.abs(cat.x - room.right) ? 0 : 1;
  const far = near === 0 ? 1 : 0;
  const farChance = 0.24 + stageIndex * 0.10;
  return Math.random() < farChance ? far : near;
}

function startCatRun(openDoors) {
  if (!openDoors.length) return;
  const stage = currentStage();
  cat.intentDoor = chooseEscapeDoor(openDoors, stage);
  const roll = Math.random();
  cat.behavior = roll < stage.sprintChance ? "sprint" : roll < stage.sprintChance + 0.25 ? "feint" : "stalk";
  cat.sprintTimer = cat.behavior === "sprint" ? 1.7 + Math.random() * 1.5 : 2.4 + Math.random() * 1.8;
  cat.decisionTimer = 0.65 + Math.random() * 0.8;
  cat.switchTimer = 0.42 + Math.random() * 0.72;
  cat.switchUsed = false;

  if (cat.behavior === "sprint") {
    tone(310, .07, "square", .015, 80);
    showToast(`Zoomies — the cat bolts for the ${cat.intentDoor === 0 ? "west" : "east"} balcony!`, 1.35);
  }
}

function retargetCat(openDoors, forced = false) {
  if (!openDoors.length) {
    cat.behavior = "wander";
    cat.intentDoor = -1;
    return;
  }
  const alternatives = openDoors.filter(index => index !== cat.intentDoor);
  if (!alternatives.length) return;
  if (forced || Math.random() < currentStage().switchChance) {
    cat.intentDoor = alternatives[Math.floor(Math.random() * alternatives.length)];
    cat.switchUsed = true;
    cat.switchTimer = 99;
    cat.sprintTimer = Math.max(cat.sprintTimer, 1.15);
    cat.behavior = "sprint";
    showToast(`Fake-out! The cat doubles back toward the ${cat.intentDoor === 0 ? "west" : "east"} balcony.`, 1.25);
    tone(380, .06, "triangle", .018, 90);
  }
}

function updateCat(dt) {
  const stage = currentStage();
  cat.tail += dt * (4 + Math.hypot(cat.vx, cat.vy) * .015);
  catGrace = Math.max(0, catGrace - dt);
  cat.decisionTimer = Math.max(0, cat.decisionTimer - dt);
  cat.sprintTimer = Math.max(0, cat.sprintTimer - dt);
  cat.switchTimer = Math.max(0, cat.switchTimer - dt);

  if (cat.state === "balcony") {
    rescueTimer -= dt;
    composure = Math.max(0, composure - dt * 2.0);
    const door = doors[cat.balcony];
    const outerX = cat.balcony === 0 ? door.balcony.left + 30 : door.balcony.right - 30;
    const panic = 1 - clamp(rescueTimer / stage.rescue, 0, 1);
    const targetY = door.y + Math.sin(elapsed * 4.5) * 42;
    const targetVX = (outerX - cat.x) * (0.55 + panic * .68);
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

  const openDoors = doors.map((door, i) => doorPassable(i) ? i : -1).filter(i => i >= 0);
  cat.wander -= dt;
  if (cat.wander <= 0) chooseWanderTarget();

  let targetX = cat.targetX;
  let targetY = cat.targetY;
  let desiredSpeed = 58 * stage.cat;

  if (!openDoors.length) {
    if (cat.behavior !== "wander") {
      cat.behavior = "wander";
      cat.intentDoor = -1;
      cat.switchUsed = false;
      chooseWanderTarget();
    }
    if (eventDoor >= 0 && eventTelegraph > 0) {
      targetX = eventDoor === 0 ? room.left + 88 : room.right - 88;
      targetY = doors[eventDoor].y + Math.sin(elapsed * 2.3) * 30;
      desiredSpeed = 76 * stage.cat;
    }
  } else if (catGrace <= 0) {
    const pressure = curiosity + (eventTelegraph > 0 ? 13 : 0);
    if (cat.behavior === "wander" && pressure >= stage.escapeThreshold && cat.decisionTimer <= 0) {
      startCatRun(openDoors);
    }

    if (cat.behavior !== "wander") {
      if (!openDoors.includes(cat.intentDoor)) {
        const forceSwitch = cat.behavior === "sprint" || stageIndex >= 2;
        retargetCat(openDoors, forceSwitch);
      }

      if (!cat.switchUsed && cat.switchTimer <= 0 && openDoors.length > 1 && cat.behavior !== "stalk") {
        retargetCat(openDoors);
        cat.switchUsed = true;
      }

      if (cat.intentDoor >= 0 && openDoors.includes(cat.intentDoor)) {
        const door = doors[cat.intentDoor];
        const urge = clamp((curiosity - stage.escapeThreshold + 18) / 66, 0, 1);
        targetX = door.x + (cat.intentDoor === 0 ? -82 : 82);
        targetY = door.y + Math.sin(elapsed * (cat.behavior === "feint" ? 5.2 : 2.2)) * (cat.behavior === "feint" ? 38 : 14);
        if (cat.behavior === "sprint") desiredSpeed = lerp(190, 268, urge) * stage.cat;
        else if (cat.behavior === "feint") desiredSpeed = lerp(125, 206, urge) * stage.cat;
        else desiredSpeed = lerp(82, 154, urge) * stage.cat;
      }

      if (cat.sprintTimer <= 0) {
        cat.behavior = "wander";
        cat.intentDoor = -1;
        cat.decisionTimer = 0.55 + Math.random() * 0.8;
        chooseWanderTarget();
      }
    } else if (eventDoor >= 0 && eventTelegraph > 0) {
      targetX = eventDoor === 0 ? room.left + 72 : room.right - 72;
      targetY = doors[eventDoor].y;
      desiredSpeed = 84 * stage.cat;
    }
  }

  const playerDistance = dist(player, cat);
  if (playerDistance < 116 && openDoors.length) {
    const awayX = cat.x - player.x;
    const awayY = cat.y - player.y;
    const len = Math.hypot(awayX, awayY) || 1;
    const juke = cat.behavior === "feint" || cat.behavior === "sprint" ? (cat.intentDoor === 0 ? -1 : 1) : 0;
    targetX = cat.x + awayX / len * 120 + (-awayY / len) * 75 * juke;
    targetY = cat.y + awayY / len * 120 + (awayX / len) * 75 * juke;
    desiredSpeed *= cat.behavior === "sprint" ? 1.20 : 1.10;
  }

  const dx = targetX - cat.x;
  const dy = targetY - cat.y;
  const len = Math.hypot(dx, dy) || 1;
  const desiredVX = dx / len * desiredSpeed;
  const desiredVY = dy / len * desiredSpeed;
  const response = 1 - Math.exp(-dt * (3.0 + stage.cat + (cat.behavior === "sprint" ? 2.0 : 0)));
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
  cat.behavior = "balcony";
  cat.intentDoor = index;
  rescueTimer = currentStage().rescue;
  curiosity = 100;
  composure = Math.max(0, composure - 9);
  flash = 1;
  shake = 9;
  soundWarning();
  showToast("Cat on the balcony — get close and press E!", 2.4);
}

function updateClimate(dt) {
  const openCount = doors.filter((door, index) => door.open && door.anim > 0.72 && doorPassable(index)).length;
  const passableCount = doors.filter((door, index) => doorPassable(index)).length;
  const stage = currentStage();
  let rate;
  if (openCount === 0) rate = 0.225 * stage.heat;
  else if (openCount === 1) rate = 0.1125 * stage.heat;
  else rate = -0.34 / Math.sqrt(stage.heat);
  temperature = clamp(temperature + rate * dt, 15.5, 35.5);

  const catMultiplier = cat.state === "balcony" ? 0 : 1;
  if (passableCount === 0) curiosity -= 17 * dt;
  else curiosity += (passableCount === 1 ? 7.0 : 12.0) * stage.curiosity * dt * catMultiplier;
  if (cat.behavior === "sprint") curiosity += 1.6 * dt;
  curiosity = clamp(curiosity, 0, 100);

  if (temperature > 29) composure -= (temperature - 29) * .20 * dt;
  if (temperature >= 35) endGame(false, "The temperature reached 35°C before the room could cool down.");
}

function triggerDistraction() {
  const stage = currentStage();
  const kinds = [
    { name: "birds", text: "Birds land on the railing", boost: 18, tone: 560 },
    { name: "scooter", text: "A scooter backfires below", boost: 22, tone: 210 },
    { name: "knock", text: "A sharp knock echoes through the flat", boost: 16, tone: 145 },
    { name: "curtain", text: "The curtain snaps in the breeze", boost: 20, tone: 430 },
  ];
  const event = kinds[Math.floor(Math.random() * kinds.length)];
  eventDoor = Math.random() < 0.5 ? 0 : 1;
  eventKind = event.name;
  eventTelegraph = 2.8 + Math.random() * 1.8;
  curiosity = clamp(curiosity + event.boost + stageIndex * 2.5, 0, 100);
  cat.decisionTimer = Math.min(cat.decisionTimer, 0.35 + Math.random() * 0.35);
  const side = eventDoor === 0 ? "west" : "east";
  showToast(`${event.text} near the ${side} balcony`, 1.8);
  tone(event.tone, .08, event.name === "scooter" ? "square" : "triangle", .018, event.name === "birds" ? 110 : -30);
}

function updateProgress(dt) {
  elapsed += dt;
  stageElapsed += dt;
  score += dt * (7 + composure * .035);
  const stage = currentStage();

  distractionTimer -= dt;
  eventTelegraph = Math.max(0, eventTelegraph - dt);
  if (eventTelegraph === 0) {
    eventDoor = -1;
    eventKind = "";
  }
  if (distractionTimer <= 0 && cat.state === "room") {
    triggerDistraction();
    distractionTimer = stage.eventMin + Math.random() * (stage.eventMax - stage.eventMin);
  }

  if (stageElapsed >= stage.seconds) {
    if (stageIndex >= stages.length - 1) {
      endGame(true);
      return;
    }
    stageIndex += 1;
    stageElapsed = 0;
    catGrace = 1.7;
    cat.behavior = "wander";
    cat.intentDoor = -1;
    cat.decisionTimer = 0.8;
    distractionTimer = currentStage().eventMin * 0.7;
    eventDoor = -1;
    eventTelegraph = 0;
    flash = .65;
    soundStage();
    showToast(`Stage ${stageIndex + 1}: ${currentStage().name}`, 2.2);
  }
}

function updateDoors(dt) {
  doors.forEach(door => {
    const target = door.open ? 1 : 0;
    const rate = door.open ? 8.5 : 4.4;
    door.anim = lerp(door.anim, target, 1 - Math.exp(-dt * rate));
  });
}

function update(dt) {
  updateDoors(dt);
  if (mode !== "playing") return;

  calmCooldown = Math.max(0, calmCooldown - dt);
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
