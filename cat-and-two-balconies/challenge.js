"use strict";

// Extra pressure systems layered on top of the original cooling/escape loop.
// Keeping them here makes the harder rules easy to tune without destabilizing
// the base movement, door, rescue, and climate code.
const sofa = { left: 440, right: 858, top: 161, bottom: 287, approachY: 300 };
const fridge = { x: 937, y: 610, radius: 76 };
const challengeTuning = [
  { escapeThreshold: 46, temptation: 3.8, scratchMin: 14.0, scratchMax: 18.0, scratchRate: 7.5, shrimpRestock: 24, fedSeconds: 10.0 },
  { escapeThreshold: 41, temptation: 5.2, scratchMin: 11.0, scratchMax: 15.0, scratchRate: 9.5, shrimpRestock: 22, fedSeconds: 9.5 },
  { escapeThreshold: 35, temptation: 6.8, scratchMin: 8.5, scratchMax: 12.0, scratchRate: 12.5, shrimpRestock: 20, fedSeconds: 9.0 },
  { escapeThreshold: 30, temptation: 8.2, scratchMin: 6.5, scratchMax: 9.5, scratchRate: 15.5, shrimpRestock: 18, fedSeconds: 8.5 },
];

stages.forEach((stage, index) => {
  const tuning = challengeTuning[index];
  stage.escapeThreshold = Math.min(stage.escapeThreshold, tuning.escapeThreshold);
  Object.assign(stage, tuning);
});

let sofaDamage = 0;
let scratchTimer = 12;
let sofaTargetX = 650;
let shrimpAvailable = true;
let shrimpCarried = false;
let shrimpRespawn = 0;
let fedTimer = 0;
let shooCooldown = 0;
let challengeSwitchCooldown = 0;
let scratchSfxTimer = 0;
let challengeStageSeen = 0;

function sofaIntegrity() {
  return clamp(100 - sofaDamage, 0, 100);
}

function nextScratchDelay(stage = currentStage()) {
  return stage.scratchMin + Math.random() * (stage.scratchMax - stage.scratchMin);
}

function chooseSofaTarget() {
  sofaTargetX = sofa.left + 58 + Math.random() * (sofa.right - sofa.left - 116);
}

function resetChallengeState() {
  sofaDamage = 0;
  scratchTimer = 11.5;
  sofaTargetX = 650;
  shrimpAvailable = true;
  shrimpCarried = false;
  shrimpRespawn = 0;
  fedTimer = 0;
  shooCooldown = 0;
  challengeSwitchCooldown = 0;
  scratchSfxTimer = 0;
  challengeStageSeen = 0;
}

function startSofaRun() {
  if (mode !== "playing" || cat.state !== "room" || cat.behavior !== "wander" || fedTimer > 0) return false;
  chooseSofaTarget();
  cat.behavior = "sofaRun";
  cat.intentDoor = -1;
  cat.sprintTimer = 7.5;
  cat.decisionTimer = 1.0;
  cat.switchUsed = false;
  scratchSfxTimer = 0;
  showToast("Claws out — the cat is heading for the sofa!", 1.9);
  tone(265, .08, "square", .018, 55);
  return true;
}

function updateChallengeTimers(dt) {
  fedTimer = Math.max(0, fedTimer - dt);
  shooCooldown = Math.max(0, shooCooldown - dt);
  challengeSwitchCooldown = Math.max(0, challengeSwitchCooldown - dt);

  if (!shrimpAvailable && !shrimpCarried && shrimpRespawn > 0) {
    shrimpRespawn = Math.max(0, shrimpRespawn - dt);
    if (shrimpRespawn === 0) {
      shrimpAvailable = true;
      showToast("The fridge has another shrimp ready.", 1.5);
      tone(560, .07, "sine", .018, 90);
    }
  }

  if (challengeStageSeen !== stageIndex) {
    challengeStageSeen = stageIndex;
    scratchTimer = Math.min(scratchTimer, currentStage().scratchMin * 0.72);
  }

  if (cat.state !== "room" || fedTimer > 0 || cat.behavior === "sofaRun" || cat.behavior === "scratch") return;

  scratchTimer -= dt;
  if (scratchTimer <= 0 && catGrace <= 0 && cat.behavior === "wander") {
    if (!startSofaRun()) scratchTimer = 1.0;
  }
}

