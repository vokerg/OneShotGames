#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
require("./story-v2-core.js");
require("./story-v2-horizon.js");
require("./story-v2-endings.js");
const story = global.FE2_STORY_V2;
const engine = require("./logic-v2.js");

const errors = [];
const nodes = story.nodes || {};
const nodeIds = new Set(Object.keys(nodes));
const evidenceIds = new Set(Object.keys(story.evidence || {}));
const claimIds = new Set(Object.keys(story.claims || {}));
const grantedFlags = new Set();
const requiredFlags = new Set();

let quizCount = 0;
let puzzleCount = 0;
let endingCount = 0;
let campaignWords = 0;

function countWords(value) {
  if (typeof value === "string") {
    campaignWords += value.trim().split(/\s+/u).filter(Boolean).length;
    return;
  }
  if (Array.isArray(value)) return value.forEach(countWords);
  if (value && typeof value === "object") Object.values(value).forEach(countWords);
}
countWords(nodes);

function validateEffects(where, effects = {}) {
  for (const id of effects.evidence || []) if (!evidenceIds.has(id)) errors.push(`${where}: unknown evidence ${id}`);
  for (const id of effects.claims || []) if (!claimIds.has(id)) errors.push(`${where}: unknown claim ${id}`);
  for (const flag of effects.flags || []) grantedFlags.add(flag);
  for (const key of ["rigor", "heat", "trust", "tracks"]) {
    if (effects[key] != null && !Number.isFinite(Number(effects[key]))) errors.push(`${where}: ${key} not numeric`);
  }
}

function validateRequirements(where, req = {}) {
  for (const key of ["minTracks", "minEvidence", "minClaims", "minRigor", "minTrust", "maxHeat", "minIntroChecks"]) {
    if (req[key] != null && !Number.isFinite(Number(req[key]))) errors.push(`${where}: ${key} not numeric`);
  }
  for (const key of ["allFlags", "anyFlags", "notFlags"]) for (const flag of req[key] || []) requiredFlags.add(flag);
}


// Browser contract without a DOM dependency: required IDs and script order must match game-v2.js.
const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const requiredDomIds = ["terminal","output","visual","choices","puzzleForm","puzzleLabel","puzzleInput","puzzleHint","chapter","evidenceCount","claimCount","heat","rigor","trust","progress","saveState","journalBtn","evidenceBtn","claimBtn","mapBtn","helpBtn","modal","modalTitle","modalBody","modalClose"];
for (const id of requiredDomIds) if (!indexHtml.includes(`id="${id}"`)) errors.push(`index.html missing required DOM id #${id}`);
const requiredScripts = ["story-v2-core.js","story-v2-horizon.js","story-v2-endings.js","logic-v2.js","game-v2.js"];
let previousScriptOffset = -1;
for (const src of requiredScripts) {
  if (!fs.existsSync(path.join(__dirname, src))) errors.push(`missing browser asset ${src}`);
  const offset = indexHtml.indexOf(`src="${src}"`);
  if (offset < 0) errors.push(`index.html does not load ${src}`);
  if (offset >= 0 && offset < previousScriptOffset) errors.push(`script order is invalid around ${src}`);
  previousScriptOffset = Math.max(previousScriptOffset, offset);
}
if (!indexHtml.includes('href="style.css"') || !indexHtml.includes('href="v2.css"')) errors.push("index.html must load base and v2 stylesheets");

if (story.meta.totalEvidence !== evidenceIds.size) errors.push(`meta.totalEvidence=${story.meta.totalEvidence}, registry=${evidenceIds.size}`);
if (story.meta.totalClaims !== claimIds.size) errors.push(`meta.totalClaims=${story.meta.totalClaims}, registry=${claimIds.size}`);
if (nodeIds.size < 70) errors.push(`campaign too small: ${nodeIds.size} nodes`);
if (campaignWords < 7000) errors.push(`campaign text too small: ${campaignWords} words`);

