(function (global) {
  "use strict";

  function finiteNonNegative(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function finiteDelta(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function initialState(story) {
    return {
      version: story.meta.saveVersion || 2,
      node: "boot", evidence: [], claims: [], journal: [], flags: [],
      rigor: 0, heat: 0, trust: 0, tracks: 0,
      puzzleAttempts: {}, quizProgress: {}, visited: [],
      startedAt: Date.now(), transitions: 0
    };
  }

  function sanitizeIdArray(values, registry) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter((id) => typeof id === "string" && registry[id]))];
  }

  function sanitizeState(story, value) {
    const base = initialState(story);
    if (!value || typeof value !== "object") return base;
    const node = typeof value.node === "string" && story.nodes[value.node] ? value.node : "boot";
    return {
      ...base,
      node,
      evidence: sanitizeIdArray(value.evidence, story.evidence),
      claims: sanitizeIdArray(value.claims, story.claims),
      journal: Array.isArray(value.journal) ? value.journal.filter((x) => typeof x === "string").slice(-300) : [],
      flags: Array.isArray(value.flags) ? [...new Set(value.flags.filter((x) => typeof x === "string"))] : [],
      rigor: finiteNonNegative(value.rigor), heat: finiteNonNegative(value.heat), trust: finiteNonNegative(value.trust), tracks: finiteNonNegative(value.tracks),
      puzzleAttempts: value.puzzleAttempts && typeof value.puzzleAttempts === "object" && !Array.isArray(value.puzzleAttempts) ? value.puzzleAttempts : {},
      quizProgress: value.quizProgress && typeof value.quizProgress === "object" && !Array.isArray(value.quizProgress) ? value.quizProgress : {},
      visited: Array.isArray(value.visited) ? [...new Set(value.visited.filter((id) => story.nodes[id]))] : [],
      startedAt: Number.isFinite(Number(value.startedAt)) ? Number(value.startedAt) : Date.now(),
      transitions: finiteNonNegative(value.transitions)
    };
  }

  function uniquePush(target, values) {
    for (const value of values || []) if (!target.includes(value)) target.push(value);
  }

  function applyEffects(story, current, effects = {}) {
    if (effects.reset) return initialState(story);
    const state = {
      ...current,
      evidence: [...current.evidence], claims: [...current.claims], journal: [...current.journal], flags: [...current.flags]
    };
    uniquePush(state.evidence, (effects.evidence || []).filter((id) => story.evidence[id]));
    uniquePush(state.claims, (effects.claims || []).filter((id) => story.claims[id]));
    uniquePush(state.flags, (effects.flags || []).filter((id) => typeof id === "string"));
    if (effects.journal && typeof effects.journal === "string" && !state.journal.includes(effects.journal)) state.journal.push(effects.journal);
    state.rigor = Math.max(0, finiteNonNegative(state.rigor) + finiteDelta(effects.rigor));
    state.heat = Math.max(0, finiteNonNegative(state.heat) + finiteDelta(effects.heat));
    state.trust = Math.max(0, finiteNonNegative(state.trust) + finiteDelta(effects.trust));
    state.tracks = Math.max(0, finiteNonNegative(state.tracks) + finiteDelta(effects.tracks));
    return state;
  }

  function passes(state, req = {}) {
    const flags = new Set(state.flags || []);
    if (req.allFlags && !req.allFlags.every((f) => flags.has(f))) return false;
    if (req.anyFlags && !req.anyFlags.some((f) => flags.has(f))) return false;
    if (req.notFlags && req.notFlags.some((f) => flags.has(f))) return false;
    if (Number.isFinite(req.minTracks) && state.tracks < req.minTracks) return false;
    if (Number.isFinite(req.minEvidence) && state.evidence.length < req.minEvidence) return false;
    if (Number.isFinite(req.minClaims) && state.claims.length < req.minClaims) return false;
    if (Number.isFinite(req.minRigor) && state.rigor < req.minRigor) return false;
    if (Number.isFinite(req.minTrust) && state.trust < req.minTrust) return false;
    if (Number.isFinite(req.maxHeat) && state.heat > req.maxHeat) return false;
    if (Number.isFinite(req.minIntroChecks)) {
      const checks = ["flightRouteDone", "flightSkyDone", "flightCrewDone"].filter((f) => flags.has(f)).length;
      if (checks < req.minIntroChecks) return false;
    }
    return true;
  }

  function normalizeAnswer(value) {
    return String(value).trim().toLocaleUpperCase("ru-RU").replace(/\s+/g, " ");
  }

  function puzzleAccepted(puzzle, raw) {
    if (puzzle.type === "numeric") {
      const value = Number(String(raw).trim().replace(",", "."));
      return Number.isFinite(value) && value >= puzzle.min && value <= puzzle.max;
    }
    const normalized = normalizeAnswer(raw);
    return (puzzle.answers || []).some((answer) => normalizeAnswer(answer) === normalized);
  }

  function quizOutcome(story, state, quiz, mode = "perfect") {
    let next = state;
    let score = 0;
    for (const q of quiz.questions || []) {
      if (mode === "perfect") { score += 1; next = applyEffects(story, next, q.effectsCorrect); }
      else next = applyEffects(story, next, q.effectsWrong);
    }
    const passed = score >= (quiz.passScore || quiz.questions.length);
    next = applyEffects(story, next, passed ? quiz.effectsPass : quiz.effectsFail);
    return { state: next, score, passed };
  }

  const api = { finiteNonNegative, initialState, sanitizeState, applyEffects, passes, puzzleAccepted, normalizeAnswer, quizOutcome };
  global.FE2_ENGINE_V2 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
