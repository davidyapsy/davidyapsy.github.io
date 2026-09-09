// Budget Pulse — wires the UI together. Nothing here talks to any backend:
// it's Config (localStorage) + Auth (Google Identity Services) + SheetsApi
// (direct fetch to Google) + Dashboard (parse/compute/render).

(() => {
  let model = null;
  let dataSource = ""; // "live" | "demo"

  const els = {};
  function cacheEls() {
    [
      "empty-state", "dashboard", "error-banner",
      "settings-modal", "input-client-id", "input-spreadsheet-id", "input-budget-tab", "input-year",
      "settings-btn", "settings-cancel", "settings-form",
      "signin-btn", "empty-signin-btn", "demo-btn", "signed-in-badge",
      "month-select", "refresh-btn", "table-view-btn", "table-panel",
      "theme-toggle", "data-source-badge",
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
      const token = await Auth.requestToken({ interactive });
      const { budgetRows, monthTabs } = await SheetsApi.loadWorkbook({
        spreadsheetId: settings.spreadsheetId,
        token,
        budgetTab: settings.budgetTab,
      });
      model = Dashboard.parse(budgetRows, monthTabs, settings.year);
      dataSource = "live";
      els["signed-in-badge"].hidden = false;
      els["signed-in-badge"].textContent = "🟢 Connected to Google Sheets";
      els["signin-btn"].hidden = true;
      renderModel();
    } catch (err) {
      if (interactive) showError(err.message || String(err));
      // A failed silent attempt on page load is expected (no cached session) — stay quiet.
    }
  }

  function loadDemo() {
    clearError();
    model = Dashboard.parse(DemoData.budgetRows(), DemoData.monthTabs(), DemoData.year);
    dataSource = "demo";
    els["signed-in-badge"].hidden = false;
    els["signed-in-badge"].textContent = "🧪 Sample data — not connected";
    renderModel();
  }

  // ---------- Rendering ----------
  function renderModel() {
    els["empty-state"].hidden = true;
    els["dashboard"].hidden = false;
    els["data-source-badge"].textContent = dataSource === "live" ? "Live from Google Sheets" : "Sample data";

    const select = els["month-select"];
    select.innerHTML = "";
    model.months.slice().reverse().forEach((monthKey) => {
      const opt = document.createElement("option");
      opt.value = monthKey;
      opt.textContent = Dashboard.monthLabel(monthKey);
      select.appendChild(opt);
    });
    select.value = model.months[model.months.length - 1];

    Dashboard.renderTrend(Dashboard.computeTrend(model));
    renderSelectedMonth();
  }

  function renderSelectedMonth() {
    const monthKey = els["month-select"].value;
    const computed = Dashboard.computeMonth(monthKey, model);
    Dashboard.renderStats(computed.totals);
    Dashboard.renderMeters(computed.categories);
    Dashboard.renderTable(computed.categories);
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
      else loadDemo();
    });

    els["month-select"].addEventListener("change", renderSelectedMonth);
    els["table-view-btn"].addEventListener("click", () => {
      els["table-panel"].hidden = !els["table-panel"].hidden;
      els["table-view-btn"].textContent = els["table-panel"].hidden ? "Table view" : "Hide table";
    });
    els["theme-toggle"].addEventListener("click", cycleTheme);
  }

  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();
    wire();
    applyTheme(Config.getTheme());
    if (Config.isConfigured()) {
      // Try a silent, non-interactive sign-in so a returning user with an
      // active Google session doesn't have to click through every time.
      loadLive({ interactive: false });
    }
  });
})();
