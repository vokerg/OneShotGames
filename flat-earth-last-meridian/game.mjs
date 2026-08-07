import {
  DAYLIGHT_RADIUS,
  ICE_WALL_RADIUS,
  SUN_PERIOD_SECONDS,
  TAU,
  clamp,
  environmentAt,
  firmamentRotation,
  sunPosition,
} from "./physics.mjs";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  heat: document.querySelector("#heatValue"),
  battery: document.querySelector("#batteryValue"),
  temperature: document.querySelector("#temperatureValue"),
  time: document.querySelector("#timeValue"),
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
    note: "Needs the moving daylight footprint.",
    x: 0.13,
    y: -0.34,
    condition: (env) => env.daylight >= 0.43,
    blocked: "The heliograph is dark. Bring the moving Sun footprint over this station.",
    log: "Solar Ephemeris online. The gnomons agree: daylight is local, and the useful power follows the low Sun around the Disc.",
  },
  {
    id: "stars",
    name: "II · Firmament Sextant",
    note: "Needs darkness and visible stars.",
    x: -0.49,
    y: 0.31,
    condition: (env) => env.daylight <= 0.34,
    blocked: "Too much glare for the sextant. Return after the Sun's local light has moved on.",
    log: "Firmament Sextant online. The star plate turns around the central pole exactly as the old survey tables predict.",
  },
  {
    id: "rim",
    name: "III · Wall Anemometer",
    note: "At the outer cold belt; keep charge in reserve.",
    x: 0.63,
    y: 0.47,
    condition: (env, player) => env.edgePressure >= 0.46 && player.battery >= 20,
    blocked: "The rim servos need 20% battery reserve. Catch the Sun before attempting the Wall instrument.",
    log: "Wall Anemometer online. The cold flow is radial and outward; every kilometre toward the Ice Wall makes the return harder.",
  },
];

const OBSERVATORY = { x: -0.74, y: -0.49, name: "Rim Observatory" };
const keys = new Set();
const stars = makeStars(150);
let lastFrame = performance.now();
let viewport = { width: 960, height: 720, dpr: 1, cx: 480, cy: 360, scale: 285 };
let state = createState();

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
    wallWarningReady: true,
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
  addLog("Field terminal reset. Three dark stations remain on the Disc.");
  updateHud(environmentAt(state.player.x, state.player.y, state.elapsed, 0));
}