for (const [id, node] of Object.entries(nodes)) {
  if (!node.title || !node.chapter) errors.push(`${id}: missing title/chapter`);
  if (!Array.isArray(node.lines) || !node.lines.length) errors.push(`${id}: missing lines`);
  if (node.ending) endingCount += 1;

  for (const choice of node.choices || []) {
    if (!choice.label) errors.push(`${id}: choice missing label`);
    if (!nodeIds.has(choice.next)) errors.push(`${id}: choice -> missing ${choice.next}`);
    validateEffects(`${id}:choice`, choice.effects);
    validateRequirements(`${id}:choice`, choice.requires);
  }

  if (node.puzzle) {
    puzzleCount += 1;
    const puzzle = node.puzzle;
    if (!["text", "numeric"].includes(puzzle.type)) errors.push(`${id}: unsupported puzzle type ${puzzle.type}`);
    if (puzzle.type === "text" && (!Array.isArray(puzzle.answers) || !puzzle.answers.length)) errors.push(`${id}: text puzzle missing answers`);
    if (puzzle.type === "numeric" && (!Number.isFinite(puzzle.min) || !Number.isFinite(puzzle.max) || puzzle.min > puzzle.max)) errors.push(`${id}: invalid numeric range`);
    if (!nodeIds.has(puzzle.success)) errors.push(`${id}: puzzle -> missing ${puzzle.success}`);
    validateEffects(`${id}:puzzle`, puzzle.effects);
  }

  if (node.quiz) {
    quizCount += 1;
    const quiz = node.quiz;
    if (!Array.isArray(quiz.questions) || quiz.questions.length < 2) errors.push(`${id}: quiz too short`);
    if (!nodeIds.has(quiz.success)) errors.push(`${id}: quiz -> missing ${quiz.success}`);
    if (!Number.isInteger(quiz.passScore) || quiz.passScore < 1 || quiz.passScore > (quiz.questions?.length || 0)) errors.push(`${id}: invalid passScore`);
    quiz.questions?.forEach((q, index) => {
      if (!q.prompt) errors.push(`${id}:q${index}: missing prompt`);
      if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${id}:q${index}: options missing`);
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= (q.options?.length || 0)) errors.push(`${id}:q${index}: bad correct index`);
      validateEffects(`${id}:q${index}:correct`, q.effectsCorrect);
      validateEffects(`${id}:q${index}:wrong`, q.effectsWrong);
    });
    validateEffects(`${id}:quizPass`, quiz.effectsPass);
    validateEffects(`${id}:quizFail`, quiz.effectsFail);
  }

  if (!node.ending && !(node.choices?.length || node.puzzle || node.quiz)) errors.push(`${id}: non-ending node has no outgoing action`);
}

for (const flag of requiredFlags) if (!grantedFlags.has(flag)) errors.push(`required flag is never granted: ${flag}`);
if (quizCount < 14) errors.push(`expected >=14 quizzes, found ${quizCount}`);
if (puzzleCount < 8) errors.push(`expected >=8 free-input puzzles, found ${puzzleCount}`);
if (endingCount !== 6) errors.push(`expected 6 endings, found ${endingCount}`);

// Static reachability ignores requirements. It catches orphaned scenes without exploding
// the combinatorial state space created by four reorderable investigation tracks.
const reachable = new Set(["boot"]);
const queue = ["boot"];
while (queue.length) {
  const id = queue.shift();
  const node = nodes[id];
  const targets = [
    ...(node.choices || []).map((c) => c.next),
    ...(node.puzzle ? [node.puzzle.success] : []),
    ...(node.quiz ? [node.quiz.success] : [])
  ];
  for (const next of targets) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
}
for (const id of nodeIds) if (!reachable.has(id)) errors.push(`orphaned scene: ${id}`);

function stateWithFlags(flags = [], extras = {}) {
  return { ...engine.initialState(story), flags: [...flags], ...extras };
}
function eligibleAt(nodeId, state) {
  return (nodes[nodeId].choices || []).filter((choice) => engine.passes(state, choice.requires));
}
function popcount(n) { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; }

// Requirement truth-table: intro cannot deadlock, and early exit appears only after two checks.
const intro = ["flightRouteDone", "flightSkyDone", "flightCrewDone"];
for (let mask = 0; mask < 8; mask += 1) {
  const flags = intro.filter((_, i) => mask & (1 << i));
  const choices = eligibleAt("flight_second_pick", stateWithFlags(flags));
  const nexts = new Set(choices.map((c) => c.next));
  for (let i = 0; i < intro.length; i += 1) {
    const expectedNext = ["flight_route", "flight_sky", "flight_crew"][i];
    if (!(mask & (1 << i)) && !nexts.has(expectedNext)) errors.push(`intro mask ${mask}: missing unvisited check ${expectedNext}`);
    if ((mask & (1 << i)) && nexts.has(expectedNext)) errors.push(`intro mask ${mask}: completed check still offered ${expectedNext}`);
  }
  if ((popcount(mask) >= 2) !== nexts.has("flight_converge")) errors.push(`intro mask ${mask}: converge requirement mismatch`);
}

// Sydney hub: any three tracks permit progress, completed tracks disappear, missing ones remain available.
const tracks = [
  ["routeTrack", "route_start"], ["skyTrack", "sky_start"],
  ["antarcticaTrack", "antarctica_start"], ["witnessTrack", "witness_start"]
];
for (let mask = 0; mask < 16; mask += 1) {
  const flags = tracks.filter((_, i) => mask & (1 << i)).map(([flag]) => flag);
  const count = popcount(mask);
  const choices = eligibleAt("sydney_hub", stateWithFlags(flags, { tracks: count }));
  const nexts = new Set(choices.map((c) => c.next));
  tracks.forEach(([, next], i) => {
    if (!(mask & (1 << i)) && !nexts.has(next)) errors.push(`Sydney mask ${mask}: missing track ${next}`);
    if ((mask & (1 << i)) && nexts.has(next)) errors.push(`Sydney mask ${mask}: completed track still offered ${next}`);
  });
  if ((count >= 3) !== nexts.has("claimboard_gate")) errors.push(`Sydney mask ${mask}: continue requirement mismatch`);
}

// Deep labs are mandatory: atlas layer 2 must remain locked until all three are done.
const labs = [["sunsetLab", "sun_perspective"], ["laserLab", "laser_lab"], ["redteamLab", "redteam_archive"]];
for (let mask = 0; mask < 8; mask += 1) {
  const flags = labs.filter((_, i) => mask & (1 << i)).map(([flag]) => flag);
  const choices = eligibleAt("deep_lab_hub", stateWithFlags(flags));
  const nexts = new Set(choices.map((c) => c.next));
  labs.forEach(([, next], i) => {
    if (!(mask & (1 << i)) && !nexts.has(next)) errors.push(`deep-lab mask ${mask}: missing lab ${next}`);
    if ((mask & (1 << i)) && nexts.has(next)) errors.push(`deep-lab mask ${mask}: completed lab still offered ${next}`);
  });
  if ((mask === 7) !== nexts.has("atlas_layer2")) errors.push(`deep-lab mask ${mask}: atlas gate mismatch`);
}

// A player can never be trapped at the ending screen: three baseline exits stay available.
const weakFinal = eligibleAt("final_decision", stateWithFlags()).map((c) => c.next);
for (const ending of ["ending_dump", "ending_recruit", "ending_burn"]) {
  if (!weakFinal.includes(ending)) errors.push(`baseline ending unavailable: ${ending}`);
}
if (weakFinal.includes("ending_open") || weakFinal.includes("ending_double_blind")) errors.push("strong ending available to empty state");

// Deterministic gold-path simulation using the same engine as the browser.
let gold = engine.initialState(story);
gold.node = "boot";
function chooseNext(next) {
  const choices = eligibleAt(gold.node, gold);
  const choice = choices.find((c) => c.next === next);
  if (!choice) throw new Error(`gold path: ${gold.node} cannot reach ${next}; eligible=${choices.map((c) => c.next).join(",")}`);
  gold = engine.applyEffects(story, gold, choice.effects);
  gold.node = choice.next;
}
function chooseIndex(index = 0) {
  const choices = eligibleAt(gold.node, gold);
  const choice = choices[index];
  if (!choice) throw new Error(`gold path: no choice ${index} at ${gold.node}`);
  gold = engine.applyEffects(story, gold, choice.effects);
  gold.node = choice.next;
}
function solvePuzzle() {
  const node = nodes[gold.node];
  if (!node.puzzle) throw new Error(`gold path: ${gold.node} is not a puzzle`);
  const sample = node.puzzle.type === "numeric" ? String((node.puzzle.min + node.puzzle.max) / 2) : String(node.puzzle.answers[0]);
  if (!engine.puzzleAccepted(node.puzzle, sample)) throw new Error(`gold path: puzzle sample rejected at ${gold.node}`);
  gold = engine.applyEffects(story, gold, node.puzzle.effects);
  gold.node = node.puzzle.success;
}
function perfectQuiz() {
  const node = nodes[gold.node];
  if (!node.quiz) throw new Error(`gold path: ${gold.node} is not a quiz`);
  const outcome = engine.quizOutcome(story, gold, node.quiz, "perfect");
  if (!outcome.passed) throw new Error(`gold path: perfect quiz failed at ${gold.node}`);
  gold = outcome.state;
  gold.node = node.quiz.success;
}

try {
  chooseNext("role_select"); chooseIndex(0);
  chooseIndex(0); solvePuzzle(); chooseNext("flight_second_pick");
  chooseNext("flight_sky"); chooseIndex(0); chooseNext("flight_second_pick");
  chooseNext("flight_crew"); chooseIndex(0); chooseNext("flight_second_pick");
  chooseNext("flight_converge"); chooseIndex(0); perfectQuiz(); chooseIndex(0);

  chooseNext("route_start"); chooseNext("route_model_quiz"); perfectQuiz(); chooseNext("sydney_hub");
  chooseNext("sky_start"); chooseNext("sky_quiz"); perfectQuiz(); chooseNext("sydney_hub");
  chooseNext("antarctica_start"); chooseNext("antarctica_quiz"); perfectQuiz(); chooseNext("antarctica_sun_quiz");
  perfectQuiz(); chooseNext("sydney_hub");
  chooseNext("witness_start"); chooseIndex(0); solvePuzzle(); perfectQuiz(); chooseNext("sydney_hub");

  chooseNext("claimboard_gate"); chooseNext("claimboard_bonus"); chooseNext("model_room"); chooseNext("model_quiz");
  perfectQuiz(); chooseIndex(0); solvePuzzle(); chooseNext("deep_lab_hub");

  chooseNext("sun_perspective"); chooseNext("sun_quiz"); perfectQuiz(); chooseNext("deep_lab_hub");
  chooseNext("laser_lab"); chooseNext("laser_quiz"); perfectQuiz(); chooseNext("deep_lab_hub");
  chooseNext("redteam_archive"); chooseNext("redteam_sequence"); solvePuzzle(); perfectQuiz(); chooseNext("deep_lab_hub");

  chooseNext("atlas_layer2"); chooseNext("atlas_source_quiz"); perfectQuiz();
  chooseIndex(0); chooseIndex(0); solvePuzzle(); chooseNext("relay_social");
  chooseIndex(0); chooseNext("network_quiz"); perfectQuiz(); chooseIndex(0);
  solvePuzzle(); chooseIndex(0); perfectQuiz(); chooseIndex(0); chooseNext("final_audit"); perfectQuiz();

  if (gold.node !== "final_decision") errors.push(`gold path ended at ${gold.node}`);
  const finalTargets = eligibleAt("final_decision", gold).map((c) => c.next);
  if (!finalTargets.includes("ending_double_blind")) errors.push(`secret ending unreachable on gold path: ${JSON.stringify({rigor:gold.rigor, trust:gold.trust, heat:gold.heat, evidence:gold.evidence.length, claims:gold.claims.length})}`);
  if (!finalTargets.includes("ending_open")) errors.push("canonical open ending unavailable on gold path");
} catch (error) {
  errors.push(error.message);
}

// Balance sentinels: a middling dossier may earn the canonical ending, while a noisy dossier may not.
const medium = stateWithFlags([], { rigor: 68, trust: 14, heat: 12, evidence: [...evidenceIds].slice(0, 10), claims: [...claimIds].slice(0, 8) });
if (!eligibleAt("final_decision", medium).some((c) => c.next === "ending_open")) errors.push("canonical threshold too harsh for medium-careful profile");
const noisy = stateWithFlags([], { rigor: 50, trust: 9, heat: 32, evidence: [...evidenceIds].slice(0, 10), claims: [...claimIds].slice(0, 8) });
if (eligibleAt("final_decision", noisy).some((c) => ["ending_open", "ending_double_blind"].includes(c.next))) errors.push("strong ending too easy for noisy profile");

if (errors.length) {
  console.error("Campaign verification failed:");
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`Campaign verification passed: ${nodeIds.size} scenes, ${campaignWords} story words, ${quizCount} quizzes, ${puzzleCount} free-input puzzles, ${endingCount} endings.`);
console.log(`Registries: ${evidenceIds.size} evidence types, ${claimIds.size} claim cards. Static graph: ${reachable.size}/${nodeIds.size} scenes reachable.`);
console.log(`Gold path: rigor=${gold.rigor}, trust=${gold.trust}, heat=${gold.heat}, evidence=${gold.evidence.length}, claims=${gold.claims.length}; secret ending reachable.`);
console.log("Requirement truth-tables: intro, Sydney hub, deep labs and final fallback passed.");
