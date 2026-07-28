"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = {
  tempValue: document.getElementById("temp-value"),
  tempFill: document.getElementById("temp-fill"),
  airflow: document.getElementById("airflow-label"),
  stageNumber: document.getElementById("stage-number"),
  stageTitle: document.getElementById("stage-title"),
  stageDetail: document.getElementById("stage-detail"),
  curiosityLabel: document.getElementById("curiosity-label"),
  curiosityFill: document.getElementById("curiosity-fill"),
  clock: document.getElementById("clock"),
  score: document.getElementById("score"),
  prompt: document.getElementById("prompt"),
  promptText: document.getElementById("prompt-text"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayCopy: document.getElementById("overlay-copy"),
  rules: document.getElementById("rules"),
  start: document.getElementById("start"),
  fineprint: document.getElementById("fineprint"),
  toast: document.getElementById("toast"),
  sound: document.getElementById("sound"),
};

const W = canvas.width;
const H = canvas.height;
const room = { left: 238, right: 1058, top: 142, bottom: 718 };
const doors = [
  { side: "left", x: room.left, y: 326, open: false, anim: 0, balcony: { left: 38, right: room.left, top: 246, bottom: 522 } },
  { side: "right", x: room.right, y: 326, open: false, anim: 0, balcony: { left: room.right, right: 1258, top: 246, bottom: 522 } },
];
const doorHalf = 72;

const stages = [
  {
    name: "Quiet Afternoon",
    detail: "The cat now watches your habits. Calm it before opening both doors.",
    seconds: 40,
    heat: 1.00,
    cat: 0.98,
    curiosity: 0.90,
    rescue: 7.8,
    eventMin: 10.0,
    eventMax: 14.0,
    sprintChance: 0.24,
    switchChance: 0.10,
    escapeThreshold: 54,
  },
  {
    name: "Warm Spell",
    detail: "Birds and hallway sounds can pull the cat toward either balcony.",
    seconds: 40,
    heat: 1.18,
    cat: 1.10,
    curiosity: 1.08,
    rescue: 6.9,
    eventMin: 7.5,
    eventMax: 11.0,
    sprintChance: 0.40,
    switchChance: 0.23,
    escapeThreshold: 48,
  },
  {
    name: "Street Noise",
    detail: "The cat starts feinting, changing direction, and slipping through closing doors.",
    seconds: 40,
    heat: 1.32,
    cat: 1.24,
    curiosity: 1.28,
    rescue: 5.9,
    eventMin: 5.7,
    eventMax: 8.8,
    sprintChance: 0.58,
    switchChance: 0.42,
    escapeThreshold: 42,
  },
  {
    name: "Sunset Rush",
    detail: "Rapid distractions and double-backs make every cooling cycle a gamble.",
    seconds: 44,
    heat: 1.48,
    cat: 1.40,
    curiosity: 1.52,
    rescue: 4.9,
    eventMin: 4.2,
    eventMax: 6.8,
    sprintChance: 0.76,
    switchChance: 0.62,
    escapeThreshold: 36,
  },
];
const totalDuration = stages.reduce((sum, stage) => sum + stage.seconds, 0);

const keys = new Set();
let pressed = new Set();
let mode = "title";
let last = performance.now();
let elapsed = 0;
let stageIndex = 0;
let stageElapsed = 0;
let temperature = 22;
let curiosity = 0;
let rescues = 0;
let composure = 100;
let score = 0;
let flash = 0;
let shake = 0;
let toastTimer = 0;
let distractionTimer = 10;
let eventDoor = -1;
let eventKind = "";
let eventTelegraph = 0;
let catGrace = 3;
let rescueTimer = 0;
let calmCooldown = 0;
let muted = false;
let audioCtx = null;

const player = { x: W / 2, y: 590, r: 20, vx: 0, vy: 0, facing: 0 };
const cat = {
  x: W / 2 + 80,
  y: 430,
  r: 16,
  vx: 0,
  vy: 0,
  facing: Math.PI,
  state: "room",
  balcony: -1,
  wander: 0,
  targetX: W / 2,
  targetY: 380,
  tail: 0,
  behavior: "wander",
  intentDoor: -1,
  decisionTimer: 0,
  sprintTimer: 0,
  switchTimer: 0,
  switchUsed: false,
};
const dust = Array.from({ length: 44 }, (_, i) => ({
  x: (i * 83.71) % W,
  y: 100 + ((i * 137.19) % 600),
  r: 0.6 + (i % 4) * 0.35,
  drift: 5 + (i % 7) * 1.2,
  phase: i * 0.77,
}));
const leaves = Array.from({ length: 10 }, (_, i) => ({ phase: i * 0.63, side: i % 2 }));

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function ease(t) { return t * t * (3 - 2 * t); }
function currentStage() { return stages[Math.min(stageIndex, stages.length - 1)]; }

function roundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