function startGame() {
  ui.startOverlay.classList.remove("open");
  state.running = true;
  state.finished = false;
  lastFrame = performance.now();
  addLog("Expedition clock started. Stay with the light when you need charge; use the dark when you need hard ice.");
  canvas.focus?.();
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
  ui.stationList.innerHTML = state.stations.map((station) => `
    <li class="${station.online ? "online" : ""}">
      <span></span>
      <div><b>${station.name}</b><small>${station.online ? "ONLINE" : station.note}</small></div>
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
    addLog(`Sextant cooling down: ${state.starCooldown.toFixed(0)} seconds.`);
    return;
  }
  if (env.daylight > 0.36) {
    addLog("Star fix failed: the nearby Sun washes the firmament out here. Move into local night.");
    return;
  }

  state.starLock = 10;
  state.starCooldown = 17;
  addLog("Polaris locked. Firmament rotation gives a clean radial bearing; rim-wind drift is reduced for 10 seconds.");
}

function update(dt) {
  if (!state.running || state.finished) return;

  state.elapsed += dt;
  state.missionRemaining -= dt;
  state.starLock = Math.max(0, state.starLock - dt);
  state.starCooldown = Math.max(0, state.starCooldown - dt);

  const player = state.player;
  let env = environmentAt(player.x, player.y, state.elapsed, state.starLock);
  let inputX = 0;
  let inputY = 0;
  if (keys.has("a") || keys.has("arrowleft")) inputX -= 1;
  if (keys.has("d") || keys.has("arrowright")) inputX += 1;
  if (keys.has("w") || keys.has("arrowup")) inputY -= 1;
  if (keys.has("s") || keys.has("arrowdown")) inputY += 1;

  const inputLength = Math.hypot(inputX, inputY);
  const moving = inputLength > 0;
  if (moving) {
    inputX /= inputLength;
    inputY /= inputLength;
    player.heading = Math.atan2(inputY, inputX);
  }

  const overdrive = keys.has("shift") && moving && player.battery > 4;
  const powerFactor = player.battery <= 0.2 ? 0.42 : 1;
  const moveSpeed = 0.155 * (overdrive ? 1.52 : 1) * env.lane.speedFactor * powerFactor;

  player.x += (inputX * moveSpeed + env.wind.x) * dt;
  player.y += (inputY * moveSpeed + env.wind.y) * dt;

  const radius = Math.hypot(player.x, player.y);
  if (radius > ICE_WALL_RADIUS - 0.022) {
    const safeRadius = ICE_WALL_RADIUS - 0.023;
    player.x = (player.x / radius) * safeRadius;
    player.y = (player.y / radius) * safeRadius;
    player.heat -= 8.5 * dt;
    if (state.wallWarningReady) {
      addLog("ICE WALL CONTACT. The outer shelf is impassable; katabatic flow is stripping heat from the sledge.");
      state.wallWarningReady = false;
      window.setTimeout(() => { state.wallWarningReady = true; }, 2500);
    }
  }

  env = environmentAt(player.x, player.y, state.elapsed, state.starLock);

  const driveDrain = moving ? (overdrive ? 2.7 : 1.25) : 0.12;
  const solarGain = Math.max(0, env.daylight - 0.28) * 5.2;
  player.battery = clamp(player.battery + (solarGain - driveDrain) * dt, 0, 100);

  let heatRate;
  if (env.temperature >= 0) heatRate = 0.32 + env.temperature * 0.018;
  else heatRate = env.temperature * 0.031;
  if (player.battery <= 0.2) heatRate -= 0.42;
  if (!moving && env.edgePressure < 0.45) heatRate += 0.08;
  player.heat = clamp(player.heat + heatRate * dt, 0, 100);

  updateInteraction(dt, env);
  updateHud(env);

  if (player.heat <= 0) {
    failMission("Cold-soaked", "The sledge loses heat and the controls lock under frost. On the Disc, darkness is a place you can drive into — but not live in forever.");
  } else if (state.missionRemaining <= 0) {
    failMission("Sun Track lost", "The observatory clock rolls past the safe correction window. The moving daylight island slips off the settlement schedule before the meridian chain is restored.");
  }
}

function updateInteraction(dt, env) {
  const player = state.player;
  const pendingStations = state.stations.filter((station) => !station.online);
  const nearbyStation = pendingStations.find((station) => Math.hypot(player.x - station.x, player.y - station.y) < 0.075);
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
      prompt = `Hold E · service ${nearbyStation.name}${state.interactProgress > 0 ? ` · ${pct}%` : ""}`;
    } else {
      prompt = nearbyStation.blocked;
    }
  } else if (nearObservatory) {
    canInteract = true;
    const pct = Math.round(state.interactProgress * 100);
    prompt = `Hold E · enter Rim Observatory${state.interactProgress > 0 ? ` · ${pct}%` : ""}`;
  } else if (allOnline) {
    prompt = state.starLock > 0 ? "Firmament fix active · true bearing to Rim Observatory is drawn." : "All stations online · reach the Rim Observatory.";
  }

  if (targetId && canInteract && keys.has("e")) {
    state.interactProgress = clamp(state.interactProgress + dt / 1.15);
    if (state.interactProgress >= 1) {
      if (nearbyStation) activateStation(nearbyStation);
      else if (nearObservatory) openEndingChoice();
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

  const onlineCount = state.stations.filter((item) => item.online).length;
  if (onlineCount === state.stations.length) {
    ui.objective.textContent = "Meridian chain restored. Reach the Rim Observatory and choose what the final lens will face.";
    addLog("Three-station chain synchronized. A forbidden second bearing appears in the maintenance cipher: OUTWARD, beyond the Ice Wall.");
  } else {
    ui.objective.textContent = `${onlineCount}/3 stations online. Read the light, ice, and firmament to reach the rest.`;
  }
}

function openEndingChoice() {
  state.running = false;
  state.finished = true;
  ui.endingOverlay.classList.add("open");
  ui.endingOverlay.setAttribute("aria-hidden", "false");
  ui.endingTitle.textContent = "The Last Meridian is awake.";
  ui.endingText.textContent = "Every inward lens reports a stable Disc: central pole, circling Sun, rotating firmament, encircling ice. But Surveyor Vale left one unused azimuth engraved into the outer rail. You have enough power for one final command.";
  ui.endingChoices.classList.remove("hidden");
  ui.restartButton.classList.add("hidden");
}

function chooseEnding(kind) {
  ui.endingChoices.classList.add("hidden");
  ui.restartButton.classList.remove("hidden");
  if (kind === "stabilize") {
    ui.endingTitle.textContent = "MERIDIAN STABLE";
    ui.endingText.textContent = "You turn the lens inward. The low Sun resumes its prescribed circle, warm districts light one after another, and the Wall stations report falling wind. The Directorate stamps your chart: DISC CONSISTENT. For tonight, the world remains measurable.";
  } else {
    ui.endingTitle.textContent = "OUTWARD BEARING";
    ui.endingText.textContent = "You turn the lens across the Ice Wall. The beam leaves the mapped Disc and travels farther than any approved range table allows. For seven seconds, something beyond the white rim reflects it back — not a curve, not another shore, but a second moving light under the same turning stars. The terminal prints one line: NEXT SURVEY AUTHORIZED BY NOBODY.";
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

  const lightLabel = env.daylight > 0.58 ? "DAY" : env.daylight > 0.28 ? "TWILIGHT" : "NIGHT";
  ui.daylight.textContent = `${lightLabel} · ${Math.round(env.daylight * 100)}%`;
  ui.wind.textContent = `${(env.wind.strength * 310).toFixed(1)} kt ${env.edgePressure > 0.62 ? "RIM" : ""}`.trim();
  ui.star.textContent = state.starLock > 0
    ? `LOCKED · ${state.starLock.toFixed(1)}s`
    : env.daylight <= 0.36
      ? (state.starCooldown > 0 ? `COOLDOWN · ${state.starCooldown.toFixed(0)}s` : "AVAILABLE · SPACE")
      : "SUN BLIND";
  ui.lane.textContent = env.lane.inLane
    ? (env.lane.frozen ? "FROZEN · +28%" : env.daylight > 0.56 ? "SLUSH · −28%" : "THAWING · −10%")
    : "FIRM GROUND";

  ui.heat.style.color = player.heat < 28 ? "var(--danger)" : "";
  ui.battery.style.color = player.battery < 22 ? "var(--danger)" : "";
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
    cy: height * 0.5,
    scale: Math.min(width, height) * 0.445,
  };
}

function worldToScreen(x, y) {
  return {
    x: viewport.cx + x * viewport.scale,
    y: viewport.cy + y * viewport.scale,
  };
}

function draw() {
  resizeCanvas();
  const { width, height, cx, cy, scale } = viewport;
  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createRadialGradient(cx, cy, scale * 0.1, cx, cy, scale * 1.4);
  bg.addColorStop(0, "#102830");
  bg.addColorStop(1, "#02090d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, scale * ICE_WALL_RADIUS, 0, TAU);
  ctx.clip();
  drawDisc();
  drawFirmament();
  drawSunlight();
  drawSurveyLanes();
  drawMapGrid();
  ctx.restore();

  drawSunTrack();
  drawIceWall();
  drawStations();
  drawObservatory();
  drawNavigationFix();
  drawPlayer();
  drawMapLabels();
}

function drawDisc() {
  const { cx, cy, scale } = viewport;
  ctx.fillStyle = "#0a222a";
  ctx.beginPath();
  ctx.arc(cx, cy, scale * ICE_WALL_RADIUS, 0, TAU);
  ctx.fill();

  const land = [
    [-0.12, -0.35, 0.48, 0.19, -0.22],
    [0.34, 0.12, 0.29, 0.18, 0.4],
    [-0.43, 0.25, 0.25, 0.15, -0.55],
    [0.12, 0.54, 0.31, 0.11, 0.12],
  ];
  for (const [x, y, rx, ry, rot] of land) {
    const point = worldToScreen(x, y);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(77, 111, 93, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * scale, ry * scale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawFirmament() {
  const rotation = firmamentRotation(state.elapsed);
  for (const star of stars) {
    const angle = star.angle + rotation;
    const x = Math.cos(angle) * star.radius;
    const y = Math.sin(angle) * star.radius;
    const env = environmentAt(x, y, state.elapsed, 0);
    const alpha = clamp((0.46 - env.daylight) * 2.6, 0, 0.72) * star.alpha;
    if (alpha <= 0.015) continue;
    const point = worldToScreen(x, y);
    ctx.fillStyle = `rgba(207, 235, 238, ${alpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, star.size, 0, TAU);
    ctx.fill();
  }
}

function drawSunlight() {
  const sun = sunPosition(state.elapsed);
  const point = worldToScreen(sun.x, sun.y);
  const radius = DAYLIGHT_RADIUS * viewport.scale;
  const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, "rgba(255, 210, 104, 0.38)");
  gradient.addColorStop(0.42, "rgba(235, 174, 78, 0.18)");
  gradient.addColorStop(1, "rgba(235, 174, 78, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
}

function drawSurveyLanes() {
  for (let k = 0; k < 6; k += 1) {
    const angle = (k * Math.PI - 0.45) / 3;
    const midX = Math.cos(angle) * 0.56;
    const midY = Math.sin(angle) * 0.56;
    const env = environmentAt(midX, midY, state.elapsed, 0);
    const start = worldToScreen(Math.cos(angle) * 0.33, Math.sin(angle) * 0.33);
    const end = worldToScreen(Math.cos(angle) * 0.82, Math.sin(angle) * 0.82);
    ctx.strokeStyle = env.daylight < 0.3 ? "rgba(151, 224, 235, 0.46)" : "rgba(80, 121, 126, 0.28)";
    ctx.lineWidth = env.daylight < 0.3 ? 5 : 7;
    ctx.setLineDash(env.daylight < 0.3 ? [9, 8] : [3, 11]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawMapGrid() {
  const { cx, cy, scale } = viewport;
  ctx.strokeStyle = "rgba(137, 187, 190, 0.12)";
  ctx.lineWidth = 1;
  for (const radius of [0.22, 0.44, 0.66, 0.88]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * scale, 0, TAU);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * scale * 0.94, cy + Math.sin(angle) * scale * 0.94);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(205, 231, 228, 0.7)";
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(205, 231, 228, 0.25)";
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, TAU);
  ctx.stroke();
}

function drawSunTrack() {
  const { cx, cy, scale } = viewport;
  ctx.strokeStyle = "rgba(255, 206, 106, 0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 7]);
  ctx.beginPath();
  ctx.arc(cx, cy, 0.46 * scale, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  const sun = sunPosition(state.elapsed);
  const point = worldToScreen(sun.x, sun.y);
  ctx.save();
  ctx.shadowColor = "rgba(255, 204, 94, 0.95)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffd36b";
  ctx.beginPath();
  ctx.arc(point.x, point.y, 8, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawIceWall() {
  const { cx, cy, scale } = viewport;
  ctx.strokeStyle = "rgba(142, 219, 232, 0.78)";
  ctx.lineWidth = Math.max(8, scale * 0.026);
  ctx.beginPath();
  ctx.arc(cx, cy, ICE_WALL_RADIUS * scale, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = "rgba(218, 247, 247, 0.34)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i += 1) {
    const angle = (i / 90) * TAU;
    const variation = 0.008 + ((i * 17) % 9) * 0.0015;
    const p1 = worldToScreen(Math.cos(angle) * (ICE_WALL_RADIUS - 0.01), Math.sin(angle) * (ICE_WALL_RADIUS - 0.01));
    const p2 = worldToScreen(Math.cos(angle) * (ICE_WALL_RADIUS - variation - 0.03), Math.sin(angle) * (ICE_WALL_RADIUS - variation - 0.03));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}

function drawStations() {
  for (const station of state.stations) {
    const point = worldToScreen(station.x, station.y);
    const pulse = 1 + Math.sin(state.elapsed * 4 + station.x * 9) * 0.1;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.strokeStyle = station.online ? "#85e09d" : "rgba(219, 240, 237, 0.85)";
    ctx.fillStyle = station.online ? "rgba(83, 171, 106, 0.18)" : "rgba(8, 22, 28, 0.8)";
    ctx.lineWidth = station.online ? 2 : 1;
    ctx.beginPath();
    ctx.rect(-8 * pulse, -8 * pulse, 16 * pulse, 16 * pulse);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(0, -23);
    ctx.stroke();
    if (station.online) {
      ctx.fillStyle = "#85e09d";
      ctx.beginPath();
      ctx.arc(0, -25, 2.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawObservatory() {
  const point = worldToScreen(OBSERVATORY.x, OBSERVATORY.y);
  const unlocked = state.stations.every((station) => station.online);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.strokeStyle = unlocked ? "#e3d6a3" : "rgba(116, 138, 137, 0.55)";
  ctx.fillStyle = unlocked ? "rgba(201, 174, 91, 0.11)" : "rgba(6, 15, 18, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 13, Math.PI, TAU);
  ctx.lineTo(13, 6);
  ctx.lineTo(-13, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(7, -25);
  ctx.stroke();
  ctx.restore();
}

function drawNavigationFix() {
  if (state.starLock <= 0) return;
  const player = worldToScreen(state.player.x, state.player.y);
  const targets = state.stations.filter((station) => !station.online);
  if (targets.length === 0) targets.push(OBSERVATORY);
  ctx.save();
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = "rgba(174, 227, 232, 0.4)";
  ctx.lineWidth = 1;
  for (const target of targets) {
    const point = worldToScreen(target.x, target.y);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer() {
  const player = state.player;
  const point = worldToScreen(player.x, player.y);
  const env = environmentAt(player.x, player.y, state.elapsed, state.starLock);

  ctx.strokeStyle = `rgba(8, 13, 14, ${0.3 + env.daylight * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(point.x + env.gnomon.x * (18 + (1 - env.daylight) * 8), point.y + env.gnomon.y * (18 + (1 - env.daylight) * 8));
  ctx.stroke();

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(player.heading + Math.PI / 2);
  ctx.fillStyle = "#d6e6df";
  ctx.strokeStyle = "#061015";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(7.5, 8);
  ctx.lineTo(0, 5);
  ctx.lineTo(-7.5, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = env.daylight > 0.45 ? "#d9ac50" : "#4d6f72";
  ctx.fillRect(-4, 1, 8, 3);
  ctx.restore();

  if (state.interactProgress > 0) {
    ctx.strokeStyle = "#dbeee9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 17, -Math.PI / 2, -Math.PI / 2 + state.interactProgress * TAU);
    ctx.stroke();
  }
}

function drawMapLabels() {
  ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(213, 233, 230, 0.68)";
  const pole = worldToScreen(0, 0);
  ctx.fillText("CENTRAL POLE", pole.x + 13, pole.y - 8);

  for (const station of state.stations) {
    const point = worldToScreen(station.x, station.y);
    ctx.fillStyle = station.online ? "rgba(133, 224, 157, 0.78)" : "rgba(213, 233, 230, 0.62)";
    ctx.fillText(station.name.replace(/^[IVX]+ · /, ""), point.x + 13, point.y + 1);
  }

  const obs = worldToScreen(OBSERVATORY.x, OBSERVATORY.y);
  ctx.fillStyle = state.stations.every((station) => station.online) ? "rgba(227, 214, 163, 0.82)" : "rgba(123, 143, 142, 0.56)";
  ctx.fillText("RIM OBSERVATORY", obs.x + 17, obs.y + 2);

  const wallLabel = worldToScreen(0.62, 0.74);
  ctx.fillStyle = "rgba(151, 219, 229, 0.56)";
  ctx.fillText("ICE WALL", wallLabel.x, wallLabel.y);
}

function makeStars(count) {
  let seed = 0x51f15e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => ({
    angle: random() * TAU,
    radius: 0.1 + Math.sqrt(random()) * 0.84,
    size: index % 13 === 0 ? 1.7 : 0.7 + random() * 0.8,
    alpha: 0.45 + random() * 0.55,
  }));
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
