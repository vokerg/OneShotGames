import {
  ICE_WALL_RADIUS,
  SUN_PERIOD_SECONDS,
  clamp,
  environmentAt,
} from "./physics.mjs";
import { createArtSystem } from "./art.mjs";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const art = createArtSystem();

const ui = {
  heat: document.querySelector("#heatValue"),
  battery: document.querySelector("#batteryValue"),
  temperature: document.querySelector("#temperatureValue"),
  time: document.querySelector("#timeValue"),
  mission: document.querySelector("#missionValue"),
  daylight: document.querySelector("#daylightValue"),
  wind: document.querySelector("#windValue"),
  star: document.querySelector("#starValue"),
  lane: document.querySelector("#laneValue"),
  prompt: document.querySelector("#prompt"),
  log: document.querySelector("#log"),
  stationList: document.querySelector("#stationList"),
  objective: document.querySelector("#objectiveText"),
  startOverlay: document.querySelector("#startOverlay"),
  startButton: document.querySelector("#startButton"),
  endingOverlay: document.querySelector("#endingOverlay"),
  endingTitle: document.querySelector("#endingTitle"),
  endingText: document.querySelector("#endingText"),
  endingChoices: document.querySelector("#endingChoices"),
  restartButton: document.querySelector("#restartButton"),
};

const STATION_BLUEPRINTS = [
  {
    id: "solar",
    name: "I · Solar Ephemeris",
    note: "Wake it inside the moving gold light.",
    x: 0.13,
    y: -0.34,
    condition: (env) => env.daylight >= 0.43,
    blocked: "HELIOGRAPH DARK // bring the moving Sun footprint over this station.",
    log: "SOLAR EPHEMERIS // online. Local noon is moving across the Disc exactly where the old tables said it would.",
  },
  {
    id: "stars",
    name: "II · Firmament Sextant",
    note: "The star plate only resolves in local night.",
    x: -0.49,
    y: 0.31,
    condition: (env) => env.daylight <= 0.34,
    blocked: "SEXTANT SUN-BLIND // wait for the local daylight island to move away.",
    log: "FIRMAMENT SEXTANT // online. The entire star plate turns around the central pole as one mechanism.",
  },
  {
    id: "rim",
    name: "III · Wall Anemometer",
    note: "Deep rim belt. Keep at least 20% charge.",
    x: 0.63,
    y: 0.47,
    condition: (env, player) => env.edgePressure >= 0.46 && player.battery >= 20,
    blocked: "RIM SERVOS STARVED // 20% battery reserve required this close to the Wall.",
    log: "WALL ANEMOMETER // online. The cold flow is radial and outward; the rim is trying to throw the sledge away from the map.",
  },
];

const OBSERVATORY = { x: -0.74, y: -0.49, name: "Rim Observatory" };
const keys = new Set();
let state = createState();
let lastFrame = performance.now();
let viewport = { width: 960, height: 720, dpr: 1, cx: 480, cy: 360, scale: 285 };

function createState() {
  return {
    running: false,
    finished: false,
    elapsed: 0,
    missionRemaining: 330,
    starLock: 0,
    starCooldown: 0,
    interactProgress: 0,
    activeTargetId: null,
    wallWarningCooldown: 0,
    moving: false,
    overdrive: false,
    player: {
      x: 0.02,
      y: -0.08,
      heat: 68,
      battery: 76,
      heading: -Math.PI / 2,
    },
    stations: STATION_BLUEPRINTS.map((station) => ({ ...station, online: false })),
    messages: [],
  };
}

function model() {
  return {
    elapsed: state.elapsed,
    starLock: state.starLock,
    interactProgress: state.interactProgress,
    moving: state.moving,
    overdrive: state.overdrive,
    player: state.player,
    stations: state.stations,
    observatory: OBSERVATORY,
    viewport,
  };
}

function resetGame({ keepBriefing = false } = {}) {
  state = createState();
  keys.clear();
  ui.endingOverlay.classList.remove("open");
  ui.endingOverlay.setAttribute("aria-hidden", "true");
  ui.endingChoices.classList.remove("hidden");
  ui.restartButton.classList.add("hidden");
  ui.endingTitle.textContent = "The Last Meridian is awake.";
  ui.endingText.textContent = "";
  if (!keepBriefing) ui.startOverlay.classList.add("open");
  renderStationList();
  addLog("FIELD TERMINAL // cold boot. Three stations are dark beyond the pole.");
  updateHud(environmentAt(state.player.x, state.player.y, state.elapsed, 0));
}

