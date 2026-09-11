// Budget Pulse — one CRUD interface, two implementations.
//
// The UI (app.js) never talks to SheetsApi or DemoData directly for writes;
// it calls a DataSource, which is either:
//  - liveAdapter: every write goes straight to the real Google Sheet via
//    SheetsApi, and loadModel() re-fetches the whole workbook afterwards —
//    simplest way to guarantee row numbers are never stale after an edit
//    shifts rows around.
//  - demoAdapter: every write mutates an in-memory "workbook" object
//    (created by DemoData.createWorkbook()) directly, and loadModel() just
//    re-parses it — no network at all, so "Try it with sample data" is a
//    full, free-to-break CRUD sandbox.
//
// Both expose the exact same methods, so app.js's CRUD handlers don't need
// to know or care which one is active.

const DataSource = (() => {
  function liveAdapter({ spreadsheetId, budgetTab, year }) {
    function sheetIdFor(sheetMeta, title) {
      const found = sheetMeta.find((s) => s.title === title);
      if (!found) throw new Error(`Could not find the "${title}" tab — try Refresh, then try again.`);
      return found.sheetId;
    }

    async function ensureMonthTab(monthIndex) {
      const token = Auth.getToken();
      const meta = await SheetsApi.fetchSheetMeta(spreadsheetId, token);
      const titles = meta.map((m) => m.title);
      const existing = SheetsApi.findMonthTabTitle(titles, monthIndex);
      if (existing) return existing;
      const title = SheetsApi.canonicalMonthTitle(monthIndex);
      await SheetsApi.addMonthTab(spreadsheetId, token, title);
      return title;
    }

    return {
      async addTransaction(monthIndex, rowValues) {
        const token = Auth.getToken();
        const title = await ensureMonthTab(monthIndex);
        await SheetsApi.appendRow(spreadsheetId, token, title, rowValues, "F");
      },
      /** Same as addTransaction, but for a whole batch of rows destined for
       *  the same month — one API call instead of one per row, for fast
       *  weekly bulk entry. */
      async addTransactions(monthIndex, rowsArray) {
        if (!rowsArray.length) return;
        const token = Auth.getToken();
        const title = await ensureMonthTab(monthIndex);
        await SheetsApi.appendRows(spreadsheetId, token, title, rowsArray, "F");
      },
      async updateTransaction(ref, rowValues) {
        const token = Auth.getToken();
        await SheetsApi.updateRow(spreadsheetId, token, ref.tab, ref.index + 2, rowValues, "F");
      },
      async deleteTransaction(ref) {
        const token = Auth.getToken();
        const meta = await SheetsApi.fetchSheetMeta(spreadsheetId, token);
        const sheetId = sheetIdFor(meta, ref.tab);
        await SheetsApi.deleteRow(spreadsheetId, token, sheetId, ref.index + 2);
      },
      async addCategory(rowValues) {
        const token = Auth.getToken();
        await SheetsApi.appendRow(spreadsheetId, token, budgetTab, rowValues, "B");
      },
      async updateCategory(ref, rowValues) {
        const token = Auth.getToken();
        await SheetsApi.updateRow(spreadsheetId, token, ref.tab, ref.index + 2, rowValues, "B");
      },
      async deleteCategory(ref) {
        const token = Auth.getToken();
        const meta = await SheetsApi.fetchSheetMeta(spreadsheetId, token);
        const sheetId = sheetIdFor(meta, ref.tab);
        await SheetsApi.deleteRow(spreadsheetId, token, sheetId, ref.index + 2);
      },
      async loadModel() {
        const token = Auth.getToken();
        const wb = await SheetsApi.loadWorkbook({ spreadsheetId, token, budgetTab });
        return Dashboard.parse(wb.budgetRows, wb.monthTabs, year, budgetTab);
      },
    };
  }

  function demoAdapter(workbook, year) {
    function monthTabFor(monthIndex, createIfMissing) {
      let tab = workbook.monthTabs.find((t) => t.monthIndex === monthIndex);
      if (!tab && createIfMissing) {
        tab = { monthIndex, title: DemoData.MONTH_TITLES[monthIndex], rows: [] };
        workbook.monthTabs.push(tab);
        workbook.monthTabs.sort((a, b) => a.monthIndex - b.monthIndex);
      }
      return tab;
    }
    function monthTabByTitle(title) {
      return workbook.monthTabs.find((t) => t.title === title);
    }

    return {
      async addTransaction(monthIndex, rowValues) {
        monthTabFor(monthIndex, true).rows.push(rowValues);
      },
      async addTransactions(monthIndex, rowsArray) {
        if (!rowsArray.length) return;
        monthTabFor(monthIndex, true).rows.push(...rowsArray);
      },
      async updateTransaction(ref, rowValues) {
        const tab = monthTabByTitle(ref.tab);
        if (tab) tab.rows[ref.index] = rowValues;
      },
      async deleteTransaction(ref) {
        const tab = monthTabByTitle(ref.tab);
        if (tab) tab.rows.splice(ref.index, 1);
      },
      async addCategory(rowValues) {
        workbook.budgetRows.push(rowValues);
      },
      async updateCategory(ref, rowValues) {
        workbook.budgetRows[ref.index] = rowValues;
      },
      async deleteCategory(ref) {
        workbook.budgetRows.splice(ref.index, 1);
      },
      async loadModel() {
        return Dashboard.parse(workbook.budgetRows, workbook.monthTabs, year, workbook.budgetTitle);
      },
    };
  }

  return { liveAdapter, demoAdapter };
})();
