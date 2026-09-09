// Budget Pulse — thin wrapper around the Google Sheets API v4 REST endpoint.
// Talks directly from the browser to sheets.googleapis.com using the access
// token from Auth. No proxy, no backend, no server ever sees your data.
//
// Expenses live one tab per calendar month (Jan, Feb, ... — matching the
// habit of splitting a monthly transaction log into its own sheet). This
// module discovers which month tabs actually exist in the spreadsheet and
// fetches only those, tolerant of a few common spellings (Jul/July, Sep/Sept).

const SheetsApi = (() => {
  const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

  // Accepted tab-name spellings per month, matched case-insensitively.
  const MONTH_ALIASES = [
    ["jan", "january"],
    ["feb", "february"],
    ["mar", "march"],
    ["apr", "april"],
    ["may"],
    ["jun", "june"],
    ["jul", "july"],
    ["aug", "august"],
    ["sep", "sept", "september"],
    ["oct", "october"],
    ["nov", "november"],
    ["dec", "december"],
  ];

  function findMonthTabTitle(sheetTitles, monthIndex) {
    const aliases = MONTH_ALIASES[monthIndex];
    return sheetTitles.find((title) => aliases.includes(String(title).trim().toLowerCase())) || null;
  }

  async function apiFetch(url, token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body?.error?.message || `${res.status} ${res.statusText}`;
      if (res.status === 404) {
        throw new Error(`Spreadsheet not found. Check the Spreadsheet ID in Settings (${message}).`);
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Google denied access (${message}). Make sure you're signed in with an account that can view this sheet.`);
      }
      throw new Error(`Google Sheets API error: ${message}`);
    }
    return res.json();
  }

  /** Returns the list of tab (sheet) titles in the spreadsheet. */
  async function fetchSheetTitles(spreadsheetId, token) {
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`;
    const json = await apiFetch(url, token);
    return (json.sheets || []).map((s) => s.properties.title);
  }

  /** Fetches multiple A1 ranges in a single request, in the given order. */
  async function batchGetValues(spreadsheetId, token, ranges) {
    const params = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`;
    const json = await apiFetch(url, token);
    return (json.valueRanges || []).map((vr) => vr.values || []);
  }

  /**
   * Loads the Budget tab plus every month tab that's actually present in the
   * spreadsheet (a fresh sheet won't have November's tab yet, and that's fine).
   * Returns { budgetRows, monthTabs } where monthTabs is
   * [{ monthIndex (0-11), title, rows }], only for months whose tab exists.
   */
  async function loadWorkbook({ spreadsheetId, token, budgetTab }) {
    const titles = await fetchSheetTitles(spreadsheetId, token);
    if (!titles.includes(budgetTab)) {
      throw new Error(`No "${budgetTab}" tab found in this spreadsheet. Check the tab name in Settings.`);
    }

    const presentMonths = [];
    for (let i = 0; i < 12; i++) {
      const title = findMonthTabTitle(titles, i);
      if (title) presentMonths.push({ monthIndex: i, title });
    }

    const ranges = [`${budgetTab}!A2:B`, ...presentMonths.map((m) => `${m.title}!A2:F`)];
    const results = await batchGetValues(spreadsheetId, token, ranges);

    const budgetRows = results[0] || [];
    const monthTabs = presentMonths.map((m, i) => ({
      monthIndex: m.monthIndex,
      title: m.title,
      rows: results[i + 1] || [],
    }));

    return { budgetRows, monthTabs };
  }

  return { loadWorkbook, MONTH_ALIASES };
})();