const baseUpdate = update;
update = function updateWithChallenge(dt) {
  if (mode === "playing") updateChallengeTimers(dt);
  baseUpdate(dt);
};

const baseUpdateClimate = updateClimate;
updateClimate = function updateClimateWithChallenge(dt) {
  const beforeCuriosity = curiosity;
  baseUpdateClimate(dt);
  if (mode !== "playing" || cat.state !== "room") return;

  const passableCount = doors.filter((door, index) => doorPassable(index)).length;
  const stage = currentStage();
  if (fedTimer > 0) {
    if (curiosity > beforeCuriosity) curiosity = beforeCuriosity + (curiosity - beforeCuriosity) * 0.30;
    curiosity = Math.max(0, curiosity - 4.2 * dt);
  } else if (passableCount > 0) {
    const crossBreezePressure = passableCount > 1 ? 1.28 : 1;
    curiosity = clamp(curiosity + stage.temptation * crossBreezePressure * dt, 0, 100);
  }
};

const baseChooseEscapeDoor = chooseEscapeDoor;
chooseEscapeDoor = function chooseEscapeDoorAwayFromHuman(openDoors, stage) {
  if (openDoors.length < 2 || eventDoor >= 0 && openDoors.includes(eventDoor) && eventTelegraph > 0 && Math.random() < 0.64) {
    return baseChooseEscapeDoor(openDoors, stage);
  }

  const ranked = openDoors.map(index => {
    const p = doorCenter(doors[index]);
    const playerClearance = Math.hypot(player.x - p.x, player.y - p.y);
    const catTravel = Math.hypot(cat.x - p.x, cat.y - p.y);
    return { index, score: playerClearance * 1.15 - catTravel * 0.32 + Math.random() * 55 };
  }).sort((a, b) => b.score - a.score);

  return Math.random() < 0.78 ? ranked[0].index : baseChooseEscapeDoor(openDoors, stage);
};

