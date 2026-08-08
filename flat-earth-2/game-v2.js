"use strict";

(() => {
  const story = window.FE2_STORY_V2;
  const engine = window.FE2_ENGINE_V2;
  if (!story || !engine) throw new Error("FE2 story or engine v2 is missing.");

  const $ = (selector) => document.querySelector(selector);
  const els = {
    terminal: $("#terminal"), output: $("#output"), visual: $("#visual"), choices: $("#choices"),
    puzzleForm: $("#puzzleForm"), puzzleLabel: $("#puzzleLabel"), puzzleInput: $("#puzzleInput"), puzzleHint: $("#puzzleHint"),
    chapter: $("#chapter"), evidenceCount: $("#evidenceCount"), claimCount: $("#claimCount"), heat: $("#heat"), rigor: $("#rigor"), trust: $("#trust"), progress: $("#progress"),
    saveState: $("#saveState"), journalBtn: $("#journalBtn"), evidenceBtn: $("#evidenceBtn"), claimBtn: $("#claimBtn"), mapBtn: $("#mapBtn"), helpBtn: $("#helpBtn"),
    modal: $("#modal"), modalTitle: $("#modalTitle"), modalBody: $("#modalBody"), modalClose: $("#modalClose")
  };

  const STORAGE_KEY = "flat-earth-2-southern-circuit-v2";
  const PROFILE_KEY = "flat-earth-2-southern-circuit-profile-v1";
  let storageAvailable = true;
  let renderToken = 0;
  let activeChoices = [];
  let activeChoiceIndex = 0;
  let interactionLocked = false;

  const initialState = () => engine.initialState(story);

  const initialProfile = () => ({ endings: [], runs: 0, bestRigor: 0, bestEvidence: 0 });
  let profile = loadProfile();
  let state = loadState();

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return initialProfile();
      return sanitizeProfile(safeParse(raw, initialProfile()));
    } catch {
      storageAvailable = false;
      return initialProfile();
    }
  }

  function sanitizeProfile(value) {
    const base = initialProfile();
    if (!value || typeof value !== "object") return base;
    return {
      endings: Array.isArray(value.endings) ? [...new Set(value.endings.filter((id) => story.nodes[id]?.ending))] : [],
      runs: finiteNonNegative(value.runs),
      bestRigor: finiteNonNegative(value.bestRigor),
      bestEvidence: finiteNonNegative(value.bestEvidence)
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      return sanitizeState(safeParse(raw, initialState()));
    } catch {
      storageAvailable = false;
      return initialState();
    }
  }

  function sanitizeState(value) { return engine.sanitizeState(story, value); }

  function finiteNonNegative(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function persist(key, value) {
    if (!storageAvailable) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      storageAvailable = false;
      return false;
    }
  }

  function saveState() {
    const ok = persist(STORAGE_KEY, state);
    if (els.saveState) els.saveState.textContent = ok ? "AUTOSAVE: OK" : "AUTOSAVE: UNAVAILABLE";
    if (ok) setTimeout(() => { if (els.saveState) els.saveState.textContent = "AUTOSAVE: READY"; }, 650);
  }

  function saveProfile() { persist(PROFILE_KEY, profile); }

  function applyEffects(effects = {}) {
    if (effects.reset) {
      profile.runs += 1;
      saveProfile();
    }
    state = engine.applyEffects(story, state, effects);
  }

  function passes(req = {}) { return engine.passes(state, req); }

  function heatLabel(v) { return v <= 2 ? "LOW" : v <= 5 ? "MED" : v <= 8 ? "HIGH" : "RED"; }
  function trustLabel(v) { return v <= 1 ? "UNK" : v <= 4 ? "OPEN" : v <= 7 ? "SOLID" : "HIGH"; }

  function updateHud(node) {
    els.chapter.textContent = node.chapter || "--";
    els.evidenceCount.textContent = `${state.evidence.length}/${story.meta.totalEvidence}`;
    if (els.claimCount) els.claimCount.textContent = `${state.claims.length}/${story.meta.totalClaims}`;
    els.heat.textContent = heatLabel(state.heat);
    els.rigor.textContent = String(state.rigor);
    if (els.trust) els.trust.textContent = trustLabel(state.trust);
    if (els.progress) {
      const pct = Math.min(99, Math.round((state.visited.length / Math.max(1, Object.keys(story.nodes).length - 6)) * 100));
      els.progress.textContent = node.ending ? "100%" : `${pct}%`;
    }
  }

  function lineElement(item) {
    const p = document.createElement("p");
    p.className = "line";
    if (typeof item === "string") p.textContent = item;
    else { p.classList.add(item.kind || "system"); p.textContent = item.text; }
    return p;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  async function renderLines(lines, token) {
    for (const item of lines || []) {
      if (token !== renderToken) return;
      els.output.appendChild(lineElement(item));
      await wait(reducedMotion() ? 0 : 22);
    }
  }

  function clearScene() {
    els.output.replaceChildren(); els.choices.replaceChildren(); els.visual.replaceChildren();
    els.visual.classList.add("hidden"); els.puzzleForm.classList.add("hidden");
    els.puzzleInput.value = ""; els.puzzleHint.textContent = "";
    activeChoices = []; activeChoiceIndex = 0; interactionLocked = true;
  }

  async function gotoNode(id) {
    const node = story.nodes[id];
    if (!node) throw new Error(`Unknown node: ${id}`);
    state.node = id; state.transitions += 1;
    if (!state.visited.includes(id)) state.visited.push(id);
    if (node.ending) recordEnding(id);
    saveState();
    const token = ++renderToken;
    clearScene(); updateHud(node);
    document.title = `${node.title} — ${story.meta.title}`;
    await renderLines(node.lines, token);
    if (token !== renderToken) return;
    if (node.visual) renderVisual(node.visual);
    interactionLocked = false;
    if (node.quiz) renderQuiz(node, id);
    else if (node.puzzle) renderPuzzle(node.puzzle, id);
    else renderChoices(node.choices || []);
    scrollBottom();
  }

  function recordEnding(id) {
    if (!profile.endings.includes(id)) profile.endings.push(id);
    profile.bestRigor = Math.max(profile.bestRigor, state.rigor);
    profile.bestEvidence = Math.max(profile.bestEvidence, state.evidence.length);
    saveProfile();
  }

  function renderChoices(choices) {
    const eligible = choices.filter((choice) => passes(choice.requires));
    activeChoices = eligible;
    if (!eligible.length) {
      const p = lineElement({ kind: "danger", text: "Нет доступных действий. Это состояние не должно возникать; открой карту дела и перезапусти проход, если ошибка сохраняется." });
      els.choices.appendChild(p); return;
    }
    eligible.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "choice"; button.dataset.index = String(index);
      button.innerHTML = `<span class="num">${index + 1}</span><span>${escapeHtml(choice.label)}</span>`;
      button.addEventListener("click", () => choose(index));
      els.choices.appendChild(button);
    });
    activeChoiceIndex = 0; syncActiveChoice();
  }

  function choose(index) {
    if (interactionLocked) return;
    const choice = activeChoices[index];
    if (!choice) return;
    interactionLocked = true;
    applyEffects(choice.effects);
    gotoNode(choice.next);
  }

  function syncActiveChoice() {
    [...els.choices.querySelectorAll(".choice")].forEach((button, i) => {
      button.classList.toggle("active", i === activeChoiceIndex);
      if (i === activeChoiceIndex) button.setAttribute("aria-current", "true"); else button.removeAttribute("aria-current");
    });
  }

  function renderPuzzle(puzzle, nodeId) {
    els.puzzleForm.classList.remove("hidden");
    els.puzzleLabel.textContent = `${puzzle.label || "ВВОД"}:`;
    const attempts = finiteNonNegative(state.puzzleAttempts[nodeId]);
    const roleHint = state.flags.includes("roleEngineer") && puzzle.type === "numeric" ? puzzle.hint : "";
    els.puzzleHint.textContent = attempts > 0 ? (puzzle.hint || "") : (roleHint || "Введите ответ и нажмите Enter.");
    setTimeout(() => els.puzzleInput.focus(), 30);
  }

  function puzzleAccepted(puzzle, raw) { return engine.puzzleAccepted(puzzle, raw); }

  function submitPuzzle(event) {
    event.preventDefault();
    if (interactionLocked) return;
    const node = story.nodes[state.node];
    if (!node?.puzzle) return;
    const puzzle = node.puzzle;
    const raw = els.puzzleInput.value.trim();
    if (puzzleAccepted(puzzle, raw)) {
      interactionLocked = true;
      applyEffects(puzzle.effects);
      gotoNode(puzzle.success);
      return;
    }
    const attempts = finiteNonNegative(state.puzzleAttempts[state.node]) + 1;
    state.puzzleAttempts[state.node] = attempts;
    if (attempts % 3 === 0) state.heat += 1;
    saveState(); updateHud(node);
    els.puzzleHint.textContent = attempts >= 2 ? (puzzle.hint || puzzle.failText || "Неверный ответ.") : (puzzle.failText || "Неверный ответ.");
    els.puzzleInput.select();
  }

  function renderQuiz(node, nodeId) {
    const quiz = node.quiz;
    let progress = state.quizProgress[nodeId];
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) progress = { index: 0, score: 0, finalized: false };
    progress.index = Math.min(quiz.questions.length, Math.floor(finiteNonNegative(progress.index)));
    progress.score = Math.min(quiz.questions.length, Math.floor(finiteNonNegative(progress.score)));
    progress.finalized = progress.finalized === true;
    state.quizProgress[nodeId] = progress;

    if (progress.finalized) { gotoNode(quiz.success); return; }
    if (progress.index >= quiz.questions.length) { finalizeQuiz(nodeId, quiz, progress); return; }

    const q = quiz.questions[progress.index];
    const head = document.createElement("p");
    head.className = "line quiz-prompt";
    head.textContent = `[${progress.index + 1}/${quiz.questions.length}] ${q.prompt}`;
    els.choices.replaceChildren(head);
    activeChoices = q.options.map((label, optionIndex) => ({ label, quizOptionIndex: optionIndex }));
    activeChoices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "choice";
      button.innerHTML = `<span class="num">${index + 1}</span><span>${escapeHtml(choice.label)}</span>`;
      button.addEventListener("click", () => answerQuiz(index));
      els.choices.appendChild(button);
    });
    activeChoiceIndex = 0; syncActiveChoice();
  }

  async function answerQuiz(index) {
    if (interactionLocked) return;
    const nodeId = state.node; const node = story.nodes[nodeId]; const quiz = node?.quiz;
    if (!quiz) return;
    const progress = state.quizProgress[nodeId] || { index: 0, score: 0, finalized: false };
    const q = quiz.questions[progress.index]; const choice = activeChoices[index];
    if (!q || !choice) return;
    interactionLocked = true;
    const correct = choice.quizOptionIndex === q.correct;
    if (correct) { progress.score += 1; applyEffects(q.effectsCorrect); } else applyEffects(q.effectsWrong);
    const feedback = lineElement({ kind: correct ? "system" : "alert", text: `${correct ? "✓" : "×"} ${q.explanation || (correct ? "Верно." : "Ответ зафиксирован.")}` });
    els.output.appendChild(feedback);
    progress.index += 1;
    state.quizProgress[nodeId] = progress;
    saveState(); updateHud(node); scrollBottom();
    await wait(reducedMotion() ? 0 : 220);
    interactionLocked = false;
    if (progress.index >= quiz.questions.length) finalizeQuiz(nodeId, quiz, progress); else renderQuiz(node, nodeId);
  }

  function finalizeQuiz(nodeId, quiz, progress) {
    if (progress.finalized) { gotoNode(quiz.success); return; }
    progress.finalized = true;
    const passed = progress.score >= (quiz.passScore || quiz.questions.length);
    applyEffects(passed ? quiz.effectsPass : quiz.effectsFail);
    state.quizProgress[nodeId] = progress;
    saveState();
    gotoNode(quiz.success);
  }

  function renderVisual(spec) {
    els.visual.classList.remove("hidden");
    els.visual.innerHTML = `${makeVisual(spec)}<div class="visual-caption">${escapeHtml(spec.title || spec.type || "CASE VISUAL")}</div>`;
  }

  function makeVisual(spec) {
    const title = escapeHtml(spec.title || spec.type || "CASE");
    const green = "#9df7b8", dim = "#5da66f", amber = "#e9c46a", bg = "#06100a";
    let body = `<rect x="50" y="55" width="700" height="180" fill="none" stroke="${dim}"/><text x="400" y="145" text-anchor="middle" fill="${green}" font-family="monospace" font-size="28">${title}</text>`;
    if (["route", "flight"].includes(spec.type)) body = `<path d="M110 205 Q380 35 690 175" fill="none" stroke="${amber}" stroke-width="4" stroke-dasharray="10 7"/><circle cx="110" cy="205" r="7" fill="${green}"/><circle cx="690" cy="175" r="7" fill="${green}"/><text x="100" y="230" fill="${green}" font-family="monospace">SCL</text><text x="675" y="200" fill="${green}" font-family="monospace">SYD</text><text x="400" y="260" text-anchor="middle" fill="${dim}" font-family="monospace">~11,400 KM // ~14:30</text>`;
    if (spec.type === "stars") body = `${Array.from({length:8},(_,i)=>`<circle cx="400" cy="145" r="${28+i*18}" fill="none" stroke="${i%2?dim:green}" stroke-dasharray="${8+i} 10" opacity=".6"/>`).join("")}<circle cx="400" cy="145" r="5" fill="${amber}"/><text x="420" y="151" fill="${amber}" font-family="monospace">SCP</text>`;
    if (["network","matrix","models"].includes(spec.type)) body = `${[[150,90],[300,190],[410,75],[540,190],[660,105]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${16+i%2*8}" fill="none" stroke="${i%2?amber:green}"/><line x1="400" y1="145" x2="${x}" y2="${y}" stroke="${dim}"/>`).join("")}<circle cx="400" cy="145" r="24" fill="${green}" opacity=".25"/><text x="400" y="270" text-anchor="middle" fill="${dim}" font-family="monospace">SEED → COLLISION → RESCUE → MIGRATION</text>`;
    if (spec.type === "antarctica") body = `<path d="M175 185 L235 95 L330 115 L390 60 L485 105 L615 92 L675 190 L590 220 L475 205 L365 235 L260 215 Z" fill="none" stroke="${green}" stroke-width="3"/><text x="400" y="155" text-anchor="middle" fill="${amber}" font-family="monospace" font-size="20">ACCESS ≠ UNREGULATED</text>`;
    if (spec.type === "radio" || spec.type === "relay") body = `<polyline points="${Array.from({length:28},(_,i)=>`${25+i*28},${145+Math.sin(i*1.5)*20+(i%6===0?-45:0)}`).join(" ")}" fill="none" stroke="${green}" stroke-width="2"/><text x="55" y="70" fill="${amber}" font-family="monospace" font-size="24">HZ67</text>`;
    if (spec.type === "shadows") body = `<line x1="250" y1="220" x2="250" y2="80" stroke="${green}" stroke-width="8"/><line x1="550" y1="220" x2="550" y2="80" stroke="${green}" stroke-width="8"/><line x1="250" y1="220" x2="345" y2="220" stroke="${amber}" stroke-width="5"/><line x1="550" y1="220" x2="620" y2="220" stroke="${amber}" stroke-width="5"/><text x="400" y="265" text-anchor="middle" fill="${dim}" font-family="monospace">7.2° // 800 KM → ?</text>`;
    return `<svg viewBox="0 0 800 300" role="img" aria-label="${title}" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="300" fill="${bg}"/>${body}<text x="18" y="285" fill="${dim}" font-family="monospace" font-size="11">PROCEDURAL CASE ART // FICTION WHERE MARKED</text></svg>`;
  }

  function openModal(kind) {
    if (kind === "journal") {
      els.modalTitle.textContent = "ЖУРНАЛ РАССЛЕДОВАНИЯ";
      els.modalBody.innerHTML = state.journal.length ? `<ol>${state.journal.map((x)=>`<li>${escapeHtml(x)}</li>`).join("")}</ol>` : `<p class="muted">Записей пока нет.</p>`;
    } else if (kind === "evidence") {
      els.modalTitle.textContent = "УЛИКИ";
      const have = new Set(state.evidence);
      els.modalBody.innerHTML = Object.values(story.evidence).map((item) => have.has(item.id)
        ? `<section><h3>● ${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><p class="${item.realWorld?"tag":"muted"}">${item.realWorld?"РЕАЛЬНЫЙ ПРОВЕРЯЕМЫЙ ФАКТ/МЕТОД":"ХУДОЖЕСТВЕННАЯ УЛИКА СЮЖЕТА"} · ${escapeHtml(item.sourceTag)}</p></section>`
        : `<section class="locked-entry"><h3>○ НЕ ОБНАРУЖЕНО</h3><p class="muted">Описание скрыто до получения улики.</p></section>`).join("");
    } else if (kind === "claims") {
      els.modalTitle.textContent = "КАРТОЧКИ ТЕЗИСОВ";
      const have = new Set(state.claims);
      els.modalBody.innerHTML = Object.values(story.claims).map((item) => have.has(item.id)
        ? `<section><h3>● ${escapeHtml(item.title)}</h3><p class="tag">${escapeHtml(item.verdict)}</p><p>${escapeHtml(item.summary)}</p></section>`
        : `<section class="locked-entry"><h3>○ ТЕЗИС НЕ РАЗОБРАН</h3><p class="muted">Пройди соответствующий исследовательский трек.</p></section>`).join("");
    } else if (kind === "map") {
      const elapsedMin = Math.max(1, Math.round((Date.now()-state.startedAt)/60000));
      els.modalTitle.textContent = "КАРТА ДЕЛА";
      els.modalBody.innerHTML = `<p><strong>Сцен посещено:</strong> ${state.visited.length}/${Object.keys(story.nodes).length}</p><p><strong>Исследовательских нитей:</strong> ${state.tracks}/4</p><p><strong>Текущий проход:</strong> ~${elapsedMin} мин · ${state.transitions} переходов</p><p><strong>Финалов найдено:</strong> ${profile.endings.length}/6</p><p><strong>Лучший МЕТОД:</strong> ${profile.bestRigor}</p><hr><p class="muted">Карта показывает прогресс, но не раскрывает не найденные сцены и финалы.</p>`;
    } else if (kind === "help") {
      els.modalTitle.textContent = "ПОМОЩЬ / ПРАВИЛА";
      els.modalBody.innerHTML = `<p>${escapeHtml(story.meta.disclaimer)}</p><h3>Клавиши</h3><ul><li><code>1–9</code> — выбор</li><li><code>↑/↓</code> — навигация</li><li><code>Enter</code> — подтвердить</li><li><code>J</code> — журнал</li><li><code>E</code> — улики</li><li><code>C</code> — тезисы</li><li><code>M</code> — карта дела</li><li><code>?</code> — помощь</li></ul><h3>Системы</h3><p><strong>МЕТОД</strong> растёт за воспроизводимость и корректную классификацию источников. <strong>РИСК</strong> растёт за поспешные выводы и ошибки. <strong>ДОВЕРИЕ</strong> отражает качество работы с источниками и открывает редкие маршруты.</p><p class="muted">Неверный ответ обычно не блокирует кампанию: он меняет состояние дела. После нескольких ошибок в свободном вводе появляется подсказка и может вырасти РИСК.</p>`;
    }
    if (!els.modal.open) els.modal.showModal();
  }

  function closeModal() { if (els.modal.open) els.modal.close(); }
  function scrollBottom() { requestAnimationFrame(() => { els.terminal.scrollTop = els.terminal.scrollHeight; }); }

  function onKeyDown(event) {
    if (els.modal.open) { if (event.key === "Escape") closeModal(); return; }
    if (!els.puzzleForm.classList.contains("hidden") && document.activeElement === els.puzzleInput) { if (event.key === "Escape") els.puzzleInput.blur(); return; }
    const key = event.key.toLowerCase();
    if (key === "j") { event.preventDefault(); openModal("journal"); return; }
    if (key === "e") { event.preventDefault(); openModal("evidence"); return; }
    if (key === "c") { event.preventDefault(); openModal("claims"); return; }
    if (key === "m") { event.preventDefault(); openModal("map"); return; }
    if (key === "?" || (event.shiftKey && event.key === "/")) { event.preventDefault(); openModal("help"); return; }
    if (/^[1-9]$/.test(event.key)) { const idx = Number(event.key)-1; if (activeChoices[idx]) { event.preventDefault(); if (story.nodes[state.node]?.quiz) answerQuiz(idx); else choose(idx); } return; }
    if (!activeChoices.length || interactionLocked) return;
    if (event.key === "ArrowDown") { event.preventDefault(); activeChoiceIndex=(activeChoiceIndex+1)%activeChoices.length; syncActiveChoice(); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); activeChoiceIndex=(activeChoiceIndex-1+activeChoices.length)%activeChoices.length; syncActiveChoice(); return; }
    if (event.key === "Enter") { event.preventDefault(); if (story.nodes[state.node]?.quiz) answerQuiz(activeChoiceIndex); else choose(activeChoiceIndex); }
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  els.puzzleForm.addEventListener("submit", submitPuzzle);
  els.journalBtn.addEventListener("click", () => openModal("journal"));
  els.evidenceBtn.addEventListener("click", () => openModal("evidence"));
  els.claimBtn?.addEventListener("click", () => openModal("claims"));
  els.mapBtn?.addEventListener("click", () => openModal("map"));
  els.helpBtn.addEventListener("click", () => openModal("help"));
  els.modalClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", onKeyDown);

  gotoNode(state.node);
})();
