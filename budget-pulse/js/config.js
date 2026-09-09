// Budget Pulse — local settings storage.
// Everything here lives only in this browser's localStorage. Nothing is ever
// sent anywhere except directly to Google's own APIs from the user's browser.

const Config = (() => {
  const KEY = "budgetPulse.settings.v1";

  const defaults = {
    clientId: "",
    spreadsheetId: "",
    budgetTab: "Budget",
    // Each spreadsheet covers one calendar year (a fresh sheet per year),
    // so the year lives here rather than being guessed from anywhere else.
    year: new Date().getFullYear(),
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...defaults };
      return { ...defaults, ...JSON.parse(raw) };
    } catch (e) {
      console.warn("Budget Pulse: could not read settings, using defaults", e);
      return { ...defaults };
    }
  }

  function save(partial) {
    const current = load();
    const next = { ...current, ...partial };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("Budget Pulse: could not persist settings", e);
    }
    return next;
  }

  function isConfigured() {
    const c = load();
    return Boolean(c.clientId && c.spreadsheetId);
  }

  function getTheme() {
    try {
      return localStorage.getItem("budgetPulse.theme") || "";
    } catch (e) {
      return "";
    }
  }

  function setTheme(value) {
    try {
      if (value) localStorage.setItem("budgetPulse.theme", value);
      else localStorage.removeItem("budgetPulse.theme");
    } catch (e) {
      /* ignore */
    }
  }

  return { load, save, isConfigured, getTheme, setTheme };
})();