function updateSofaCat(dt) {
  const stage = currentStage();
  cat.tail += dt * (5 + Math.hypot(cat.vx, cat.vy) * .02);
  catGrace = Math.max(0, catGrace - dt);
  cat.decisionTimer = Math.max(0, cat.decisionTimer - dt);
  cat.sprintTimer = Math.max(0, cat.sprintTimer - dt);
  cat.switchTimer = Math.max(0, cat.switchTimer - dt);

  const openDoors = doors.map((door, i) => doorPassable(i) ? i : -1).filter(i => i >= 0);
  if (openDoors.length && fedTimer <= 0 && curiosity >= stage.escapeThreshold + 7) {
    cat.behavior = "wander";
    scratchTimer = Math.max(3.0, stage.scratchMin * .45);
    startCatRun(openDoors);
    return false;
  }

  if (cat.behavior === "scratch") {
    cat.vx *= Math.exp(-dt * 12);
    cat.vy *= Math.exp(-dt * 12);
    cat.x = lerp(cat.x, sofaTargetX, 1 - Math.exp(-dt * 5));
    cat.y = lerp(cat.y, sofa.approachY, 1 - Math.exp(-dt * 5));
    sofaDamage = clamp(sofaDamage + stage.scratchRate * dt, 0, 100);
    composure = Math.max(0, composure - .72 * dt);
    score = Math.max(0, score - 5.5 * dt);
    scratchSfxTimer -= dt;
    if (scratchSfxTimer <= 0) {
      scratchSfxTimer = .52 + Math.random() * .18;
      tone(135 + Math.random() * 30, .055, "sawtooth", .012, -25);
    }
    if (sofaDamage >= 100) endGame(false, "The sofa was shredded beyond saving.");
    return true;
  }

  let targetX = sofaTargetX;
  let targetY = sofa.approachY;
  let desiredSpeed = 112 * stage.cat;
  const playerDistance = dist(player, cat);

  if (playerDistance < 132) {
    const awayX = cat.x - player.x;
    const awayY = cat.y - player.y;
    const awayLen = Math.hypot(awayX, awayY) || 1;
    const toSofaX = targetX - cat.x;
    const toSofaY = targetY - cat.y;
    const sofaLen = Math.hypot(toSofaX, toSofaY) || 1;
    const side = Math.sign(toSofaX * awayY - toSofaY * awayX) || 1;
    targetX = cat.x + toSofaX / sofaLen * 120 + awayX / awayLen * 74 + (-toSofaY / sofaLen) * 45 * side;
    targetY = cat.y + toSofaY / sofaLen * 120 + awayY / awayLen * 74 + (toSofaX / sofaLen) * 45 * side;
    desiredSpeed *= 1.22;
  }

  const dx = targetX - cat.x;
  const dy = targetY - cat.y;
  const len = Math.hypot(dx, dy) || 1;
  const response = 1 - Math.exp(-dt * (4.4 + stage.cat));
  cat.vx = lerp(cat.vx, dx / len * desiredSpeed, response);
  cat.vy = lerp(cat.vy, dy / len * desiredSpeed, response);
  cat.x += cat.vx * dt;
  cat.y += cat.vy * dt;
  if (Math.hypot(cat.vx, cat.vy) > 5) cat.facing = Math.atan2(cat.vy, cat.vx);
  constrainEntity(cat, true);

  if (Math.hypot(cat.x - sofaTargetX, cat.y - sofa.approachY) < 31) {
    cat.behavior = "scratch";
    cat.vx *= .2;
    cat.vy *= .2;
    showToast("The sofa is taking damage — get close and press E!", 1.8);
    tone(155, .09, "sawtooth", .02, -45);
  }
  return true;
}

function smartEscapeDodge(dt, playerX, playerY) {
  if (cat.state !== "room" || cat.intentDoor < 0 || !doorPassable(cat.intentDoor)) return;
  const openDoors = doors.map((door, i) => doorPassable(i) ? i : -1).filter(i => i >= 0);
  const currentDoor = doors[cat.intentDoor];
  const currentCenter = doorCenter(currentDoor);
  const playerToDoor = Math.hypot(playerX - currentCenter.x, playerY - currentCenter.y);

  if (openDoors.length > 1 && playerToDoor < 112 && challengeSwitchCooldown <= 0) {
    const alternatives = openDoors.filter(index => index !== cat.intentDoor);
    if (alternatives.length) {
      const alternative = alternatives.sort((a, b) => {
        const pa = doorCenter(doors[a]);
        const pb = doorCenter(doors[b]);
        return Math.hypot(playerX - pb.x, playerY - pb.y) - Math.hypot(playerX - pa.x, playerY - pa.y);
      })[0];
      cat.intentDoor = alternative;
      cat.behavior = "sprint";
      cat.sprintTimer = Math.max(cat.sprintTimer, 1.35);
      cat.switchUsed = true;
      challengeSwitchCooldown = 1.45;
      showToast(`Blocked! The cat jukes toward the ${alternative === 0 ? "west" : "east"} balcony.`, 1.15);
      tone(410, .055, "triangle", .014, 70);
    }
  }

  const door = doors[cat.intentDoor];
  const targetX = door.x + (cat.intentDoor === 0 ? -86 : 86);
  const targetY = door.y;
  const directX = targetX - cat.x;
  const directY = targetY - cat.y;
  const directLen = Math.hypot(directX, directY) || 1;
  const awayX = cat.x - playerX;
  const awayY = cat.y - playerY;
  const awayLen = Math.hypot(awayX, awayY) || 1;
  const perpX = -directY / directLen;
  const perpY = directX / directLen;
  const side = Math.sign(perpX * awayX + perpY * awayY) || 1;
  const vx = directX / directLen + awayX / awayLen * .58 + perpX * side * .32;
  const vy = directY / directLen + awayY / awayLen * .58 + perpY * side * .32;
  const len = Math.hypot(vx, vy) || 1;
  const stage = currentStage();
  const burst = (cat.behavior === "sprint" ? 82 : cat.behavior === "feint" ? 62 : 44) * stage.cat;

  cat.x += vx / len * burst * dt;
  cat.y += vy / len * burst * dt;
  cat.vx += vx / len * burst * .28;
  cat.vy += vy / len * burst * .28;
  constrainEntity(cat, true);
  if (cat.x < room.left - 10) enterBalcony(0);
  else if (cat.x > room.right + 10) enterBalcony(1);
}

