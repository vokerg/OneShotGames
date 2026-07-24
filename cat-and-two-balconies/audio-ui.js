"use strict";

function initAudio() {
  if (audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) audioCtx = new AudioContext();
}

function tone(freq, duration = 0.09, type = "sine", volume = 0.045, slide = 0) {
  if (muted) return;
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function soundDoor(open) {
  tone(open ? 330 : 220, 0.11, "triangle", 0.035, open ? 80 : -40);
  setTimeout(() => tone(open ? 440 : 160, 0.07, "sine", 0.022), 55);
}
function soundRescue() { tone(520, .12, "triangle", .045, 130); setTimeout(() => tone(760, .14, "sine", .035), 90); }
function soundWarning() { tone(190, .14, "sawtooth", .035, -35); }
function soundStage() { tone(392, .12, "triangle", .03, 60); setTimeout(() => tone(523, .14, "triangle", .03, 80), 110); }
function soundLose() { tone(210, .22, "sawtooth", .045, -90); setTimeout(() => tone(120, .35, "triangle", .04, -40), 150); }

function showToast(text, seconds = 1.7) {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  toastTimer = seconds;
}

function resetGame() {
  elapsed = 0;
  stageIndex = 0;
  stageElapsed = 0;
  temperature = 22;
  curiosity = 0;
  rescues = 0;
  composure = 100;
  score = 0;
  flash = 0;
  shake = 0;
  distractionTimer = 10;
  eventDoor = -1;
  eventKind = "";
  eventTelegraph = 0;
  catGrace = 3.5;
  rescueTimer = 0;
  calmCooldown = 0;
  player.x = W / 2;
  player.y = 590;
  player.vx = player.vy = 0;
  cat.x = W / 2 + 82;
  cat.y = 430;
  cat.vx = cat.vy = 0;
  cat.state = "room";
  cat.balcony = -1;
  cat.wander = 0;
  cat.behavior = "wander";
  cat.intentDoor = -1;
  cat.decisionTimer = 0;
  cat.sprintTimer = 0;
  cat.switchTimer = 0;
  cat.switchUsed = false;
  doors.forEach(d => { d.open = false; d.anim = 0; });
  ui.overlay.classList.add("hidden");
  mode = "playing";
  last = performance.now();
  showToast("Keep it cool. Keep the cat inside.", 2.2);
  updateUI();
}

function endGame(win, reason = "") {
  mode = win ? "won" : "lost";
  if (win) {
    tone(523, .13, "triangle", .04, 120);
    setTimeout(() => tone(659, .13, "triangle", .04, 130), 120);
    setTimeout(() => tone(784, .25, "sine", .045, 70), 250);
    ui.overlayTitle.textContent = "Everyone made it to sunset";
    ui.overlayCopy.textContent = `The apartment stayed manageable, the cat stayed home, and you completed ${rescues} ${rescues === 1 ? "rescue" : "rescues"}. Final score: ${Math.round(score).toLocaleString()}.`;
    ui.start.textContent = "Play another afternoon";
  } else {
    soundLose();
    ui.overlayTitle.textContent = reason.includes("cat") ? "The cat took the shortcut" : "The apartment overheated";
    ui.overlayCopy.textContent = reason + ` You reached stage ${stageIndex + 1} with ${rescues} ${rescues === 1 ? "rescue" : "rescues"}.`;
    ui.start.textContent = "Try again";
  }
  ui.rules.style.display = "none";
  ui.fineprint.textContent = "Press R or use the button to restart";
  ui.overlay.classList.remove("hidden");
}

function togglePause() {
  if (mode === "playing") {
    mode = "paused";
    ui.overlayTitle.textContent = "Paused";
    ui.overlayCopy.textContent = "The temperature and the cat will wait. Take a breath.";
    ui.rules.style.display = "none";
    ui.start.textContent = "Continue";
    ui.fineprint.textContent = "Press P or Escape to continue";
    ui.overlay.classList.remove("hidden");
  } else if (mode === "paused") {
    mode = "playing";
    ui.overlay.classList.add("hidden");
    last = performance.now();
  }
}

function doorCenter(door) { return { x: door.x + (door.side === "left" ? 12 : -12), y: door.y }; }

function nearestInteractable() {
  const catDistance = dist(player, cat);
  if (cat.state === "balcony" && catDistance < 62) return { type: "cat", distance: catDistance };
  if (cat.state === "room" && catDistance < 66 && calmCooldown <= 0 && (curiosity > 16 || cat.behavior !== "wander")) {
    return { type: "calm", distance: catDistance };
  }
  let best = null;
  doors.forEach((door, index) => {
    const p = doorCenter(door);
    const d = Math.hypot(player.x - p.x, player.y - p.y);
    if (d < 70 && (!best || d < best.distance)) best = { type: "door", index, distance: d };
  });
  return best;
}

function interact() {
  if (mode !== "playing") return;
  initAudio();
  const target = nearestInteractable();
  if (!target) return;

  if (target.type === "cat") {
    rescues += 1;
    score += 500 + Math.max(0, rescueTimer) * 45;
    composure = clamp(composure + 7, 0, 100);
    curiosity = Math.max(0, curiosity - 45);
    cat.state = "room";
    cat.balcony = -1;
    cat.x = W / 2 + (Math.random() - .5) * 110;
    cat.y = 420 + Math.random() * 80;
    cat.vx = cat.vy = 0;
    cat.behavior = "wander";
    cat.intentDoor = -1;
    cat.switchUsed = false;
    catGrace = 3.4;
    rescueTimer = 0;
    soundRescue();
    showToast("Cat recovered — curiosity reduced", 1.9);
    return;
  }

  if (target.type === "calm") {
    const interrupted = cat.behavior !== "wander";
    curiosity = Math.max(0, curiosity - (interrupted ? 34 : 26));
    composure = clamp(composure + 2, 0, 100);
    score += interrupted ? 90 : 45;
    cat.behavior = "wander";
    cat.intentDoor = -1;
    cat.decisionTimer = 1.0;
    cat.sprintTimer = 0;
    cat.switchUsed = false;
    catGrace = 1.25;
    calmCooldown = 3.2;
    cat.vx *= 0.25;
    cat.vy *= 0.25;
    chooseWanderTarget();
    tone(610, .09, "sine", .025, 80);
    showToast(interrupted ? "Dash interrupted — the cat settles briefly" : "The cat settles, but only for a moment", 1.7);
    return;
  }

  const door = doors[target.index];
  door.open = !door.open;
  soundDoor(door.open);
  const side = target.index === 0 ? "West" : "East";
  const catCommitted = !door.open && cat.state === "room" && cat.intentDoor === target.index && cat.behavior !== "wander" && door.anim > 0.34;
  if (catCommitted) {
    showToast(`${side} door is closing — the cat may still slip through!`, 1.5);
    tone(175, .08, "sawtooth", .02, -25);
  } else {
    showToast(`${side} balcony ${door.open ? "opened" : "closing"}`, 1.2);
  }
}

function updateUI() {
  const openCount = doors.filter(d => d.open).length;
  ui.tempValue.textContent = `${temperature.toFixed(1)}°C`;
  const tempPct = clamp((temperature - 15.5) / 19.5 * 100, 0, 100);
  ui.tempFill.style.width = `${tempPct}%`;
  if (temperature < 19) ui.tempFill.style.background = "linear-gradient(90deg, #70d7ff, #9cecff)";
  else if (temperature < 28) ui.tempFill.style.background = "linear-gradient(90deg, #72d9e8, #7ee29a)";
  else if (temperature < 33) ui.tempFill.style.background = "linear-gradient(90deg, #ffcf70, #ff9e55)";
  else ui.tempFill.style.background = "linear-gradient(90deg, #ff9e55, #ff5f6d)";

  ui.airflow.textContent = openCount === 0
    ? "Both doors closed · heat rising"
    : openCount === 1
      ? "One door open · heat rising slowly"
      : "Cross-breeze · apartment cooling";

  ui.stageNumber.textContent = `Stage ${stageIndex + 1} of ${stages.length}`;
  ui.stageTitle.textContent = currentStage().name;
  ui.stageDetail.textContent = cat.state === "balcony"
    ? `Rescue the cat in ${Math.max(0, rescueTimer).toFixed(1)} seconds.`
    : cat.behavior === "sprint"
      ? `The cat is sprinting toward the ${cat.intentDoor === 0 ? "west" : "east"} balcony — intercept or close it early.`
      : cat.behavior === "feint"
        ? "The cat is feinting. It may reverse direction without warning."
        : cat.behavior === "stalk"
          ? `The cat is stalking the ${cat.intentDoor === 0 ? "west" : "east"} balcony.`
          : eventDoor >= 0 && eventTelegraph > 0
            ? `${eventKind === "birds" ? "Birds" : "A distraction"} are drawing attention to the ${eventDoor === 0 ? "west" : "east"} side.`
            : curiosity > 70
              ? "The cat is primed to bolt. Calm it before committing to a cross-breeze."
              : currentStage().detail;
  if (cat.state === "balcony") {
    ui.curiosityLabel.textContent = "Rescue time";
    ui.curiosityFill.style.width = `${clamp(rescueTimer / currentStage().rescue * 100, 0, 100)}%`;
  } else {
    ui.curiosityLabel.textContent = "Cat curiosity";
    ui.curiosityFill.style.width = `${curiosity}%`;
  }

  const remaining = Math.max(0, totalDuration - elapsed);
  const min = Math.floor(remaining / 60);
  const sec = Math.floor(remaining % 60).toString().padStart(2, "0");
  ui.clock.textContent = `${min.toString().padStart(2, "0")}:${sec}`;
  ui.score.textContent = `${rescues} ${rescues === 1 ? "rescue" : "rescues"} · ${Math.round(composure)}% composure`;

  const target = nearestInteractable();
  if (mode === "playing" && target) {
    ui.prompt.classList.add("visible");
    if (target.type === "cat") ui.promptText.textContent = `Bring the cat inside · ${Math.max(0, rescueTimer).toFixed(1)}s`;
    else if (target.type === "calm") ui.promptText.textContent = cat.behavior === "wander" ? "Calm the cat" : "Intercept and calm the cat";
    else ui.promptText.textContent = `${doors[target.index].open ? "Close" : "Open"} the ${target.index === 0 ? "west" : "east"} balcony`;
  } else {
    ui.prompt.classList.remove("visible");
  }
}
