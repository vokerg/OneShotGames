"use strict";

(() => {
  const story = window.FLAT_EARTH_STORY;
  if (!story) throw new Error("Story data is missing.");

  const $ = (selector) => document.querySelector(selector);
  const els = {
    terminal: $("#terminal"),
    output: $("#output"),
    visual: $("#visual"),
    choices: $("#choices"),
    puzzleForm: $("#puzzleForm"),
    puzzleLabel: $("#puzzleLabel"),
    puzzleInput: $("#puzzleInput"),
    puzzleHint: $("#puzzleHint"),
    chapter: $("#chapter"),
    evidenceCount: $("#evidenceCount"),
    heat: $("#heat"),
    rigor: $("#rigor"),
    saveState: $("#saveState"),
    journalBtn: $("#journalBtn"),
    evidenceBtn: $("#evidenceBtn"),
    helpBtn: $("#helpBtn"),
    modal: $("#modal"),
    modalTitle: $("#modalTitle"),
    modalBody: $("#modalBody"),
    modalClose: $("#modalClose")
  };

  const STORAGE_KEY = "flat-earth-2-southern-circuit-v1";

  const initialState = () => ({
    node: "boot",
    evidence: [],
    journal: [],
    flags: [],
    rigor: 0,
    heat: 0,
    tracks: 0,
    puzzleAttempts: {},
    visited: [],
    startedAt: Date.now()
  });

  let state = loadState();
  let activeChoices = [];
  let activeChoiceIndex = 0;
  let renderToken = 0;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      const parsed = JSON.parse(raw);
      if (!parsed || !story.nodes[parsed.node]) return initialState();
      return { ...initialState(), ...parsed };
    } catch {
      return initialState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    els.saveState.textContent = "AUTOSAVE: OK";
    setTimeout(() => {
      els.saveState.textContent = "AUTOSAVE: READY";
    }, 700);
  }

  function uniquePush(target, values) {
    for (const value of values || []) {
      if (!target.includes(value)) target.push(value);
    }
  }

  function applyEffects(effects = {}) {
    if (effects.reset) {
      state = initialState();
      saveState();
      return;
    }
    uniquePush(state.evidence, effects.evidence);
    uniquePush(state.flags, effects.flags);
    if (effects.journal && !state.journal.includes(effects.journal)) {
      state.journal.push(effects.journal);
    }
    state.rigor = Math.max(0, state.rigor + (effects.rigor || 0));
    state.heat = Math.max(0, state.heat + (effects.heat || 0));
    state.tracks = Math.max(0, state.tracks + (effects.tracks || 0));
  }

  function passes(requirements = {}) {
    const flags = new Set(state.flags);
    if (requirements.allFlags && !requirements.allFlags.every((f) => flags.has(f))) return false;
    if (requirements.notFlags && requirements.notFlags.some((f) => flags.has(f))) return false;
    if (Number.isFinite(requirements.minTracks) && state.tracks < requirements.minTracks) return false;
    if (Number.isFinite(requirements.minEvidence) && state.evidence.length < requirements.minEvidence) return false;
    if (Number.isFinite(requirements.minRigor) && state.rigor < requirements.minRigor) return false;
    if (Number.isFinite(requirements.maxHeat) && state.heat > requirements.maxHeat) return false;
    return true;
  }

  function heatLabel(value) {
    if (value <= 1) return "LOW";
    if (value <= 3) return "MED";
    if (value <= 5) return "HIGH";
    return "RED";
  }

  function updateHud(node) {
    els.chapter.textContent = node.chapter || "--";
    els.evidenceCount.textContent = `${state.evidence.length}/${story.meta.totalEvidence}`;
    els.heat.textContent = heatLabel(state.heat);
    els.rigor.textContent = String(state.rigor);
  }

  function lineElement(item) {
    const line = document.createElement("p");
    line.className = "line";

    if (typeof item === "string") {
      line.textContent = item;
      return line;
    }

    line.classList.add(item.kind || "system");
    line.textContent = item.text;
    return line;
  }

  async function renderLines(lines, token) {
    for (const item of lines || []) {
      if (token !== renderToken) return;
      const line = lineElement(item);
      els.output.appendChild(line);
      await wait(prefersReducedMotion() ? 0 : 26);
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function clearScene() {
    els.output.replaceChildren();
    els.choices.replaceChildren();
    els.visual.replaceChildren();
    els.visual.classList.add("hidden");
    els.puzzleForm.classList.add("hidden");
    els.puzzleInput.value = "";
    els.puzzleHint.textContent = "";
    activeChoices = [];
    activeChoiceIndex = 0;
  }

  async function gotoNode(id) {
    const node = story.nodes[id];
    if (!node) throw new Error(`Unknown node: ${id}`);

    state.node = id;
    if (!state.visited.includes(id)) state.visited.push(id);
    saveState();

    const token = ++renderToken;
    clearScene();
    updateHud(node);

    document.title = `${node.title} — ${story.meta.title}`;
    await renderLines(node.lines, token);
    if (token !== renderToken) return;

    if (node.visual) renderVisual(node.visual);
    if (node.puzzle) renderPuzzle(node.puzzle, id);
    else renderChoices(node.choices || []);
    scrollBottom();
  }

  function renderChoices(choices) {
    const eligible = choices.filter((choice) => passes(choice.requires));
    activeChoices = eligible;

    if (!eligible.length) {
      const dead = document.createElement("p");
      dead.className = "line danger";
      dead.textContent = "Нет доступных действий. Открой журнал и проверь состояние дела.";
      els.choices.appendChild(dead);
      return;
    }

    eligible.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.dataset.index = String(index);
      button.innerHTML = `<span class="num">${index + 1}</span><span>${escapeHtml(choice.label)}</span>`;
      button.addEventListener("click", () => choose(index));
      els.choices.appendChild(button);
    });

    activeChoiceIndex = 0;
    syncActiveChoice();
  }

  function choose(index) {
    const choice = activeChoices[index];
    if (!choice) return;
    applyEffects(choice.effects);
    gotoNode(choice.next);
  }

  function syncActiveChoice() {
    const buttons = [...els.choices.querySelectorAll(".choice")];
    buttons.forEach((button, index) => {
      button.classList.toggle("active", index === activeChoiceIndex);
      if (index === activeChoiceIndex) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  function renderPuzzle(puzzle, nodeId) {
    els.puzzleForm.classList.remove("hidden");
    els.puzzleLabel.textContent = `${puzzle.label || "ВВОД"}:`;
    const attempts = state.puzzleAttempts[nodeId] || 0;
    els.puzzleHint.textContent = attempts ? puzzle.hint || "" : "Введите ответ и нажмите Enter.";
    setTimeout(() => els.puzzleInput.focus(), 50);
  }

  function submitPuzzle(event) {
    event.preventDefault();
    const node = story.nodes[state.node];
    if (!node?.puzzle) return;

    const puzzle = node.puzzle;
    const raw = els.puzzleInput.value.trim();
    const normalized = raw.toLocaleUpperCase("ru-RU");
    const accepted = (puzzle.answers || []).some(
      (answer) => String(answer).trim().toLocaleUpperCase("ru-RU") === normalized
    );

    if (accepted) {
      applyEffects(puzzle.effects);
      gotoNode(puzzle.success);
      return;
    }

    state.puzzleAttempts[state.node] = (state.puzzleAttempts[state.node] || 0) + 1;
    saveState();
    els.puzzleHint.textContent = puzzle.failText || puzzle.hint || "Неверный ответ.";
    els.puzzleInput.select();
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      els.terminal.scrollTop = els.terminal.scrollHeight;
    });
  }

  function renderVisual(spec) {
    els.visual.classList.remove("hidden");
    const svg = makeVisual(spec);
    els.visual.innerHTML = `${svg}<div class="visual-caption">${escapeHtml(captionFor(spec))}</div>`;
  }

  function captionFor(spec) {
    const captions = {
      boot: "Процедурная заставка терминала.",
      flight: "Иллюстрация: ночной салон и служебный слой маршрута.",
      route: "Схематическое сравнение южного маршрута.",
      locker: "Записка из паспорта: LOCKER 117.",
      test: "Тест качества доказательств.",
      dossier: "ATLAS/67 — художественный документ, не реальный архив спецслужб.",
      hub: "Три независимые нити расследования.",
      routeLab: "Операционные данные маршрута SCL → SYD.",
      stars: "Схема южного небесного полюса.",
      starsLab: "Повторяемое наблюдение звёздных дуг.",
      witness: "WITNESS-12: первичные файлы важнее рассказа.",
      cipher: "Ключ HORIZON.",
      radio: "RELAY-19: повторяющийся пакет HZ67.",
      relay: "Локальный терминал ретранслятора.",
      kestrel: "Запись КЕСТРЕЛА — персонаж и проект вымышлены.",
      audit: "Финальный аудит источников.",
      ending: "Финальный экран."
    };
    return captions[spec.type] || "Процедурная иллюстрация.";
  }

  function makeVisual(spec) {
    const green = "#9df7b8";
    const dim = "#5da66f";
    const amber = "#e9c46a";
    const bg = "#06100a";
    const line = "rgba(157,247,184,0.28)";

    const frame = (body, title = "") => `
      <svg viewBox="0 0 800 300" role="img" aria-label="${escapeHtml(title || spec.type)}"
           xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="300" fill="${bg}"/>
        <g stroke="${line}" stroke-width="1" opacity=".7">
          ${Array.from({length: 15}, (_, i) => `<line x1="0" y1="${20*i}" x2="800" y2="${20*i}"/>`).join("")}
          ${Array.from({length: 20}, (_, i) => `<line x1="${40*i}" y1="0" x2="${40*i}" y2="300"/>`).join("")}
        </g>
        ${body}
        <text x="18" y="282" fill="${dim}" font-family="monospace" font-size="11">${escapeHtml(title)}</text>
      </svg>`;

    switch (spec.type) {
      case "boot":
        return frame(`
          <circle cx="400" cy="135" r="82" fill="none" stroke="${green}" stroke-width="2" opacity=".8"/>
          <circle cx="400" cy="135" r="55" fill="none" stroke="${dim}" stroke-dasharray="4 5"/>
          <line x1="310" y1="135" x2="490" y2="135" stroke="${green}" opacity=".5"/>
          <line x1="400" y1="45" x2="400" y2="225" stroke="${green}" opacity=".5"/>
          <text x="400" y="128" fill="${green}" font-family="monospace" font-size="22" text-anchor="middle">SOUTHERN</text>
          <text x="400" y="154" fill="${green}" font-family="monospace" font-size="22" text-anchor="middle">CIRCUIT</text>
        `, "BOOT SECTOR 67");

      case "flight":
        return frame(`
          <path d="M60 235 Q180 195 300 222 Q420 245 540 214 Q650 188 760 223" fill="none" stroke="${dim}" stroke-width="3"/>
          <rect x="265" y="40" width="270" height="150" rx="8" fill="#08150d" stroke="${green}"/>
          <path d="M305 145 Q395 60 500 130" fill="none" stroke="${amber}" stroke-width="3" stroke-dasharray="8 6"/>
          <circle cx="305" cy="145" r="5" fill="${green}"/><text x="286" y="165" fill="${green}" font-family="monospace" font-size="13">SCL</text>
          <circle cx="500" cy="130" r="5" fill="${green}"/><text x="505" y="125" fill="${green}" font-family="monospace" font-size="13">SYD</text>
          <text x="290" y="75" fill="${dim}" font-family="monospace" font-size="12">SERVICE NAV LAYER</text>
          <text x="290" y="98" fill="${amber}" font-family="monospace" font-size="12">REMAIN 6180 KM</text>
        `, "03:17 AIRCRAFT TIME");

      case "route":
      case "routeLab":
        return frame(`
          <circle cx="205" cy="145" r="96" fill="none" stroke="${dim}" stroke-width="2"/>
          <circle cx="205" cy="145" r="8" fill="${green}"/>
          <path d="M117 184 Q200 225 292 170" fill="none" stroke="${amber}" stroke-width="4"/>
          <text x="94" y="203" fill="${green}" font-family="monospace" font-size="13">SCL</text>
          <text x="292" y="174" fill="${green}" font-family="monospace" font-size="13">SYD</text>
          <path d="M405 214 Q575 60 730 182" fill="none" stroke="${green}" stroke-width="4"/>
          <circle cx="405" cy="214" r="5" fill="${amber}"/><circle cx="730" cy="182" r="5" fill="${amber}"/>
          <text x="430" y="245" fill="${green}" font-family="monospace" font-size="15">~11,400 KM // ~14–15 H</text>
          <text x="430" y="80" fill="${dim}" font-family="monospace" font-size="12">INDEPENDENT OPERATIONAL CONSTRAINT</text>
        `, spec.type === "routeLab" ? "ROUTE LAB // REPRODUCIBLE DATA" : "MAP ≠ TERRITORY");

      case "stars":
      case "starsLab": {
        const trails = Array.from({ length: 8 }, (_, i) => {
          const r = 26 + i * 16;
          return `<path d="M400 ${142-r} A${r} ${r} 0 0 1 ${400+r} 142" fill="none" stroke="${i % 2 ? dim : green}" stroke-width="2" opacity="${0.35 + i*0.05}"/>`;
        }).join("");
        const stars = [
          [255,62],[292,91],[335,54],[467,73],[516,112],[552,69],[610,130],[234,172],
          [331,215],[458,213],[530,186],[597,232],[187,118],[661,95]
        ].map(([x,y], i) => `<circle cx="${x}" cy="${y}" r="${i%3===0?2.4:1.5}" fill="${green}"/>`).join("");
        return frame(`
          ${trails}${stars}
          <circle cx="400" cy="142" r="4" fill="none" stroke="${amber}" stroke-width="2"/>
          <line x1="385" y1="142" x2="415" y2="142" stroke="${amber}"/>
          <line x1="400" y1="127" x2="400" y2="157" stroke="${amber}"/>
          <text x="420" y="148" fill="${amber}" font-family="monospace" font-size="12">SCP</text>
          <text x="60" y="250" fill="${dim}" font-family="monospace" font-size="12">NO BRIGHT SOUTHERN “POLARIS” REQUIRED</text>
        `, spec.type === "starsLab" ? "SOUTH SKY // FIXED CAMERA" : "SOUTHERN SKY // CLUE");
      }

      case "locker":
        return frame(`
          <rect x="225" y="72" width="350" height="150" fill="#09170f" stroke="${green}" stroke-width="2"/>
          <text x="250" y="113" fill="${amber}" font-family="monospace" font-size="26">LOCKER 117</text>
          <text x="250" y="150" fill="${green}" font-family="monospace" font-size="16">T3</text>
          <text x="250" y="182" fill="${green}" font-family="monospace" font-size="16">ВОЗЬМИ ТО, ЧТО МОЖНО ПОВТОРИТЬ</text>
        `, "UNSIGNED NOTE");

      case "test":
        return frame(`
          <text x="70" y="70" fill="${green}" font-family="monospace" font-size="15">A  DRAIN DIRECTION</text>
          <text x="70" y="110" fill="${green}" font-family="monospace" font-size="15">B  SECRET SCREENSHOT</text>
          <text x="70" y="150" fill="${amber}" font-family="monospace" font-size="15">C  FLIGHT TIME + DISTANCE</text>
          <text x="70" y="190" fill="${green}" font-family="monospace" font-size="15">D  PILOT QUOTE</text>
          <rect x="55" y="126" width="520" height="34" fill="none" stroke="${amber}" stroke-dasharray="5 4"/>
        `, "EVIDENCE QUALITY TEST");

      case "dossier":
        return frame(`
          <rect x="150" y="35" width="500" height="225" fill="#0b160f" stroke="${dim}"/>
          <text x="180" y="78" fill="${amber}" font-family="monospace" font-size="18">FICTIONAL ARCHIVE // GAME</text>
          <text x="180" y="112" fill="${green}" font-family="monospace" font-size="26">ATLAS / 67</text>
          <text x="180" y="145" fill="${dim}" font-family="monospace" font-size="14">CIA [STYLIZED] // MOSSAD [STYLIZED]</text>
          <line x1="180" y1="165" x2="610" y2="165" stroke="${dim}"/>
          <text x="180" y="198" fill="${green}" font-family="monospace" font-size="15">HORIZON IS NOT ABOUT THE SHAPE</text>
          <text x="180" y="226" fill="${dim}" font-family="monospace" font-size="12">VERIFY TWO INDEPENDENT DETAILS</text>
        `, "PROP DOCUMENT // NOT A REAL INTELLIGENCE FILE");

      case "hub":
        return frame(`
          <circle cx="400" cy="145" r="18" fill="${green}"/>
          <line x1="400" y1="145" x2="205" y2="75" stroke="${green}" stroke-width="2"/>
          <line x1="400" y1="145" x2="600" y2="75" stroke="${green}" stroke-width="2"/>
          <line x1="400" y1="145" x2="400" y2="245" stroke="${green}" stroke-width="2"/>
          <rect x="120" y="42" width="170" height="50" fill="#07130b" stroke="${dim}"/>
          <rect x="515" y="42" width="170" height="50" fill="#07130b" stroke="${dim}"/>
          <rect x="315" y="225" width="170" height="45" fill="#07130b" stroke="${dim}"/>
          <text x="205" y="72" text-anchor="middle" fill="${green}" font-family="monospace" font-size="14">ROUTE LAB</text>
          <text x="600" y="72" text-anchor="middle" fill="${green}" font-family="monospace" font-size="14">SOUTH SKY</text>
          <text x="400" y="253" text-anchor="middle" fill="${green}" font-family="monospace" font-size="14">WITNESS-12</text>
        `, "THREE INDEPENDENT THREADS");

      case "witness":
        return frame(`
          <rect x="110" y="55" width="580" height="185" fill="#07130b" stroke="${dim}"/>
          <text x="140" y="90" fill="${green}" font-family="monospace" font-size="15">WITNESS-12 // MIRA KELLER [FICTIONAL]</text>
          <text x="140" y="126" fill="${amber}" font-family="monospace" font-size="15">PRIMARY FILES ........ RECEIVED</text>
          <text x="140" y="156" fill="${green}" font-family="monospace" font-size="15">CHECKSUMS ............ MATCH</text>
          <text x="140" y="186" fill="${green}" font-family="monospace" font-size="15">PRE-DATES ATLAS/67 ... YES</text>
          <text x="140" y="216" fill="${dim}" font-family="monospace" font-size="12">TEST THE FILES, NOT THE PERSON</text>
        `, "SOURCE PROVENANCE");

      case "cipher":
        return frame(`
          <text x="400" y="78" text-anchor="middle" fill="${green}" font-family="monospace" font-size="20">КАРТА  /  СЛУХ  /  НАБЛЮДЕНИЕ  /  АВТОРИТЕТ</text>
          <line x1="105" y1="110" x2="695" y2="110" stroke="${dim}"/>
          <text x="400" y="158" text-anchor="middle" fill="${amber}" font-family="monospace" font-size="16">REMOVE DEPENDENCE ON SOMEONE ELSE'S CLAIM</text>
          <text x="400" y="205" text-anchor="middle" fill="${green}" font-family="monospace" font-size="18">&gt; _</text>
        `, "HORIZON.GATE");

      case "radio":
      case "relay":
        return frame(`
          <polyline points="${Array.from({length: 26}, (_, i) => `${35+i*29},${145 + Math.sin(i*1.7)*18 + (i%7===0?-45:0)}`).join(" ")}"
            fill="none" stroke="${green}" stroke-width="2"/>
          <line x1="0" y1="145" x2="800" y2="145" stroke="${dim}" opacity=".5"/>
          <text x="55" y="70" fill="${amber}" font-family="monospace" font-size="22">HZ67</text>
          <text x="55" y="98" fill="${dim}" font-family="monospace" font-size="12">BURST INTERVAL: 67 SEC</text>
          <rect x="570" y="55" width="155" height="75" fill="#08150d" stroke="${green}"/>
          <text x="647" y="85" text-anchor="middle" fill="${green}" font-family="monospace" font-size="13">RELAY-19</text>
          <text x="647" y="108" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="11">LOCAL ONLY</text>
        `, spec.type === "relay" ? "RELAY-19 // ACCESS PUZZLE" : "RELAY-19 // PHYSICAL TRACE");

      case "kestrel":
        return frame(`
          <rect x="252" y="55" width="296" height="185" fill="#020604" stroke="${green}"/>
          <circle cx="400" cy="120" r="42" fill="none" stroke="${dim}" stroke-dasharray="5 4"/>
          <path d="M350 213 Q400 155 450 213" fill="none" stroke="${dim}" stroke-width="3"/>
          <rect x="278" y="76" width="244" height="100" fill="rgba(157,247,184,.04)"/>
          <text x="400" y="270" text-anchor="middle" fill="${amber}" font-family="monospace" font-size="14">KESTREL // FICTIONAL RECORDING</text>
        `, "HORIZON MESSAGE");

      case "audit":
        return frame(`
          <rect x="65" y="58" width="200" height="170" fill="#07130b" stroke="${green}"/>
          <rect x="300" y="58" width="200" height="170" fill="#07130b" stroke="${dim}"/>
          <rect x="535" y="58" width="200" height="170" fill="#07130b" stroke="${amber}"/>
          <text x="165" y="90" text-anchor="middle" fill="${green}" font-family="monospace" font-size="16">A // REPEATABLE</text>
          <text x="400" y="90" text-anchor="middle" fill="${green}" font-family="monospace" font-size="16">B // PROVENANCE</text>
          <text x="635" y="90" text-anchor="middle" fill="${amber}" font-family="monospace" font-size="16">C // UNVERIFIED</text>
          <text x="165" y="132" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="12">ROUTE</text>
          <text x="165" y="156" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="12">SOUTH SKY</text>
          <text x="400" y="132" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="12">WITNESS FILES</text>
          <text x="400" y="156" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="12">HZ67 SIGNAL</text>
          <text x="635" y="132" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="12">ATLAS STAMPS</text>
          <text x="635" y="156" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="12">AGENCY CLAIMS</text>
        `, "SOURCE SEPARATION");

      case "ending": {
        const label = {
          open: "OPEN PROTOCOL",
          dump: "ARCHIVE BLAST",
          recruit: "BLACK LINE",
          burn: "SILENCE"
        }[spec.variant] || "END";
        return frame(`
          <rect x="120" y="72" width="560" height="135" fill="#07130b" stroke="${spec.variant === "dump" ? amber : green}" stroke-width="2"/>
          <text x="400" y="132" text-anchor="middle" fill="${spec.variant === "dump" ? amber : green}" font-family="monospace" font-size="30">${label}</text>
          <text x="400" y="171" text-anchor="middle" fill="${dim}" font-family="monospace" font-size="14">CASE FILE CLOSED</text>
        `, "END OF CURRENT RUN");
      }

      default:
        return frame(`<text x="400" y="150" text-anchor="middle" fill="${green}" font-family="monospace">NO VISUAL</text>`, spec.type);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openModal(kind) {
    if (kind === "journal") {
      els.modalTitle.textContent = "ЖУРНАЛ РАССЛЕДОВАНИЯ";
      els.modalBody.innerHTML = state.journal.length
        ? `<ol>${state.journal.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ol>`
        : `<p class="muted">Записей пока нет.</p>`;
    }

    if (kind === "evidence") {
      els.modalTitle.textContent = "УЛИКИ";
      const have = new Set(state.evidence);
      els.modalBody.innerHTML = Object.values(story.evidence)
        .map((item) => `
          <section>
            <h3>${have.has(item.id) ? "●" : "○"} ${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.summary)}</p>
            <p class="${item.realWorld ? "tag" : "muted"}">${item.realWorld ? "ПРОВЕРЯЕМЫЙ РЕАЛЬНЫЙ ФАКТ/МЕТОД" : "ХУДОЖЕСТВЕННАЯ УЛИКА ИГРЫ"}</p>
          </section>`)
        .join("");
    }

    if (kind === "help") {
      els.modalTitle.textContent = "ПОМОЩЬ";
      els.modalBody.innerHTML = `
        <p>${escapeHtml(story.meta.disclaimer)}</p>
        <h3>Управление</h3>
        <ul>
          <li><code>1–9</code> — выбрать вариант напрямую.</li>
          <li><code>↑ / ↓</code> — перемещаться по вариантам.</li>
          <li><code>Enter</code> — подтвердить выделенный вариант.</li>
          <li><code>J</code> — журнал, <code>E</code> — улики, <code>?</code> — помощь.</li>
          <li><code>Esc</code> — закрыть окно.</li>
        </ul>
        <h3>Правило игры</h3>
        <p>Высокий показатель «МЕТОД» открывает сильнейший финал. Игра вознаграждает воспроизводимость, первичные данные и разделение фактов от эффектных, но неподтверждённых документов.</p>
        <p class="muted">Прогресс сохраняется локально в браузере автоматически.</p>`;
    }

    if (!els.modal.open) els.modal.showModal();
  }

  function closeModal() {
    if (els.modal.open) els.modal.close();
  }

  function onKeyDown(event) {
    if (els.modal.open) {
      if (event.key === "Escape") closeModal();
      return;
    }

    if (!els.puzzleForm.classList.contains("hidden") && document.activeElement === els.puzzleInput) {
      if (event.key === "Escape") els.puzzleInput.blur();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "j") { event.preventDefault(); openModal("journal"); return; }
    if (key === "e") { event.preventDefault(); openModal("evidence"); return; }
    if (key === "?" || (event.shiftKey && event.key === "/")) { event.preventDefault(); openModal("help"); return; }

    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      if (activeChoices[index]) {
        event.preventDefault();
        choose(index);
      }
      return;
    }

    if (!activeChoices.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeChoiceIndex = (activeChoiceIndex + 1) % activeChoices.length;
      syncActiveChoice();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeChoiceIndex = (activeChoiceIndex - 1 + activeChoices.length) % activeChoices.length;
      syncActiveChoice();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      choose(activeChoiceIndex);
    }
  }

  els.puzzleForm.addEventListener("submit", submitPuzzle);
  els.journalBtn.addEventListener("click", () => openModal("journal"));
  els.evidenceBtn.addEventListener("click", () => openModal("evidence"));
  els.helpBtn.addEventListener("click", () => openModal("help"));
  els.modalClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", onKeyDown);

  gotoNode(state.node);
})();