const baseUpdateCat = updateCat;
updateCat = function updateCatWithChallenge(dt) {
  if (cat.state === "room" && (cat.behavior === "sofaRun" || cat.behavior === "scratch")) {
    if (updateSofaCat(dt)) return;
  }

  const escapeBehavior = cat.state === "room" && cat.intentDoor >= 0 && ["sprint", "feint", "stalk"].includes(cat.behavior);
  const playerDistance = escapeBehavior ? dist(player, cat) : Infinity;
  let savedPlayer = null;
  if (playerDistance < 176) {
    savedPlayer = { x: player.x, y: player.y };
    player.x = W + 4000;
    player.y = H + 4000;
  }

  baseUpdateCat(dt);

  if (savedPlayer) {
    player.x = savedPlayer.x;
    player.y = savedPlayer.y;
    if (mode === "playing") smartEscapeDodge(dt, savedPlayer.x, savedPlayer.y);
  }
};

function challengeTarget() {
  if (mode !== "playing") return null;
  if (cat.state === "room") {
    const catDistance = dist(player, cat);
    if (shrimpCarried && catDistance < 88) return { type: "feed", distance: catDistance };
    if ((cat.behavior === "sofaRun" || cat.behavior === "scratch") && catDistance < 82 && shooCooldown <= 0) {
      return { type: "shoo", distance: catDistance };
    }
  }

  const fridgeDistance = Math.hypot(player.x - fridge.x, player.y - fridge.y);
  if (fridgeDistance < fridge.radius && !shrimpCarried) {
    if (shrimpAvailable) return { type: "fridge", distance: fridgeDistance };
    if (shrimpRespawn > 0) return { type: "fridgeEmpty", distance: fridgeDistance };
  }
  return null;
}

function shooFromSofa() {
  const awayX = cat.x - player.x;
  const awayY = cat.y - player.y;
  const len = Math.hypot(awayX, awayY) || 1;
  cat.behavior = "wander";
  cat.intentDoor = -1;
  cat.switchUsed = false;
  cat.decisionTimer = .8;
  cat.sprintTimer = 0;
  catGrace = .9;
  cat.vx = awayX / len * 185;
  cat.vy = awayY / len * 185;
  cat.targetX = clamp(cat.x + awayX / len * 170, room.left + 80, room.right - 80);
  cat.targetY = clamp(cat.y + awayY / len * 170, room.top + 95, room.bottom - 85);
  cat.wander = 1.5;
  scratchTimer = nextScratchDelay();
  shooCooldown = 1.2;
  composure = clamp(composure + 1.5, 0, 100);
  score += 85;
  tone(350, .07, "square", .018, -80);
  showToast("Shoo! The cat abandons the sofa for now.", 1.55);
}

