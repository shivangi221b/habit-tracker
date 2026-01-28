/* Habit Tracker - localStorage only, no backend */
(() => {
  const STORAGE_KEY = "habitTracker.v1";

  const SAMPLE_HABITS = [
    { name: "Walk" },
    { name: "Read" },
    { name: "Meditate" },
    { name: "Exercise" },
    { name: "Journaling" },
  ];

  const $habits = document.getElementById("habits");
  const $focusContent = document.getElementById("focusContent");
  const $modal = document.getElementById("newHabitModal");
  const $modalOverlay = document.getElementById("modalOverlay");
  const $newHabitName = document.getElementById("newHabitName");
  const $newHabitDays = document.getElementById("newHabitDays");

  // UI-only state (not persisted)
  const ui = {
    openMenuIndex: null,
    openHistory: new Set(),
    newHabitOpen: false,
    newHabitMap: new Map(), // iso -> boolean (within modal)
  };

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  // YYYY-MM-DD in local time (not UTC)
  function toISODateLocal(date) {
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}-${m}-${d}`;
  }

  function fromISODateLocal(iso) {
    // iso: YYYY-MM-DD
    const [y, m, d] = iso.split("-").map((x) => Number(x));
    return new Date(y, m - 1, d);
  }

  function toUSDate(iso) {
    const dt = fromISODateLocal(iso);
    return `${pad2(dt.getMonth() + 1)}/${pad2(dt.getDate())}/${dt.getFullYear()}`;
  }

  function addDays(iso, deltaDays) {
    const dt = fromISODateLocal(iso);
    dt.setDate(dt.getDate() + deltaDays);
    return toISODateLocal(dt);
  }

  function getTodayISO() {
    return toISODateLocal(new Date());
  }

  function getLastNDaysISO(n, endIsoInclusive) {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      days.push(addDays(endIsoInclusive, -i));
    }
    return days;
  }

  function normalizeHistory(historyArr) {
    const map = new Map();
    for (const entry of historyArr || []) {
      if (!entry || typeof entry.date !== "string") continue;
      map.set(entry.date, !!entry.completed);
    }
    return map;
  }

  function historyMapToArray(map) {
    // stable-ish sort by date asc
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, completed]) => ({ date, completed: !!completed }));
  }

  function getCompletedOn(map, iso) {
    return map.get(iso) === true;
  }

  function setCompletedOn(map, iso, completed) {
    map.set(iso, !!completed);
  }

  function toggleCompletedOn(map, iso) {
    const next = !getCompletedOn(map, iso);
    setCompletedOn(map, iso, next);
    return next;
  }

  function calc7DayRate(map, todayIso) {
    const last7 = getLastNDaysISO(7, todayIso);
    let done = 0;
    for (const iso of last7) {
      if (getCompletedOn(map, iso)) done += 1;
    }
    return Math.round((done / 7) * 100);
  }

  function calcStreak(map, todayIso) {
    // Count the most recent consecutive run.
    // If today isn't done, count from yesterday (so you can still see your current streak).
    let endIso = todayIso;
    if (!getCompletedOn(map, endIso)) endIso = addDays(endIso, -1);

    let streak = 0;
    for (let back = 0; back < 365; back++) {
      const iso = addDays(endIso, -back);
      if (getCompletedOn(map, iso)) streak += 1;
      else break;
    }
    return streak;
  }

  function calendarOffsetForWeekStart(firstIso, weekStartsOn) {
    // dt.getDay(): 0=Sun ... 6=Sat
    const dt = fromISODateLocal(firstIso);
    const dow = dt.getDay();
    if (weekStartsOn === "monday") return (dow + 6) % 7;
    return dow; // sunday
  }

  function renderTwoWeekGrid({
    days,
    todayIso,
    weekStartsOn,
    isDone,
    action,
    habitName,
    habitIndex,
    ariaPrefix,
  }) {
    const offset = calendarOffsetForWeekStart(days[0], weekStartsOn);
    const cells = [];

    for (let i = 0; i < offset; i++) {
      cells.push(`<div class="day day--empty" aria-hidden="true"></div>`);
    }

    for (const iso of days) {
      const isToday = iso === todayIso;
      const done = !!isDone(iso);
      const dayClass = done ? "day day--ok" : "day day--bad";
      const todayClass = isToday ? " day--today" : "";
      const mark = done ? "✓" : "";
      const dt = fromISODateLocal(iso);
      const mmdd = `${pad2(dt.getMonth() + 1)}/${pad2(dt.getDate())}`;
      const habitIdxAttr = Number.isFinite(habitIndex) ? ` data-habit-index="${habitIndex}"` : "";

      cells.push(`
        <button
          type="button"
          class="${dayClass}${todayClass}"
          data-action="${action}"
          ${habitIdxAttr}
          data-date="${iso}"
          aria-label="${escapeAttr(ariaPrefix)}${escapeAttr(habitName)} on ${toUSDate(iso)}: ${done ? "completed" : "not completed"} (tap to toggle)"
          title="${escapeAttr(toUSDate(iso))}"
        >
          <div class="day__dow">${escapeHtml(getDowShort(iso))}</div>
          <div class="day__date">${escapeHtml(mmdd)}</div>
          <div class="day__mark">${mark}</div>
        </button>
      `);
    }

    while (cells.length % 7 !== 0) {
      cells.push(`<div class="day day--empty" aria-hidden="true"></div>`);
    }

    return cells.join("");
  }

  function getDowShort(iso) {
    const dt = fromISODateLocal(iso);
    return dt.toLocaleDateString(undefined, { weekday: "short" });
  }

  function safeLoad() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.habits)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function buildSeedData() {
    const todayIso = getTodayISO();
    const last14 = getLastNDaysISO(14, todayIso);

    // Deterministic patterns so the app looks realistic immediately.
    const patterns = [
      // Walk: strong but a few misses
      (idx) => (idx % 6 === 0 ? false : true),
      // Read: moderate
      (idx) => (idx % 2 === 0 ? true : idx % 5 === 0),
      // Meditate: low-ish
      (idx) => (idx % 3 === 0 ? true : false),
      // Exercise: sporadic
      (idx) => (idx % 4 === 0 ? true : idx % 7 === 0),
      // Journaling: improving trend
      (idx) => (idx < 6 ? idx % 4 === 0 : true),
    ];

    const habits = SAMPLE_HABITS.map((h, i) => {
      const completionHistory = last14.map((iso, idx) => ({
        date: iso,
        completed: patterns[i](idx),
      }));
      return { name: h.name, completionHistory };
    });

    return {
      version: 1,
      createdAt: new Date().toISOString(),
      habits,
    };
  }

  function getState() {
    const loaded = safeLoad();
    if (loaded) return loaded;
    const seeded = buildSeedData();
    save(seeded);
    return seeded;
  }

  function updateHabitHistoryInState(state, habitIndex, newMap) {
    state.habits[habitIndex].completionHistory = historyMapToArray(newMap);
  }

  function render() {
    const state = getState();
    const todayIso = getTodayISO();

    const computed = state.habits.map((habit) => {
      const map = normalizeHistory(habit.completionHistory);
      const todayDone = getCompletedOn(map, todayIso);
      const rate7 = calc7DayRate(map, todayIso);
      const streak = calcStreak(map, todayIso);
      return { habit, map, todayDone, rate7, streak };
    });

    if (computed.length === 0) {
      $focusContent.innerHTML = `
        <div class="focusCard" role="note" aria-label="Today's Focus habit">
          <div class="focusCard__name">No habits</div>
          <div class="focusCard__rate">—</div>
        </div>
      `;
      $habits.innerHTML = `
        <article class="habit" aria-label="No habits">
          <div class="habit__top">
            <div>
              <div class="habit__title">
                <div class="habit__name">No habits remaining</div>
              </div>
              <p class="muted" style="margin:8px 0 0;">
                You deleted all habits. Clear your site data/localStorage to restore the seeded sample habits.
              </p>
            </div>
          </div>
        </article>
      `;
      renderNewHabitModal(todayIso);
      return;
    }

    // Today's Focus:
    // 1) Look at all habits with the lowest 7-day rate.
    // 2) If any of those are incomplete today, pick one of them.
    // 3) If all of those are complete, pick the next lowest-rate habit that is incomplete today.
    // 4) If everything is complete today, show a congrats state and a smaller "tomorrow's focus" hint.
    const withIndex = computed.map((c, idx) => ({ ...c, idx }));
    let focusHtml = "";

    if (withIndex.length > 0) {
      let minRate = withIndex[0].rate7;
      for (const c of withIndex) {
        if (c.rate7 < minRate) minRate = c.rate7;
      }

      const lowest = withIndex.filter((c) => c.rate7 === minRate);
      const lowestIncomplete = lowest.filter((c) => !c.todayDone);
      let focus = null;

      if (lowestIncomplete.length > 0) {
        lowestIncomplete.sort((a, b) => a.rate7 - b.rate7 || a.idx - b.idx);
        focus = lowestIncomplete[0];
      } else {
        const othersIncomplete = withIndex.filter((c) => !c.todayDone && c.rate7 > minRate);
        if (othersIncomplete.length > 0) {
          othersIncomplete.sort((a, b) => a.rate7 - b.rate7 || a.idx - b.idx);
          focus = othersIncomplete[0];
        }
      }

      // Always compute a "tomorrow" suggestion based on lowest rate.
      let tomorrowIdx = 0;
      for (let i = 1; i < withIndex.length; i++) {
        if (withIndex[i].rate7 < withIndex[tomorrowIdx].rate7) tomorrowIdx = i;
      }
      const tomorrow = withIndex[tomorrowIdx];

      if (focus) {
        const focusMsg = focus.todayDone
          ? "Nice! Streak protected 🔥"
          : "Quick win: hit “Complete now”.";
        focusHtml = `
          <div class="focusHero" role="note" aria-label="Today's Focus habit">
            <div class="focusHero__content">
              <div class="focusPill">◎ Today’s Focus</div>
              <div class="focusHero__name">${escapeHtml(focus.habit.name)}</div>
              <div class="focusHero__msg">
                This habit needs some love. Your 7-day completion rate is at <strong>${focus.rate7}%</strong>.
                Let’s bump that up today!
              </div>
              <button
                type="button"
                class="focusBtn"
                data-action="focus-toggle"
                data-habit-index="${focus.idx}"
                aria-label="${focus.todayDone ? "Mark incomplete for today" : "Complete now"} for ${escapeAttr(focus.habit.name)}"
              >
                ${focus.todayDone ? "Done today ✅" : "Complete now →"}
              </button>
              <div class="focusHero__hint">${escapeHtml(focusMsg)}</div>
            </div>
          </div>
        `;
      } else {
        // All habits are complete today.
        focusHtml = `
          <div class="focusHero" role="note" aria-label="All habits completed today">
            <div class="focusHero__content">
              <div class="focusPill">🔥 Great job</div>
              <div class="focusHero__name">Awesome you're done for today!</div>
              <div class="focusHero__msg">Take a breather, you’ve earned it.</div>
              <div class="focusHero__tomorrow">
                Tomorrow’s focus: <strong>${escapeHtml(tomorrow.habit.name)}</strong>
                (${tomorrow.rate7}% in last 7 days).
              </div>
            </div>
          </div>
        `;
      }
    }

    $focusContent.innerHTML = focusHtml;

    const last14 = getLastNDaysISO(14, todayIso);

    $habits.innerHTML = computed
      .map(({ habit, todayDone, rate7, streak }, idx) => {
        const streakLabel = `🔥 ${streak} day streak`;
        const rateLabel = `📈 ${rate7}% in last 7 days`;
        const todayLabel = todayDone ? "Completed today" : "Incomplete today";
        const pillClass = todayDone ? "pill--ok" : "pill--bad";
        const isMenuOpen = ui.openMenuIndex === idx;
        const isHistoryOpen = ui.openHistory.has(idx);
        const historyLabel = isHistoryOpen ? "Hide history" : "Edit history";

        const daysHtml = renderTwoWeekGrid({
          days: last14,
          todayIso,
          weekStartsOn: "sunday",
          isDone: (iso) => getCompletedFromState(state, idx, iso),
          action: "toggle-date",
          habitName: habit.name,
          habitIndex: idx,
          ariaPrefix: "",
        });

        return `
          <article class="habit ${todayDone ? "habit--done" : ""}" aria-label="Habit: ${escapeAttr(habit.name)}">
            <div class="habit__top">
              <div>
                <div class="habit__title">
                  <div class="habit__name">${escapeHtml(habit.name)}</div>
                  <span class="pill ${pillClass}" aria-label="${todayLabel}">
                    ${todayDone ? "✓ Completed today" : "× Not done yet"}
                  </span>
                </div>
                <div class="habit__stats">
                  <span class="pill" aria-label="Current streak">${escapeHtml(streakLabel)}</span>
                  <span class="pill" aria-label="7-day completion rate">${escapeHtml(rateLabel)}</span>
                </div>
              </div>

              <div class="habit__actions">
                <button
                  type="button"
                  class="menuBtn"
                  data-action="menu-toggle"
                  data-habit-index="${idx}"
                  aria-label="More options for ${escapeAttr(habit.name)}"
                  aria-haspopup="menu"
                  aria-expanded="${isMenuOpen ? "true" : "false"}"
                  title="More"
                >
                  ⋮
                </button>

                <div class="menu ${isMenuOpen ? "menu--open" : ""}" role="menu" aria-label="Options">
                  <button
                    type="button"
                    class="menuItem"
                    data-action="menu-edit-name"
                    data-habit-index="${idx}"
                    role="menuitem"
                  >
                    Edit name
                  </button>
                  <button
                    type="button"
                    class="menuItem"
                    data-action="menu-toggle-history"
                    data-habit-index="${idx}"
                    role="menuitem"
                  >
                    ${escapeHtml(historyLabel)}
                  </button>
                  <button
                    type="button"
                    class="menuItem menuItem--danger"
                    data-action="menu-delete"
                    data-habit-index="${idx}"
                    role="menuitem"
                  >
                    Delete habit
                  </button>
                </div>

                <button
                  type="button"
                  class="toggleBtn ${todayDone ? "toggleBtn--ok" : "toggleBtn--bad"}"
                  data-action="toggle-today"
                  data-habit-index="${idx}"
                  aria-label="Toggle ${escapeAttr(habit.name)} for today (${toUSDate(todayIso)})"
                  title="Toggle today"
                >
                  ${todayDone ? "✓" : "×"}
                </button>
              </div>
            </div>

            <div class="habit__calendar" ${isHistoryOpen ? "" : "hidden"}>
              <div class="calendarHeader">
                <div class="calendarHeader__title">Calendar (last 14 days)</div>
              </div>
              <div class="calendarHeader__hint">Tap any day to mark done/undone</div>
              <div class="days" role="grid" aria-label="Calendar for ${escapeAttr(habit.name)}">
                ${daysHtml}
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    renderNewHabitModal(todayIso);
  }

  function ensureNewHabitMap(todayIso) {
    // Ensure the modal map has the last 14 days as keys (default false).
    const last14 = getLastNDaysISO(14, todayIso);
    for (const iso of last14) {
      if (!ui.newHabitMap.has(iso)) ui.newHabitMap.set(iso, false);
    }
    // Drop older keys so the modal stays scoped + predictable.
    for (const iso of Array.from(ui.newHabitMap.keys())) {
      if (!last14.includes(iso)) ui.newHabitMap.delete(iso);
    }
  }

  function renderNewHabitModal(todayIso) {
    if (!$modal || !$modalOverlay) return;
    if (!ui.newHabitOpen) {
      $modal.hidden = true;
      $modalOverlay.hidden = true;
      return;
    }
    $modal.hidden = false;
    $modalOverlay.hidden = false;

    ensureNewHabitMap(todayIso);

    if ($newHabitName && $newHabitName.value.trim() === "") {
      // Keep whatever the user typed; only set a helpful placeholder focus once.
      $newHabitName.placeholder = "e.g., Read 20 pages";
    }

    const days = getLastNDaysISO(14, todayIso);
    $newHabitDays.innerHTML = renderTwoWeekGrid({
      days,
      todayIso,
      weekStartsOn: "sunday",
      isDone: (iso) => ui.newHabitMap.get(iso) === true,
      action: "newhabit-toggle-date",
      habitName: "New habit",
      habitIndex: null,
      ariaPrefix: "",
    });
  }

  function getCompletedFromState(state, habitIndex, iso) {
    const map = normalizeHistory(state.habits[habitIndex].completionHistory);
    return getCompletedOn(map, iso);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function handleClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) {
      // Close any open menu when clicking outside.
      if (ui.openMenuIndex !== null && !e.target.closest(".habit__actions")) {
        ui.openMenuIndex = null;
        render();
      }
      return;
    }
    const action = btn.dataset.action;
    const habitIndex = Number(btn.dataset.habitIndex);

    if (action === "add-habit") {
      ui.openMenuIndex = null;
      ui.newHabitOpen = true;
      ui.newHabitMap = new Map();
      if ($newHabitName) $newHabitName.value = "";
      render();
      // Focus the name input on next tick (after render)
      setTimeout(() => $newHabitName?.focus(), 0);
      return;
    }

    if (action === "newhabit-cancel") {
      ui.newHabitOpen = false;
      ui.newHabitMap = new Map();
      if ($newHabitName) $newHabitName.value = "";
      render();
      return;
    }

    if (action === "newhabit-toggle-date") {
      const iso = btn.dataset.date;
      if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      const cur = ui.newHabitMap.get(iso) === true;
      ui.newHabitMap.set(iso, !cur);
      render();
      return;
    }

    if (action === "newhabit-save") {
      const state = getState();
      const todayIso = getTodayISO();
      ensureNewHabitMap(todayIso);

      const name = String($newHabitName?.value || "").trim();
      if (!name) {
        window.alert("Please enter a habit name.");
        $newHabitName?.focus();
        return;
      }

      const last14 = getLastNDaysISO(14, todayIso);
      const completionHistory = last14.map((iso) => ({
        date: iso,
        completed: ui.newHabitMap.get(iso) === true,
      }));

      state.habits.unshift({ name, completionHistory });
      save(state);

      ui.newHabitOpen = false;
      ui.openMenuIndex = null;
      ui.newHabitMap = new Map();
      if ($newHabitName) $newHabitName.value = "";
      render();
      return;
    }

    // If the action requires a habit index, enforce it below.
    if (!Number.isFinite(habitIndex)) return;

    if (action === "menu-toggle") {
      ui.openMenuIndex = ui.openMenuIndex === habitIndex ? null : habitIndex;
      render();
      return;
    }

    const state = getState();
    const todayIso = getTodayISO();
    const habit = state.habits[habitIndex];
    if (!habit) return;

    const map = normalizeHistory(habit.completionHistory);

    if (action === "menu-edit-name") {
      ui.openMenuIndex = null;
      const next = window.prompt("Edit habit name:", habit.name);
      if (next == null) {
        render();
        return;
      }
      const trimmed = String(next).trim();
      if (!trimmed) {
        render();
        return;
      }
      habit.name = trimmed;
      save(state);
      render();
      return;
    }

    if (action === "menu-delete") {
      ui.openMenuIndex = null;
      const ok = window.confirm(`Delete habit "${habit.name}"? This cannot be undone.`);
      if (!ok) {
        render();
        return;
      }
      state.habits.splice(habitIndex, 1);
      // UI indices shift; reset UI state safely.
      ui.openHistory.clear();
      save(state);
      render();
      return;
    }

    if (action === "menu-toggle-history") {
      ui.openMenuIndex = null;
      if (ui.openHistory.has(habitIndex)) ui.openHistory.delete(habitIndex);
      else ui.openHistory.add(habitIndex);
      render();
      return;
    }

    if (action === "toggle-today") {
      toggleCompletedOn(map, todayIso);
      updateHabitHistoryInState(state, habitIndex, map);
      save(state);
      ui.openMenuIndex = null;
      render();
      return;
    }

    if (action === "toggle-date") {
      const iso = btn.dataset.date;
      if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      // Allow toggling any day shown in calendar, including past and today.
      toggleCompletedOn(map, iso);
      updateHabitHistoryInState(state, habitIndex, map);
      save(state);
      ui.openMenuIndex = null;
      render();
      return;
    }

    if (action === "focus-toggle") {
      // Same as toggling today for the focused habit.
      toggleCompletedOn(map, todayIso);
      updateHabitHistoryInState(state, habitIndex, map);
      save(state);
      ui.openMenuIndex = null;
      render();
      return;
    }
  }

  function handleOverlayClick(e) {
    if (e.target !== $modalOverlay) return;
    ui.newHabitOpen = false;
    ui.newHabitMap = new Map();
    if ($newHabitName) $newHabitName.value = "";
    render();
  }

  function init() {
    document.addEventListener("click", handleClick);
    $modalOverlay?.addEventListener("click", handleOverlayClick);
    render();
  }

  init();
})();
