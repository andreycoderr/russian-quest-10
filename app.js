(function () {
  "use strict";

  const STORE_KEY = "rusquest10:v1";
  const STATIONS = (window.QUEST && window.QUEST.stations) || [];
  const TOTAL_Q = STATIONS.reduce((n, s) => n + s.questions.length, 0);
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- helpers ----------
  function $(sel) { return document.querySelector(sel); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  function countUp(el, to, dur) {
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    if (reduceMotion || from === to || document.hidden) { el.textContent = to; return; }
    const t0 = performance.now();
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * ease);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // safety net: guarantee the final value even if rAF is throttled (background tab)
    setTimeout(() => { el.textContent = to; }, dur + 80);
  }

  // ---------- progress ----------
  function loadProgress() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); }
    catch (e) { /* ignore */ }
    return { best: {}, done: {} };
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }
  let progress = loadProgress();

  // a station is "passed" once you score at least half of its stars
  function passReq(total) { return Math.ceil(total / 2); }
  function isPassed(index) {
    const s = STATIONS[index];
    return 2 * (progress.best[s.id] || 0) >= s.questions.length;
  }
  // the next station unlocks only after the previous one is passed (≥ half stars)
  function isUnlocked(index) { return index === 0 || isPassed(index - 1); }
  function earnedStars() { return STATIONS.reduce((n, s) => n + (progress.best[s.id] || 0), 0); }
  function firstPlayableIndex() {
    for (let i = 0; i < STATIONS.length; i++) {
      if (isUnlocked(i) && !isPassed(i)) return i; // first reachable station not yet passed
    }
    return STATIONS.length - 1; // everything passed → last station
  }

  // ---------- views ----------
  const views = { map: $("#view-map"), station: $("#view-station"), result: $("#view-result") };
  function showView(name) {
    Object.keys(views).forEach(k => { views[k].hidden = (k !== name); });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }
  function goMap() { renderMap(); showView("map"); }

  // ============================================================
  //  MAP
  // ============================================================
  function renderMap() {
    const earned = earnedStars();
    countUp($("#stars-earned"), earned, 700);
    $("#stars-total").textContent = TOTAL_Q;

    const ring = $("#orb-fill");
    const C = 2 * Math.PI * 52;
    ring.style.strokeDasharray = C.toFixed(1);
    ring.style.strokeDashoffset = (C * (1 - (TOTAL_Q ? earned / TOTAL_Q : 0))).toFixed(1);

    // start/continue label
    const anyProgress = earned > 0;
    const startLabel = $("#start-label");
    if (startLabel) startLabel.textContent = STATIONS.every(s => progress.done[s.id]) ? "Пройти ещё раз" : (anyProgress ? "Продолжить квест" : "Начать квест");

    renderRankBanner(earned);

    const grid = $("#map-grid");
    grid.innerHTML = "";
    STATIONS.forEach((s, i) => {
      const unlocked = isUnlocked(i);
      const done = !!progress.done[s.id];
      const passed = isPassed(i);
      const best = progress.best[s.id] || 0;
      const total = s.questions.length;

      const card = document.createElement(unlocked ? "button" : "div");
      card.className = "station-card" + (unlocked ? "" : " is-locked") + (passed ? " is-done" : "");
      card.style.setProperty("--hue", s.hue);
      card.style.setProperty("--d", (i * 0.05) + "s");
      if (unlocked) {
        card.type = "button";
        card.addEventListener("click", () => openStation(i));
      } else {
        card.setAttribute("aria-disabled", "true");
      }
      const pct = total ? Math.round((best / total) * 100) : 0;
      const status = passed ? '<span class="sc-status ok">✓ пройдена</span>'
        : (unlocked && done) ? '<span class="sc-status retry">↻ повторить</span>'
        : (!unlocked) ? '<span class="sc-status">🔒</span>' : "";
      const prevTotal = i > 0 ? STATIONS[i - 1].questions.length : 0;
      card.innerHTML = `
        <div class="sc-top">
          <span class="sc-tag">${s.tag}</span>
          <span class="sc-num">Станция&nbsp;${i + 1}</span>
          ${status}
        </div>
        <h3 class="sc-title">${s.title}</h3>
        <p class="sc-sub">${s.subtitle}</p>
        <div class="sc-foot">
          <div class="sc-bar"><span style="width:${pct}%"></span></div>
          <span class="sc-stars">${best}/${total} ⭐</span>
        </div>
        ${unlocked ? "" : `<p class="sc-lock-note">🔒 Наберите ≥&nbsp;${passReq(prevTotal)} из&nbsp;${prevTotal}&nbsp;⭐ на станции&nbsp;${i}</p>`}
      `;
      grid.appendChild(card);
    });
  }

  function rankFor(earned) {
    const pct = TOTAL_Q ? earned / TOTAL_Q : 0;
    if (earned === 0) return null;
    if (pct >= 0.9) return { title: "Магистр слова", note: "Блестящее владение нормами русского языка!" };
    if (pct >= 0.75) return { title: "Знаток русского языка", note: "Очень уверенный результат — до вершины совсем близко." };
    if (pct >= 0.55) return { title: "Уверенный уровень", note: "Хорошая база. Повтори станции с ошибками — и будет отлично." };
    return { title: "Начало пути", note: "Главное — начать. Разбирай объяснения и возвращайся за звёздами." };
  }
  function renderRankBanner(earned) {
    const banner = $("#rank-banner");
    const r = rankFor(earned);
    if (!r) { banner.hidden = true; return; }
    const allDone = STATIONS.every(s => progress.done[s.id]);
    banner.hidden = false;
    banner.innerHTML = `
      <span class="rb-label">${allDone ? "Квест пройден · твой ранг" : "Текущий ранг"}</span>
      <span class="rb-title">${r.title}</span>
      <span class="rb-note">${r.note}</span>`;
  }

  // ============================================================
  //  STATION PLAY
  // ============================================================
  let cur = null;        // { index, station, order, qi, correct, streak, answered }
  let lastFinished = 0;  // index of last finished station (for result buttons)

  function openStation(index) {
    const station = STATIONS[index];
    cur = { index, station, order: shuffle(station.questions.map((_, k) => k)), qi: 0, correct: 0, streak: 0, answered: false };
    $("#st-tag").textContent = station.tag;
    $("#st-tag").style.setProperty("--hue", station.hue);
    $("#st-name").textContent = station.title;
    $("#st-score").textContent = "0";
    $("#st-score-total").textContent = station.questions.length;
    updateStreak(0);
    showView("station");
    renderQuestion(false);
  }

  function updateStreak(n) {
    const el = $("#streak");
    $("#streak-n").textContent = n;
    if (n >= 2) {
      el.hidden = false;
      el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
    } else {
      el.hidden = true;
    }
  }

  function renderQuestion(animate) {
    const { station, order, qi } = cur;
    const q = station.questions[order[qi]];
    cur.answered = false;

    $("#qnum").textContent = qi + 1;
    $("#qtotal").textContent = station.questions.length;
    $("#track-fill").style.width = (qi / station.questions.length * 100) + "%";

    if (animate && !reduceMotion) {
      const card = $("#qcard");
      card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
    }

    $("#qtext").innerHTML = q.q;
    const passage = $("#qpassage");
    if (q.passage) { passage.hidden = false; passage.innerHTML = q.passage; }
    else { passage.hidden = true; passage.innerHTML = ""; }

    const fb = $("#feedback");
    fb.hidden = true; fb.className = "feedback";
    $("#next-btn").hidden = true;
    $("#next-label").textContent = (qi + 1 < station.questions.length) ? "Следующий вопрос" : "Завершить станцию";

    const board = $("#board");
    board.innerHTML = "";
    board.classList.toggle("board-compact", q.options.length === 2);
    const opts = shuffle(q.options.map((text, k) => ({ text, correct: k === q.answer })));
    opts.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.style.setProperty("--d", (idx * 0.05) + "s");
      btn.innerHTML = `<span class="opt-text">${opt.text}</span>`;
      btn.addEventListener("click", () => selectOption(btn, opt, board));
      board.appendChild(btn);
    });
  }

  function floatStar(el) {
    if (reduceMotion) return;
    const r = el.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "floatstar";
    f.textContent = "+1 ⭐";
    f.style.left = (r.left + r.width / 2 - 18) + "px";
    f.style.top = (r.top + 6) + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  function selectOption(btn, opt, board) {
    if (cur.answered) return;
    cur.answered = true;

    const buttons = Array.from(board.querySelectorAll(".option"));
    buttons.forEach(b => b.classList.add("locked"));
    const q = cur.station.questions[cur.order[cur.qi]];

    if (opt.correct) {
      btn.classList.add("correct");
      cur.correct++;
      cur.streak++;
      countUp($("#st-score"), cur.correct, 300);
      updateStreak(cur.streak);
      floatStar(btn);
    } else {
      btn.classList.add("wrong");
      cur.streak = 0;
      updateStreak(0);
      buttons.forEach(b => {
        if (b.querySelector(".opt-text").innerHTML === q.options[q.answer]) b.classList.add("correct");
      });
    }

    const streakNote = (opt.correct && cur.streak >= 3) ? ` <b>· серия ${cur.streak} 🔥</b>` : "";
    const fb = $("#feedback");
    fb.hidden = false;
    fb.className = "feedback " + (opt.correct ? "ok" : "no");
    fb.innerHTML = `
      <span class="fb-head">${opt.correct ? "✓ Верно" + streakNote : "✗ Ошибка"}</span>
      <span class="fb-body">${q.explain}</span>`;
    $("#next-btn").hidden = false;
    $("#next-btn").focus();
  }

  function nextQuestion() {
    if (!cur || !cur.answered) return;
    if (cur.qi + 1 < cur.station.questions.length) {
      cur.qi++;
      renderQuestion(true);
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      finishStation();
    }
  }

  // ============================================================
  //  RESULT
  // ============================================================
  function finishStation() {
    const { station, index, correct } = cur;
    const total = station.questions.length;
    if (correct > (progress.best[station.id] || 0)) progress.best[station.id] = correct;
    progress.done[station.id] = true;
    saveProgress();
    lastFinished = index;

    const isLast = index === STATIONS.length - 1;
    const pct = correct / total;
    const req = passReq(total);
    const passed = isPassed(index); // based on best score (updated above)

    let badge, title;
    if (!passed) { badge = "🔁"; title = "Почти получилось!"; }
    else if (pct === 1) { badge = "🏆"; title = "Безупречно!"; }
    else if (pct >= 0.7) { badge = "⭐"; title = "Отличная работа!"; }
    else { badge = "👍"; title = "Станция пройдена!"; }

    $("#result-badge").textContent = badge;
    $("#result-title").textContent = title;
    $("#result-score").innerHTML =
      `<b>${correct}</b> из <b>${total}</b> ${plural(total, "звезды", "звёзд", "звёзд")} на станции «${station.title}»`;

    let sub;
    if (!passed) {
      sub = `Чтобы открыть следующую станцию, наберите не меньше ${req} из ${total} ⭐. Загляни в объяснения и попробуй ещё раз — получится!`;
    } else {
      if (pct === 1) sub = "Все ответы верны — тема освоена на отлично.";
      else if (pct >= 0.7) sub = "Почти всё верно. Перечитай объяснения к промахам — и будет идеально.";
      else sub = "Порог пройден! Можно идти дальше или пройти заново для большего счёта.";
      sub += isLast ? " Это была последняя станция квеста!" : " Открыта следующая станция!";
    }
    $("#result-sub").textContent = sub;

    // next station only when this one is passed (≥ half) and it isn't the last
    $("#result-next").hidden = isLast || !passed;

    showView("result");
    if (passed && pct >= 0.7) confetti(pct === 1 ? 1 : 0.7);
  }

  // ============================================================
  //  CONFETTI (canvas, no deps)
  // ============================================================
  const cvs = $("#confetti");
  const ctx = cvs.getContext("2d");
  let parts = [], raf = null;
  function sizeCanvas() { cvs.width = innerWidth; cvs.height = innerHeight; }
  function confetti(intensity) {
    if (reduceMotion) return;
    sizeCanvas();
    const colors = ["#f3c969", "#e0a23f", "#8b7bf0", "#54d6d0", "#5fdca0", "#ffffff"];
    const n = Math.round(140 * intensity);
    for (let i = 0; i < n; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 220,
        y: innerHeight * 0.32,
        vx: (Math.random() - 0.5) * 11,
        vy: Math.random() * -13 - 4,
        g: 0.32 + Math.random() * 0.15,
        s: 5 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[Math.floor(Math.random() * colors.length)],
        life: 0
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    parts.forEach(p => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - p.life / 150);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    });
    parts = parts.filter(p => p.y < cvs.height + 40 && p.life < 150);
    if (parts.length) raf = requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, cvs.width, cvs.height); raf = null; }
  }
  addEventListener("resize", () => { if (raf) sizeCanvas(); });

  // ============================================================
  //  EVENTS (attached once — robust)
  // ============================================================
  $("#next-btn").addEventListener("click", nextQuestion);
  $("#back-btn").addEventListener("click", goMap);
  $("#start-btn").addEventListener("click", () => openStation(firstPlayableIndex()));
  $("#result-next").addEventListener("click", () => openStation(Math.min(lastFinished + 1, STATIONS.length - 1)));
  $("#result-retry").addEventListener("click", () => openStation(lastFinished));
  $("#result-map").addEventListener("click", goMap);
  $("#reset-progress").addEventListener("click", () => {
    if (confirm("Сбросить весь прогресс квеста? Собранные звёзды и открытые станции обнулятся.")) {
      progress = { best: {}, done: {} };
      saveProgress();
      renderMap();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (views.station.hidden) return;
    if ((e.key === "Enter" || e.key === "ArrowRight") && !$("#next-btn").hidden) {
      e.preventDefault();
      nextQuestion();
    }
  });

  // ---------- init ----------
  const chipQ = $("#chip-q"); if (chipQ) chipQ.textContent = TOTAL_Q;
  renderMap();
  showView("map");
})();