function feedShrimp() {
  const stage = currentStage();
  shrimpCarried = false;
  shrimpRespawn = stage.shrimpRestock;
  fedTimer = stage.fedSeconds;
  curiosity = Math.max(0, curiosity - 58);
  composure = clamp(composure + 8, 0, 100);
  score += 220;
  cat.behavior = "wander";
  cat.intentDoor = -1;
  cat.decisionTimer = 1.1;
  cat.sprintTimer = 0;
  cat.switchUsed = false;
  catGrace = 2.4;
  cat.vx *= .2;
  cat.vy *= .2;
  chooseWanderTarget();
  scratchTimer = Math.max(nextScratchDelay(stage), stage.scratchMax + 2.5);
  tone(620, .09, "sine", .025, 110);
  setTimeout(() => tone(790, .08, "triangle", .018, 70), 70);
  showToast(`Shrimp truce — ${stage.fedSeconds.toFixed(0)} seconds of calmer behavior.`, 1.9);
}

const baseInteract = interact;
interact = function interactWithChallenge() {
  if (mode !== "playing") return;
  const target = challengeTarget();
  if (!target) {
    baseInteract();
    return;
  }

  initAudio();
  if (target.type === "feed") {
    feedShrimp();
  } else if (target.type === "shoo") {
    shooFromSofa();
  } else if (target.type === "fridge") {
    shrimpAvailable = false;
    shrimpCarried = true;
    score += 20;
    tone(490, .07, "triangle", .018, 60);
    showToast("Shrimp acquired — get close to the cat and press E.", 1.7);
  } else if (target.type === "fridgeEmpty") {
    showToast(`No shrimp yet — restocking in ${Math.ceil(shrimpRespawn)}s.`, 1.2);
    tone(180, .05, "square", .012, -25);
  }
};

const baseResetGame = resetGame;
resetGame = function resetGameWithChallenge() {
  resetChallengeState();
  baseResetGame();
};

const baseEndGame = endGame;
endGame = function endGameWithChallenge(win, reason = "") {
  baseEndGame(win, reason);
  if (!win && reason.toLowerCase().includes("sofa")) ui.overlayTitle.textContent = "The sofa lost the battle";
  const sofaNote = ` Sofa integrity: ${Math.round(sofaIntegrity())}%.`;
  if (!ui.overlayCopy.textContent.includes("Sofa integrity:")) ui.overlayCopy.textContent += sofaNote;
};

const baseUpdateUI = updateUI;
updateUI = function updateUIWithChallenge() {
  baseUpdateUI();

  const integrity = sofaIntegrity();
  const shrimpStatus = shrimpCarried
    ? "shrimp in hand"
    : shrimpAvailable
      ? "shrimp ready"
      : `shrimp ${Math.ceil(shrimpRespawn)}s`;
  ui.score.textContent = `${rescues} ${rescues === 1 ? "rescue" : "rescues"} · ${Math.round(composure)}% calm · sofa ${Math.round(integrity)}% · ${shrimpStatus}`;
  ui.score.style.color = integrity < 35 ? "#ff9b86" : "";

  if (cat.state === "room" && cat.behavior === "scratch") {
    ui.stageDetail.textContent = "The cat is shredding the sofa — get close and press E to shoo it away.";
    ui.curiosityLabel.textContent = "Sofa integrity";
    ui.curiosityFill.style.width = `${integrity}%`;
    ui.curiosityFill.style.background = integrity > 55
      ? "linear-gradient(90deg, #7ee29a, #f2d07a)"
      : "linear-gradient(90deg, #ffcf70, #ff5f6d)";
  } else if (cat.state === "room" && cat.behavior === "sofaRun") {
    ui.stageDetail.textContent = "The cat is making for the sofa. Cut it off before the claws start.";
  } else if (cat.state === "room" && fedTimer > 0) {
    ui.stageDetail.textContent = `Shrimp truce: ${fedTimer.toFixed(1)}s. Curiosity builds slower and sofa attacks are suppressed.`;
  } else if (cat.state !== "balcony") {
    ui.curiosityFill.style.background = "linear-gradient(90deg, #f2d07a, #ff755f)";
  }

  const target = challengeTarget();
  if (mode === "playing" && target) {
    ui.prompt.classList.add("visible");
    if (target.type === "feed") ui.promptText.textContent = "Give the cat the shrimp";
    else if (target.type === "shoo") ui.promptText.textContent = cat.behavior === "scratch" ? "Shoo the cat off the sofa" : "Intercept the sofa run";
    else if (target.type === "fridge") ui.promptText.textContent = "Take a shrimp from the fridge";
    else ui.promptText.textContent = `Fridge restocking · ${Math.ceil(shrimpRespawn)}s`;
  }
};

