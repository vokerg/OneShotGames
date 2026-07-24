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
  { name: "Quiet Afternoon", detail: "Learn the rhythm: cool the room, then secure the doors.", seconds: 38, heat: 1.00, cat: 0.92, curiosity: 0.82, rescue: 8.4 },
  { name: "Warm Spell", detail: "The sun reaches the windows. Heat builds faster.", seconds: 38, heat: 1.18, cat: 1.06, curiosity: 1.00, rescue: 7.2 },
  { name: "Street Noise", detail: "Sudden sounds make the cat dash for fresh air.", seconds: 38, heat: 1.30, cat: 1.19, curiosity: 1.20, rescue: 6.2 },
  { name: "Sunset Rush", detail: "Both temperature and curiosity now change quickly.", seconds: 42, heat: 1.45, cat: 1.34, curiosity: 1.42, rescue: 5.3 },
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
let distractionTimer = 12;
let catGrace = 3;
let rescueTimer = 0;
let muted = false;
let audioCtx = null;

const player = { x: W / 2, y: 590, r: 20, vx: 0, vy: 0, facing: 0 };
const cat = { x: W / 2 + 80, y: 430, r: 16, vx: 0, vy: 0, facing: Math.PI, state: "room", balcony: -1, wander: 0, targetX: W / 2, targetY: 380, tail: 0 };
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
