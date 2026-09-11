// Budget Pulse — wires the UI together. Nothing here talks to any backend:
// it's Config (localStorage) + Auth (Google Identity Services) + SheetsApi
// (direct fetch to Google) + DataSource (live or demo CRUD adapter) +
// Dashboard (parse/compute/render).

(() => {
  let model = null;
  let dataSource = ""; // "live" | "demo"
  let dataAdapter = null; // current DataSource adapter (live or demo)
  let demoWorkbook = null; // the mutable in-memory workbook, demo mode only

  let editingCatRef = null; // ref of the category being edited, or null when adding

  const DEFAULT_BLANK_ROWS = 8;
  const ADD_BLANK_ROWS = 5;

  // A ref's `index` is only valid until the next write to that same tab —
  // deleting row 3 shifts what used to be row 4 down to row 3, in a real
  // Google Sheet exactly as much as in the in-memory demo one. Two writes
  // fired back-to-back (e.g. clicking Delete on two different rows before
  // the table re-renders) would race on stale indices and could silently
  // no-op or, worse, hit the wrong row. Serializing every write through
  // this guard means the second click simply waits its turn instead.
  let writeBusy = false;
  async function runExclusive(fn) {
    if (writeBusy) return;
    writeBusy = true;
    try {
      await fn();
    } finally {
      writeBusy = false;
    }
  }

  const els = {};
  function cacheEls() {
    [
      "empty-state", "dashboard", "error-banner",
      "settings-modal", "input-client-id", "input-spreadsheet-id", "input-budget-tab", "input-year",
      "settings-btn", "settings-cancel", "settings-form",
      "signin-btn", "empty-signin-btn", "demo-btn", "signed-in-badge",
      "month-select", "refresh-btn",
      "theme-toggle",
      "side-nav", "section-dashboard", "section-transactions", "section-categories",
      "categories-tbody", "add-category-btn",
      "category-edit-modal", "category-edit-form", "category-edit-title",
      "cat-is-food-sub", "cat-name-label", "cat-name", "cat-amount", "cat-error", "cat-delete", "cat-cancel", "cat-save",
      "txn-section-month", "txn-grid-tbody", "txn-grid-error", "add-grid-rows-btn", "save-transactions-btn",
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function showError(message) {
    els["error-banner"].textContent = message;
    els["error-banner"].hidden = false;
  }
  function clearError() {
    els["error-banner"].hidden = true;
    els["error-banner"].textContent = "";
  }

  // ---------- Section navigation ----------
  function showSection(name) {
    ["dashboard", "transactions", "categories"].forEach((s) => {
      els[`section-${s}`].hidden = s !== name;
    });
    Array.from(els["side-nav"].querySelectorAll(".nav-item")).forEach((btn) => {
      if (btn.dataset.section === name) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    if (name === "categories" && model) renderCategoriesTable();
    if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
  }

  function initNav() {
    Array.from(els["side-nav"].querySelectorAll(".nav-item")).forEach((btn) => {
      btn.addEventListener("click", () => showSection(btn.dataset.section));
    });
    window.addEventListener("hashchange", () => {
      const section = location.hash.slice(1);
      if (["dashboard", "transactions", "categories"].includes(section)) showSection(section);
    });
    const initial = location.hash.slice(1);
    showSection(["dashboard", "transactions", "categories"].includes(initial) ? initial : "dashboard");
  }

  // ---------- Settings modal ----------
  function loadSettingsIntoForm() {
    const s = Config.load();
    els["input-client-id"].value = s.clientId;
    els["input-spreadsheet-id"].value = s.spreadsheetId;
    els["input-budget-tab"].value = s.budgetTab;
    els["input-year"].value = s.year;
  }

  function openSettings() {
    loadSettingsIntoForm();
    els["settings-modal"].showModal();
  }

  function saveSettings() {
    const yearValue = parseInt(els["input-year"].value, 10);
    Config.save({
      clientId: els["input-client-id"].value.trim(),
      spreadsheetId: els["input-spreadsheet-id"].value.trim(),
      budgetTab: els["input-budget-tab"].value.trim() || "Budget",
      year: isNaN(yearValue) ? new Date().getFullYear() : yearValue,
    });
    // Settings that affect a live connection (spreadsheet, budget tab, year)
    // only take effect on the adapter/model once we reload with them.
    if (model && dataSource === "live") loadLive({ interactive: false });
    else if (model) renderSelectedMonth();
  }

  function currentYear() {
    return dataSource === "demo" ? DemoData.year : Config.load().year;
  }

  // ---------- Data loading ----------
  async function loadLive({ interactive = true } = {}) {
    clearError();
    const settings = Config.load();
    if (!settings.clientId || !settings.spreadsheetId) {
      openSettings();
      return;
    }
    try {
      await Auth.requestToken({ interactive });
      dataAdapter = DataSource.liveAdapter({
        spreadsheetId: settings.spreadsheetId,
        budgetTab: settings.budgetTab,
        year: settings.year,
      });
      model = await dataAdapter.loadModel();
      dataSource = "live";
      els["signed-in-badge"].hidden = false;
      els["signed-in-badge"].textContent = "🟢 Connected";
      els["signin-btn"].hidden = true;
      renderModel();
    } catch (err) {
      if (interactive) showError(err.message || String(err));
      // A failed silent attempt on page load is expected (no cached session) — stay quiet.
    }
  }

  async function loadDemo() {
    clearError();
    demoWorkbook = DemoData.createWorkbook();
    dataAdapter = DataSource.demoAdapter(demoWorkbook, DemoData.year);
    dataSource = "demo";
    els["signed-in-badge"].hidden = false;
    els["signed-in-badge"].textContent = "🧪 Sample data";
    model = await dataAdapter.loadModel();
    renderModel();
  }

  /** Re-fetches (live) or re-parses (demo) after any CRUD write, then
   *  re-renders. `focusMonthKey`, if given and still present, is what the
   *  month selector lands on afterwards — otherwise the current selection
   *  is preserved (never silently jumps to the latest month just because
   *  you edited something in an older one). */
  async function refreshModel(focusMonthKey) {
    model = await dataAdapter.loadModel();
    renderModel(focusMonthKey);
  }

  // ---------- Rendering ----------
  function renderModel(focusMonthKey) {
    els["empty-state"].hidden = true;
    els["dashboard"].hidden = false;

    // The picker always offers all 12 months of the configured year — not
    // just tabs that already exist — so you can jump straight to a month
    // that hasn't been started yet and log its first transaction; Save
    // creates that tab automatically (see DataSource.ensureMonthTab). The
    // trend chart below still only reflects months that actually have data.
    const select = els["month-select"];
    const previousValue = select.value;
    select.innerHTML = "";
    const year = currentYear();
    const allMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    allMonths.slice().reverse().forEach((monthKey) => {
      const opt = document.createElement("option");
      opt.value = monthKey;
      opt.textContent = Dashboard.monthLabel(monthKey);
      select.appendChild(opt);
    });
    const todayMonthKey = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const target = (focusMonthKey && allMonths.includes(focusMonthKey)) ? focusMonthKey
      : (allMonths.includes(previousValue) ? previousValue
        : (model.months.length ? model.months[model.months.length - 1]
          : (allMonths.includes(todayMonthKey) ? todayMonthKey : allMonths[0])));
    select.value = target;

    Dashboard.renderTrend(Dashboard.computeTrend(model));
    renderSelectedMonth();
    if (!els["section-categories"].hidden) renderCategoriesTable();
  }

  // Food's sub-category breakdown (Breakfast/Lunch/Dinner budgets) is
  // nested directly under Food's own row in the category meters — scoped
  // to whichever month is selected, same as everything else on this panel.
  // Only the current real month also gets a "RM X/day left" figure on each
  // row, based on days left in that calendar month (see
  // Dashboard.computeFoodBreakdown for why).
  function renderSelectedMonth() {
    const monthKey = els["month-select"].value;
    const computed = Dashboard.computeMonth(monthKey, model);
    Dashboard.renderStats(computed.totals);
    const foodBreakdown = Dashboard.computeFoodBreakdown(monthKey, model);
    Dashboard.renderMeters(computed.categories, foodBreakdown);
    els["txn-section-month"].textContent = Dashboard.monthLabel(monthKey);
    renderTransactionsGrid(monthKey);
  }

  // ---------- Transactions: Excel-like grid, add/edit/delete ----------
  function buildCategorySelectEl() {
    const select = document.createElement("select");
    select.className = "grid-cell grid-category";
    const blank = document.createElement("option");
    blank.value = ""; blank.textContent = "";
    select.appendChild(blank);
    const names = Array.from(model.budgets.keys());
    if (!names.includes("Food")) names.unshift("Food");
    names.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      select.appendChild(opt);
    });
    return select;
  }

  function buildSubcategorySelectEl() {
    const select = document.createElement("select");
    select.className = "grid-cell grid-subcategory";
    const blank = document.createElement("option");
    blank.value = ""; blank.textContent = "(none)";
    select.appendChild(blank);
    Array.from(model.foodSubBudgets.keys()).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      select.appendChild(opt);
    });
    return select;
  }

  function ensureSelectHasOption(select, value) {
    if (!value) return;
    if (!Array.from(select.options).some((o) => o.value === value)) {
      const opt = document.createElement("option");
      opt.value = value; opt.textContent = value;
      select.appendChild(opt);
    }
  }

  /** Builds one grid row. `existing` (an expense model entry) pre-fills and
   *  marks the row as editable-in-place; omitted, it's a blank row ready
   *  for new data. The Day field is just the day-of-month number (1-31),
   *  matching the sheet's own column — the month/year come from whichever
   *  month tab is currently selected, never typed per-row. */
  function buildGridRow(existing) {
    const tr = document.createElement("tr");
    tr.className = existing ? "grid-row-existing" : "grid-row-new";

    const dayInput = document.createElement("input");
    dayInput.type = "number"; dayInput.min = "1"; dayInput.max = "31"; dayInput.step = "1";
    dayInput.className = "grid-cell grid-day";
    dayInput.placeholder = "Day";
    dayInput.value = existing ? String(parseInt(existing.date.slice(8, 10), 10)) : "";

    const catSelect = buildCategorySelectEl();
    const notesInput = document.createElement("input");
    notesInput.type = "text";
    notesInput.className = "grid-cell grid-notes";
    notesInput.value = existing ? (existing.notes || "") : "";

    const subSelect = buildSubcategorySelectEl();

    const expenseInput = document.createElement("input");
    expenseInput.type = "number"; expenseInput.step = "0.01"; expenseInput.min = "0";
    expenseInput.className = "grid-cell grid-expense";
    expenseInput.value = existing ? existing.amount : "";

    if (existing) {
      ensureSelectHasOption(catSelect, existing.category);
      catSelect.value = existing.category;
      if (existing.subcategory) ensureSelectHasOption(subSelect, existing.subcategory);
      subSelect.value = existing.subcategory || "";
    }

    function updateSubEnabled() {
      const isFood = catSelect.value === "Food";
      subSelect.disabled = !isFood;
      if (!isFood) subSelect.value = "";
    }
    catSelect.addEventListener("change", updateSubEnabled);
    updateSubEnabled();

    [dayInput, catSelect, notesInput, subSelect, expenseInput].forEach((el) => {
      const td = document.createElement("td");
      td.appendChild(el);
      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    actionTd.className = "actions-col";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "grid-row-delete";
    delBtn.textContent = "✕";
    delBtn.title = existing ? "Delete this transaction" : "Remove this row";
    delBtn.addEventListener("click", () => {
      if (existing) deleteTransactionRow(existing);
      else tr.remove();
    });
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    if (existing) {
      tr.dataset.ref = JSON.stringify(existing.ref);
      tr.dataset.original = JSON.stringify({
        day: parseInt(existing.date.slice(8, 10), 10),
        category: existing.category,
        notes: existing.notes || "",
        subcategory: existing.subcategory || "",
        expense: Number(existing.amount).toFixed(2),
      });
    }

    return tr;
  }

  function addBlankRows(count) {
    const tbody = els["txn-grid-tbody"];
    for (let i = 0; i < count; i++) tbody.appendChild(buildGridRow(null));
  }

  function renderTransactionsGrid(monthKey) {
    const tbody = els["txn-grid-tbody"];
    tbody.innerHTML = "";
    if (!model) return;

    // Income rows (if any exist in the sheet) aren't shown here — this grid
    // is expense-only by design; log income directly in the sheet if you
    // ever need to.
    const rows = model.expenses
      .filter((e) => e.monthKey === monthKey)
      .sort((a, b) => a.date.localeCompare(b.date));

    rows.forEach((r) => tbody.appendChild(buildGridRow(r)));
    addBlankRows(DEFAULT_BLANK_ROWS);
  }

  function showTxnGridError(msg) { els["txn-grid-error"].textContent = msg; els["txn-grid-error"].hidden = false; }
  function clearTxnGridError() { els["txn-grid-error"].hidden = true; els["txn-grid-error"].textContent = ""; }

  function markRowError(tr, msg) {
    tr.classList.add("grid-row-error");
    tr.title = msg;
    return msg;
  }

  async function saveGridChanges() {
    clearTxnGridError();
    const monthKey = els["month-select"].value; // e.g. "2026-09" — every row in
    // this grid belongs to this tab; the Day field never specifies a month.
    const monthIndex = parseInt(monthKey.split("-")[1], 10) - 1;
    const trs = Array.from(els["txn-grid-tbody"].querySelectorAll("tr"));
    trs.forEach((tr) => { tr.classList.remove("grid-row-error"); tr.removeAttribute("title"); });

    const toAppend = []; // rowValues[]
    const toUpdate = []; // {ref, rowValues}
    let errorCount = 0;
    let anyChange = false;

    trs.forEach((tr) => {
      const dayStr = tr.querySelector(".grid-day").value.trim();
      const category = tr.querySelector(".grid-category").value;
      const notes = tr.querySelector(".grid-notes").value.trim();
      const subcategory = tr.querySelector(".grid-subcategory").value;
      const expenseStr = tr.querySelector(".grid-expense").value.trim();
      const isExisting = Boolean(tr.dataset.ref);

      const isBlank = !dayStr && !category && !notes && !expenseStr;
      if (!isExisting && isBlank) return; // untouched blank row — ignore

      const dayNum = parseInt(dayStr, 10);
      if (!dayStr || isNaN(dayNum) || dayNum < 1 || dayNum > 31) { errorCount++; markRowError(tr, "Day must be 1–31."); return; }
      if (!category) { errorCount++; markRowError(tr, "Pick a category."); return; }

      const expenseVal = expenseStr ? parseFloat(expenseStr) : NaN;
      const hasExpense = expenseStr !== "" && !isNaN(expenseVal) && expenseVal > 0;
      if (!hasExpense) { errorCount++; markRowError(tr, "Enter an expense amount."); return; }

      const finalSubcategory = category === "Food" ? subcategory : "";
      const rowValues = [dayNum, category, notes, finalSubcategory, "", expenseVal.toFixed(2)];

      if (!isExisting) {
        anyChange = true;
        toAppend.push(rowValues);
        return;
      }

      const original = JSON.parse(tr.dataset.original);
      const currentSnapshot = {
        day: dayNum, category, notes, subcategory: finalSubcategory,
        expense: expenseVal.toFixed(2),
      };
      const unchanged = Object.keys(currentSnapshot).every((k) => currentSnapshot[k] === original[k]);
      if (unchanged) return;

      anyChange = true;
      const ref = JSON.parse(tr.dataset.ref);
      toUpdate.push({ ref, rowValues });
    });

    if (errorCount > 0) {
      showTxnGridError(`Fix ${errorCount} row${errorCount === 1 ? "" : "s"} highlighted below, then Save again.`);
      return;
    }
    if (!anyChange) {
      showTxnGridError("Nothing to save.");
      return;
    }

    els["save-transactions-btn"].disabled = true;
    try {
      if (toAppend.length) await dataAdapter.addTransactions(monthIndex, toAppend);
      for (const u of toUpdate) {
        await dataAdapter.updateTransaction(u.ref, u.rowValues);
      }
      await refreshModel(monthKey);
    } catch (err) {
      showTxnGridError(err.message || String(err));
    } finally {
      els["save-transactions-btn"].disabled = false;
    }
  }

  function deleteTransactionRow(r) {
    return runExclusive(async () => {
      if (!confirm("Delete this transaction? This can't be undone.")) return;
      try {
        await dataAdapter.deleteTransaction(r.ref);
        await refreshModel();
      } catch (err) {
        showError(err.message || String(err));
      }
    });
  }

  // ---------- Categories & budgets: list + CRUD ----------
  function renderCategoriesTable() {
    const tbody = els["categories-tbody"];
    tbody.innerHTML = "";

    const topLevel = Array.from(model.budgets.entries()).map(([name, amount]) => ({
      name, amount, ref: model.budgetRefs.get(name), isFoodSub: false,
    }));
    const foodSubs = Array.from(model.foodSubBudgets.entries()).map(([rawName, amount]) => ({
      name: `Food: ${rawName}`, rawName, amount, ref: model.foodSubBudgetRefs.get(rawName), isFoodSub: true,
    }));

    [...topLevel, ...foodSubs].forEach((c) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = c.name;
      tr.appendChild(nameTd);

      const amountTd = document.createElement("td");
      amountTd.className = "num";
      amountTd.textContent = Dashboard.currency(c.amount);
      tr.appendChild(amountTd);

      const actionsTd = document.createElement("td");
      actionsTd.className = "actions-col";
      const wrap = document.createElement("div");
      wrap.className = "row-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openCategoryEditModal(c));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteCategoryRow(c));
      wrap.append(editBtn, delBtn);
      actionsTd.appendChild(wrap);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });
  }

  function showCatError(msg) { els["cat-error"].textContent = msg; els["cat-error"].hidden = false; }
  function clearCatError() { els["cat-error"].hidden = true; els["cat-error"].textContent = ""; }

  function updateCatNameLabel() {
    els["cat-name-label"].textContent = els["cat-is-food-sub"].checked
      ? "Food sub-category name (e.g. Breakfast)"
      : "Category name";
  }

  function openCategoryEditModal(existing) {
    clearCatError();
    if (existing) {
      editingCatRef = existing.ref;
      els["category-edit-title"].textContent = "Edit category";
      els["cat-is-food-sub"].checked = existing.isFoodSub;
      // Editing never flips a category between "plain" and "Food sub-budget"
      // — delete it and add it again as the other kind if that's what you want.
      els["cat-is-food-sub"].disabled = true;
      els["cat-name"].value = existing.isFoodSub ? existing.rawName : existing.name;
      els["cat-amount"].value = existing.amount;
      els["cat-delete"].hidden = false;
    } else {
      editingCatRef = null;
      els["category-edit-title"].textContent = "Add category";
      els["cat-is-food-sub"].checked = false;
      els["cat-is-food-sub"].disabled = false;
      els["cat-name"].value = "";
      els["cat-amount"].value = "";
      els["cat-delete"].hidden = true;
    }
    updateCatNameLabel();
    els["category-edit-modal"].showModal();
  }

  async function submitCategoryForm() {
    clearCatError();
    const isFoodSub = els["cat-is-food-sub"].checked;
    const rawName = els["cat-name"].value.trim();
    if (!rawName) { showCatError("Enter a name."); return; }
    const amountValue = parseFloat(els["cat-amount"].value);
    if (isNaN(amountValue) || amountValue < 0) { showCatError("Enter a budget amount of 0 or more."); return; }
    const label = isFoodSub ? `Food: ${rawName}` : rawName;
    const rowValues = [label, amountValue.toFixed(2)];

    els["cat-save"].disabled = true;
    try {
      if (editingCatRef) {
        await dataAdapter.updateCategory(editingCatRef, rowValues);
      } else {
        await dataAdapter.addCategory(rowValues);
      }
      els["category-edit-modal"].close();
      await refreshModel();
      renderCategoriesTable();
    } catch (err) {
      showCatError(err.message || String(err));
    } finally {
      els["cat-save"].disabled = false;
    }
  }

  function deleteCategoryFromEditModal() {
    return runExclusive(async () => {
      if (!editingCatRef) return;
      if (!confirm('Delete this category? Past transactions already recorded under it are not affected — they\'ll just show as "no budget set."')) return;
      els["cat-delete"].disabled = true;
      try {
        await dataAdapter.deleteCategory(editingCatRef);
        els["category-edit-modal"].close();
        await refreshModel();
        renderCategoriesTable();
      } catch (err) {
        showCatError(err.message || String(err));
      } finally {
        els["cat-delete"].disabled = false;
      }
    });
  }

  function deleteCategoryRow(c) {
    return runExclusive(async () => {
      if (!confirm('Delete this category? Past transactions already recorded under it are not affected — they\'ll just show as "no budget set."')) return;
      try {
        await dataAdapter.deleteCategory(c.ref);
        await refreshModel();
        renderCategoriesTable();
      } catch (err) {
        showError(err.message || String(err));
      }
    });
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }

  function cycleTheme() {
    const order = ["", "dark", "light"];
    const current = Config.getTheme();
    const next = order[(order.indexOf(current) + 1) % order.length];
    Config.setTheme(next);
    applyTheme(next);
  }

  // ---------- Wiring ----------
  function wire() {
    initNav();

    els["settings-btn"].addEventListener("click", openSettings);
    els["settings-cancel"].addEventListener("click", () => els["settings-modal"].close());
    els["settings-form"].addEventListener("submit", () => {
      saveSettings();
      // Only attempt a fresh sign-in if the user hasn't connected data yet;
      // otherwise let them hit Refresh so an in-progress view isn't yanked away.
      if (!model) loadLive({ interactive: true });
    });

    els["signin-btn"].addEventListener("click", () => loadLive({ interactive: true }));
    els["empty-signin-btn"].addEventListener("click", () => loadLive({ interactive: true }));
    els["demo-btn"].addEventListener("click", loadDemo);
    els["refresh-btn"].addEventListener("click", () => {
      if (dataSource === "live") loadLive({ interactive: true });
      else refreshModel();
    });

    els["month-select"].addEventListener("change", renderSelectedMonth);
    els["theme-toggle"].addEventListener("click", cycleTheme);

    // Transactions grid
    els["add-grid-rows-btn"].addEventListener("click", () => addBlankRows(ADD_BLANK_ROWS));
    els["save-transactions-btn"].addEventListener("click", () => runExclusive(saveGridChanges));

    // Categories & budgets
    els["add-category-btn"].addEventListener("click", () => openCategoryEditModal(null));
    els["cat-cancel"].addEventListener("click", () => els["category-edit-modal"].close());
    els["cat-is-food-sub"].addEventListener("change", updateCatNameLabel);
    els["category-edit-form"].addEventListener("submit", (event) => {
      event.preventDefault();
      runExclusive(submitCategoryForm);
    });
    els["cat-delete"].addEventListener("click", deleteCategoryFromEditModal);
  }

  // ---------- PWA install ----------
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // Relative path + relative scope, so this works whether the app is
    // hosted at a domain root or a subpath like /budget-pulse/.
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.warn("Budget Pulse: service worker registration failed", err);
    });
  }

  // If a returning user's token has quietly lapsed (e.g. the phone locked,
  // or the tab/app was in the background for a while) while they're already
  // signed in, catch it the moment they come back — without waiting for
  // them to click Refresh — rather than only trying once on first load.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (dataSource === "live" && !Auth.isSignedIn() && Config.isConfigured()) {
      loadLive({ interactive: false });
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();
    wire();
    applyTheme(Config.getTheme());
    registerServiceWorker();
    if (Config.isConfigured()) {
      // Try a silent, non-interactive sign-in so a returning user with an
      // active Google session doesn't have to click through every time.
      loadLive({ interactive: false });
    }
  });
})();