function startGame() {
  ui.startOverlay.classList.remove("open");
  state.running = true;
  state.finished = false;
  lastFrame = performance.now();
  addLog("EXPEDITION CLOCK // running. Chase light for power; steal distance from the frozen dark.");
  canvas.focus();
}

function addLog(message) {
  const minutes = Math.floor(state.elapsed / 60).toString().padStart(2, "0");
  const seconds = Math.floor(state.elapsed % 60).toString().padStart(2, "0");
  state.messages.unshift({ stamp: `${minutes}:${seconds}`, message });
  state.messages = state.messages.slice(0, 7);
  ui.log.innerHTML = state.messages
    .map((entry) => `<p><time>${entry.stamp}</time>${escapeHtml(entry.message)}</p>`)
    .join("");
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderStationList() {
  ui.stationList.innerHTML = state.stations.map((station, index) => `
    <li class="${station.online ? "online" : ""}" style="--station-index:${index}">
      <div class="station-index">0${index + 1}</div>
      <div class="station-copy">
        <b>${station.name}</b>
        <small>${station.online ? "LINK STABLE // ONLINE" : station.note}</small>
      </div>
    </li>
  `).join("");
}

function handleKeyDown(event) {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
  const key = event.key.toLowerCase();
  keys.add(key);

  if (key === "r") {
    resetGame({ keepBriefing: true });
    startGame();
    return;
  }

  if (event.code === "Space" && !event.repeat && state.running) takeStarFix();
}

function handleKeyUp(event) {
  keys.delete(event.key.toLowerCase());
}

function takeStarFix() {
  const env = environmentAt(state.player.x, state.player.y, state.elapsed, state.starLock);
  if (state.starCooldown > 0) {
    addLog(`SEXTANT // cooling ${state.starCooldown.toFixed(0)}s.`);
    return;
  }
  if (env.daylight > 0.36) {
    addLog("SEXTANT // star plate lost in local glare. Drive into night.");
    return;
  }

  state.starLock = 10;
  state.starCooldown = 17;
  addLog("POLARIS LOCK // bearing solved. Rim drift compensation engaged for 10 seconds.");
  document.body.classList.add("star-locked");
  window.setTimeout(() => document.body.classList.remove("star-locked"), 850);
}

function update(dt) {
  if (!state.running || state.finished) {
    state.moving = false;
    state.overdrive = false;
    art.update(dt, model());
    return;
  }

  state.elapsed += dt;
  state.missionRemaining -= dt;
  state.starLock = Math.max(0, state.starLock - dt);
  state.starCooldown = Math.max(0, state.starCooldown - dt);
  state.wallWarningCooldown = Math.max(0, state.wallWarningCooldown - dt);

  const player = state.player;
  let env = environmentAt(player.x, player.y, state.elapsed, state.starLock);
  let inputX = 0;
  let inputY = 0;
  if (keys.has("a") || keys.has("arrowleft")) inputX -= 1;
  if (keys.has("d") || keys.has("arrowright")) inputX += 1;
  if (keys.has("w") || keys.has("arrowup")) inputY -= 1;
  if (keys.has("s") || keys.has("arrowdown")) inputY += 1;

  const inputLength = Math.hypot(inputX, inputY);
  state.moving = inputLength > 0;
  if (state.moving) {
    inputX /= inputLength;
    inputY /= inputLength;
    player.heading = Math.atan2(inputY, inputX);
  }

  state.overdrive = keys.has("shift") && state.moving && player.battery > 4;
  const powerFactor = player.battery <= 0.2 ? 0.42 : 1;
  const moveSpeed = 0.155 * (state.overdrive ? 1.52 : 1) * env.lane.speedFactor * powerFactor;

  player.x += (inputX * moveSpeed + env.wind.x) * dt;
  player.y += (inputY * moveSpeed + env.wind.y) * dt;

  const radius = Math.hypot(player.x, player.y);
  if (radius > ICE_WALL_RADIUS - 0.022) {
    const safeRadius = ICE_WALL_RADIUS - 0.023;
    player.x = (player.x / radius) * safeRadius;
    player.y = (player.y / radius) * safeRadius;
    player.heat -= 8.5 * dt;
    if (state.wallWarningCooldown <= 0) {
      addLog("ICE WALL // contact. Katabatic flow is stripping heat from the hull.");
      state.wallWarningCooldown = 2.5;
      document.body.classList.add("wall-hit");
      window.setTimeout(() => document.body.classList.remove("wall-hit"), 420);
    }
  }

  env = environmentAt(player.x, player.y, state.elapsed, state.starLock);
  const driveDrain = state.moving ? (state.overdrive ? 2.7 : 1.25) : 0.12;
  const solarGain = Math.max(0, env.daylight - 0.28) * 5.2;
  player.battery = clamp(player.battery + (solarGain - driveDrain) * dt, 0, 100);

  let heatRate = env.temperature >= 0
    ? 0.32 + env.temperature * 0.018
    : env.temperature * 0.031;
  if (player.battery <= 0.2) heatRate -= 0.42;
  if (!state.moving && env.edgePressure < 0.45) heatRate += 0.08;
  player.heat = clamp(player.heat + heatRate * dt, 0, 100);

  updateInteraction(dt, env);
  updateHud(env);
  art.update(dt, model());

  if (player.heat <= 0) {
    failMission("COLD-SOAKED", "The sledge loses its last thermal margin. Controls disappear beneath frost while the moving daylight island continues without you.");
  } else if (state.missionRemaining <= 0) {
    failMission("SUN TRACK LOST", "The correction window closes. Across the Disc, settlement clocks continue to count down against a Sun that no longer arrives on schedule.");
  }
}

function updateInteraction(dt, env) {
  const player = state.player;
  const nearbyStation = state.stations
    .filter((station) => !station.online)
    .find((station) => Math.hypot(player.x - station.x, player.y - station.y) < 0.075);
  const allOnline = state.stations.every((station) => station.online);
  const nearObservatory = allOnline && Math.hypot(player.x - OBSERVATORY.x, player.y - OBSERVATORY.y) < 0.086;
  const targetId = nearbyStation?.id ?? (nearObservatory ? "observatory" : null);

  if (targetId !== state.activeTargetId) {
    state.interactProgress = 0;
    state.activeTargetId = targetId;
  }

  let prompt = "";
  let canInteract = false;
  if (nearbyStation) {
    canInteract = nearbyStation.condition(env, player);
    if (canInteract) {
      const pct = Math.round(state.interactProgress * 100);
      prompt = `HOLD E // SERVICE ${nearbyStation.name.toUpperCase()}${state.interactProgress > 0 ? ` // ${pct}%` : ""}`;
    } else prompt = nearbyStation.blocked;
  } else if (nearObservatory) {
    canInteract = true;
    const pct = Math.round(state.interactProgress * 100);
    prompt = `HOLD E // ENTER RIM OBSERVATORY${state.interactProgress > 0 ? ` // ${pct}%` : ""}`;
  } else if (allOnline) {
    prompt = state.starLock > 0
      ? "POLARIS LOCKED // TRUE BEARING TO RIM OBSERVATORY DRAWN"
      : "MERIDIAN CHAIN ONLINE // REACH THE RIM OBSERVATORY";
  }

  if (targetId && canInteract && keys.has("e")) {
    state.interactProgress = clamp(state.interactProgress + dt / 1.15);
    if (state.interactProgress >= 1) {
      if (nearbyStation) activateStation(nearbyStation);
      else openEndingChoice();
      state.interactProgress = 0;
      state.activeTargetId = null;
    }
  } else {
    state.interactProgress = Math.max(0, state.interactProgress - dt * 1.5);
  }

  ui.prompt.textContent = prompt;
  ui.prompt.classList.toggle("visible", Boolean(prompt));
}

function activateStation(station) {
  station.online = true;
  state.player.battery = clamp(state.player.battery + 9, 0, 100);
  state.player.heat = clamp(state.player.heat + 7, 0, 100);
  addLog(station.log);
  renderStationList();
  document.body.classList.add("station-online");
  window.setTimeout(() => document.body.classList.remove("station-online"), 720);

  const onlineCount = state.stations.filter((item) => item.online).length;
  if (onlineCount === state.stations.length) {
    ui.objective.textContent = "Meridian chain restored. The Rim Observatory has lit its forbidden outer bearing.";
    addLog("CHAIN SYNCHRONIZED // a second azimuth appears in the maintenance cipher: OUTWARD, beyond the Ice Wall.");
  } else {
    ui.objective.textContent = `${onlineCount}/3 stations online. Read the moving light, frozen lanes, and turning stars to reach the rest.`;
  }
}

function openEndingChoice() {
  state.running = false;
  state.finished = true;
  ui.endingOverlay.classList.add("open");
  ui.endingOverlay.setAttribute("aria-hidden", "false");
  ui.endingTitle.textContent = "The Last Meridian is awake.";
  ui.endingText.textContent = "Every inward instrument agrees: central pole, circling Sun, turning firmament, encircling ice. But the restored observatory has one final bearing engraved into a rail that was never meant to move.";
  ui.endingChoices.classList.remove("hidden");
  ui.restartButton.classList.add("hidden");
}

function chooseEnding(kind) {
  ui.endingChoices.classList.add("hidden");
  ui.restartButton.classList.remove("hidden");
  if (kind === "stabilize") {
    ui.endingTitle.textContent = "MERIDIAN STABLE";
    ui.endingText.textContent = "The lens turns inward. The low Sun resumes its prescribed circle and one settlement after another warms gold beneath it. The Directorate stamps your chart: DISC CONSISTENT.";
  } else {
    ui.endingTitle.textContent = "OUTWARD BEARING";
    ui.endingText.textContent = "The lens clears the white rim. Seven seconds later, something beyond every approved range table returns the beam. The terminal prints a line no Directorate survey manual contains: NEXT SURVEY AUTHORIZED BY NOBODY.";
  }
}

function failMission(title, text) {
  state.running = false;
  state.finished = true;
  ui.endingOverlay.classList.add("open");
  ui.endingOverlay.setAttribute("aria-hidden", "false");
  ui.endingTitle.textContent = title;
  ui.endingText.textContent = text;
  ui.endingChoices.classList.add("hidden");
  ui.restartButton.classList.remove("hidden");
}

function updateHud(env) {
  const player = state.player;
  ui.heat.textContent = `${Math.round(player.heat)}%`;
  ui.battery.textContent = `${Math.round(player.battery)}%`;
  ui.temperature.textContent = `${Math.round(env.temperature)}°`;

  const clockHours = (6 + ((state.elapsed % SUN_PERIOD_SECONDS) / SUN_PERIOD_SECONDS) * 24) % 24;
  const hours = Math.floor(clockHours).toString().padStart(2, "0");
  const minutes = Math.floor((clockHours % 1) * 60).toString().padStart(2, "0");
  ui.time.textContent = `${hours}:${minutes}`;

  if (ui.mission) {
    const remaining = Math.max(0, state.missionRemaining);
    const m = Math.floor(remaining / 60).toString().padStart(2, "0");
    const s = Math.floor(remaining % 60).toString().padStart(2, "0");
    ui.mission.textContent = `${m}:${s}`;
  }

  const lightLabel = env.daylight > 0.58 ? "DAY" : env.daylight > 0.28 ? "TWILIGHT" : "NIGHT";
  ui.daylight.textContent = `${lightLabel} // ${Math.round(env.daylight * 100)}%`;
  ui.wind.textContent = `${(env.wind.strength * 310).toFixed(1)} kt${env.edgePressure > 0.62 ? " // RIM" : ""}`;
  ui.star.textContent = state.starLock > 0
    ? `LOCKED // ${state.starLock.toFixed(1)}s`
    : env.daylight <= 0.36
      ? (state.starCooldown > 0 ? `COOLDOWN // ${state.starCooldown.toFixed(0)}s` : "AVAILABLE // SPACE")
      : "SUN BLIND";
  ui.lane.textContent = env.lane.inLane
    ? (env.lane.frozen ? "FROZEN // +28%" : env.daylight > 0.56 ? "SLUSH // −28%" : "THAWING // −10%")
    : "FIRM GROUND";

  ui.heat.closest("div")?.style.setProperty("--meter", `${player.heat}%`);
  ui.battery.closest("div")?.style.setProperty("--meter", `${player.battery}%`);
  ui.heat.classList.toggle("critical", player.heat < 28);
  ui.battery.classList.toggle("critical", player.battery < 22);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, rect.width);
  const height = Math.max(420, rect.height);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewport = {
    width,
    height,
    dpr,
    cx: width * 0.5,
    cy: height * 0.51,
    scale: Math.min(width, height) * 0.435,
  };
}

function draw() {
  resizeCanvas();
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  art.render(ctx, model());
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

ui.startButton.addEventListener("click", startGame);
ui.restartButton.addEventListener("click", () => {
  resetGame({ keepBriefing: true });
  startGame();
});
ui.endingChoices.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-ending]");
  if (button) chooseEnding(button.dataset.ending);
});
window.addEventListener("keydown", handleKeyDown, { passive: false });
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", draw);

resetGame({ keepBriefing: false });
requestAnimationFrame(frame);