function drawShrimpIcon(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#f08d78";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 10, -.85, 2.25);
  ctx.stroke();
  ctx.fillStyle = "#ffd1bd";
  ctx.beginPath();
  ctx.arc(7, -7, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f08d78";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 7); ctx.lineTo(-14, 12);
  ctx.moveTo(-7, 8); ctx.lineTo(-10, 15);
  ctx.stroke();
  ctx.restore();
}

const baseDrawRoom = drawRoom;
drawRoom = function drawRoomWithChallenge() {
  baseDrawRoom();

  // Turn the existing cabinet into a readable mini-fridge.
  ctx.save();
  ctx.fillStyle = "#c8d0cf";
  roundedRect(878, 563, 118, 94, 12); ctx.fill();
  ctx.fillStyle = "#aeb9ba";
  roundedRect(884, 569, 106, 37, 8); ctx.fill();
  ctx.strokeStyle = "rgba(39,54,61,.35)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(884, 612); ctx.lineTo(990, 612); ctx.stroke();
  ctx.strokeStyle = "#526169";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(974, 578); ctx.lineTo(974, 598); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(974, 620); ctx.lineTo(974, 645); ctx.stroke();
  ctx.fillStyle = "#42525b";
  ctx.font = "800 9px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("FRIDGE", 919, 591);
  if (shrimpAvailable) drawShrimpIcon(947, 588, .62);
  else if (shrimpRespawn > 0) {
    ctx.fillStyle = "#607078";
    ctx.font = "800 11px system-ui";
    ctx.fillText(`${Math.ceil(shrimpRespawn)}s`, 943, 637);
  }

  // Accumulating claw marks make sofa damage visible in the room itself.
  const marks = Math.floor(sofaDamage / 6.5);
  ctx.strokeStyle = "rgba(64,35,39,.72)";
  ctx.lineWidth = 2;
  for (let i = 0; i < marks; i++) {
    const x = sofa.left + 36 + (i * 47) % (sofa.right - sofa.left - 72);
    const y = sofa.top + 28 + (i * 31) % 76;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 11, y + 20);
    ctx.moveTo(x + 7, y - 2);
    ctx.lineTo(x + 18, y + 18);
    ctx.stroke();
  }
  if (sofaDamage > 0) {
    const integrity = sofaIntegrity();
    ctx.fillStyle = "rgba(18,25,42,.82)";
    roundedRect(535, 137, 228, 13, 7); ctx.fill();
    ctx.fillStyle = integrity > 55 ? "#7ee29a" : integrity > 25 ? "#ffcf70" : "#ff6b6b";
    roundedRect(538, 140, 222 * integrity / 100, 7, 4); ctx.fill();
  }
  ctx.restore();
};

const baseDrawPlayer = drawPlayer;
drawPlayer = function drawPlayerWithShrimp() {
  baseDrawPlayer();
  if (!shrimpCarried) return;
  drawShrimpIcon(player.x + 24, player.y - 27, .72);
};

const baseDrawCat = drawCat;
drawCat = function drawCatWithClaws() {
  baseDrawCat();
  if (cat.state !== "room" || cat.behavior !== "scratch") return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,226,194,.88)";
  ctx.lineWidth = 2;
  const swipe = Math.sin(elapsed * 18) * 5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cat.x + 18 + i * 4, cat.y - 4 + swipe);
    ctx.lineTo(cat.x + 34 + i * 4, cat.y - 18 + swipe);
    ctx.stroke();
  }
  ctx.restore();
};
