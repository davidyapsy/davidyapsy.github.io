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

  /** Returns [{ title, sheetId }] for every tab — sheetId (the numeric grid
   *  id) is what batchUpdate needs to target a tab for row deletion. */
  async function fetchSheetMeta(spreadsheetId, token) {
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(title,sheetId)`;
    const json = await apiFetch(url, token);
    return (json.sheets || []).map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId }));
  }

  async function apiWrite(url, token, options) {
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body?.error?.message || `${res.status} ${res.statusText}`;
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Google denied write access (${message}). Make sure you signed in again after this app's OAuth scope changed to read/write, and that this account can edit the sheet.`);
      }
      throw new Error(`Google Sheets API error: ${message}`);
    }
    return res.json();
  }

  /** Appends one row to the end of a tab's data. `rowValues` is a plain
   *  array matching that tab's columns left-to-right (A, B, C, ...). Sheets
   *  itself picks the next empty row — callers reload the workbook
   *  afterwards rather than guessing which row number that was. */
  /** Appends one or more rows in a single API call — used both for a lone
   *  new row and for a whole batch of them (e.g. a week's worth typed into
   *  the Transactions grid at once), since Sheets accepts an array of rows
   *  per append call either way. */
  async function appendRows(spreadsheetId, token, sheetTitle, rowsArray, lastCol = "F") {
    const range = `${sheetTitle}!A:${lastCol}`;
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    return apiWrite(url, token, { method: "POST", body: JSON.stringify({ values: rowsArray }) });
  }

  async function appendRow(spreadsheetId, token, sheetTitle, rowValues, lastCol = "F") {
    return appendRows(spreadsheetId, token, sheetTitle, [rowValues], lastCol);
  }

  /** Overwrites one specific existing row (1-based sheet row number, e.g.
   *  the 5th row of the sheet including the header) with new values. */
  async function updateRow(spreadsheetId, token, sheetTitle, rowNumber, rowValues, lastCol = "F") {
    const range = `${sheetTitle}!A${rowNumber}:${lastCol}${rowNumber}`;
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    return apiWrite(url, token, { method: "PUT", body: JSON.stringify({ values: [rowValues] }) });
  }

  /** Deletes one row entirely (rows below it shift up), given the tab's
   *  numeric sheetId and a 1-based sheet row number. */
  async function deleteRow(spreadsheetId, token, sheetId, rowNumber) {
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
    const body = {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1, // batchUpdate row indices are 0-based
              endIndex: rowNumber,
            },
          },
        },
      ],
    };
    return apiWrite(url, token, { method: "POST", body: JSON.stringify(body) });
  }

  /** Creates a new tab (e.g. a month that hasn't been used yet) with a
   *  header row matching the month-tab schema. No-op-safe: callers should
   *  check fetchSheetTitles/fetchSheetMeta first and only call this when
   *  the tab is genuinely missing. */
  async function addMonthTab(spreadsheetId, token, title) {
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
    const body = { requests: [{ addSheet: { properties: { title } } }] };
    await apiWrite(url, token, { method: "POST", body: JSON.stringify(body) });
    const headerRange = `${title}!A1:F1`;
    const headerUrl = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(headerRange)}?valueInputOption=USER_ENTERED`;
    await apiWrite(headerUrl, token, {
      method: "PUT",
      body: JSON.stringify({ values: [["Date", "Category", "Notes", "Food Sub-Category", "Income (+)", "Expense (-)"]] }),
    });
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
   * Returns { budgetRows, monthTabs, sheetMeta } where monthTabs is
   * [{ monthIndex (0-11), title, rows }], only for months whose tab exists,
   * and sheetMeta is [{ title, sheetId }] for every tab (used by the write
   * layer to target a tab for row deletion).
   */
  async function loadWorkbook({ spreadsheetId, token, budgetTab }) {
    const sheetMeta = await fetchSheetMeta(spreadsheetId, token);
    const titles = sheetMeta.map((s) => s.title);
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

    return { budgetRows, monthTabs, sheetMeta };
  }

  /** Canonical tab name to create for a given month index — the short form
   *  ("Jan", "Feb", ...) that also happens to be the first alias checked. */
  function canonicalMonthTitle(monthIndex) {
    return MONTH_ALIASES[monthIndex][0].replace(/^[a-z]/, (c) => c.toUpperCase());
  }

  return {
    loadWorkbook,
    fetchSheetMeta,
    findMonthTabTitle,
    canonicalMonthTitle,
    appendRow,
    appendRows,
    updateRow,
    deleteRow,
    addMonthTab,
    MONTH_ALIASES,
  };
})();
