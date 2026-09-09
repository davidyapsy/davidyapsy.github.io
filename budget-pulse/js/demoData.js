// Budget Pulse — sample data for "Try it with sample data" mode.
// Shaped exactly like what SheetsApi.loadWorkbook returns for a real
// spreadsheet: a Budget tab (category, monthly amount) plus one tab per
// month that exists, each holding rows of
// [Date(day-of-month), Category, Notes, Food Sub-Category, Income(+), Expense(-)]
// — including the "blank date = same day as the row above" convention, so
// demo mode exercises exactly the same forward-fill parsing as a real sheet.

const DemoData = (() => {
  const YEAR = new Date().getFullYear();

  // Category, monthly budget, and a relative weight for how often it shows
  // up day to day — mirrors a real "mostly Food, everything else occasional" log.
  const CATEGORIES = [
    { name: "Food", budget: 794, weight: 55, amount: () => 6 + rnd() * 20, subCats: ["Breakfast", "Lunch", "Dinner", "Bread", "Snacks"] },
    { name: "Transportation", budget: 200, weight: 12, amount: () => 4 + rnd() * 14 },
    { name: "Health", budget: 72, weight: 5, amount: () => 8 + rnd() * 35 },
    { name: "Babe", budget: 100, weight: 6, amount: () => 15 + rnd() * 60 },
    { name: "Entertainment", budget: 40, weight: 5, amount: () => 8 + rnd() * 30 },
    { name: "Social", budget: 50, weight: 3, amount: () => 10 + rnd() * 40 },
    { name: "Apparel", budget: 100, weight: 4, amount: () => 20 + rnd() * 70 },
    { name: "Household", budget: 40, weight: 4, amount: () => 10 + rnd() * 30 },
    { name: "Other", budget: 100, weight: 5, amount: () => 8 + rnd() * 40 },
    { name: "Telco", budget: 30, weight: 1, amount: () => 15 + rnd() * 20 },
    { name: "Education", budget: 50, weight: 1, amount: () => 10 + rnd() * 25 },
  ];
  const TOTAL_WEIGHT = CATEGORIES.reduce((s, c) => s + c.weight, 0);

  const NOTES = ["", "", "", "Lunch with team", "Weekly stock-up", "Top-up", "Petrol", "Toll",
    "Clinic visit", "Gift", "Online order", "Subscription"];

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  // Deterministic pseudo-random so demo mode looks the same on every run.
  let seed = 42;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 10000) / 10000;
  }

  function pickCategory() {
    let r = rnd() * TOTAL_WEIGHT;
    for (const cat of CATEGORIES) {
      r -= cat.weight;
      if (r <= 0) return cat;
    }
    return CATEGORIES[0];
  }

  function buildMonthRows(year, monthIndex, lastDay) {
    const rows = [];
    for (let day = 1; day <= lastDay; day++) {
      const txCount = rnd() < 0.12 ? 0 : 1 + Math.floor(rnd() * 3); // most days have 1-3 entries
      for (let i = 0; i < txCount; i++) {
        const cat = pickCategory();
        const amount = Math.round(cat.amount() * 100) / 100;
        const note = NOTES[Math.floor(rnd() * NOTES.length)];
        const subCat = cat.subCats ? cat.subCats[Math.floor(rnd() * cat.subCats.length)] : "";
        rows.push([
          i === 0 ? day : "", // blank date = continuation of the same day, like the real sheet
          cat.name,
          note,
          subCat,
          "",
          amount.toFixed(2),
        ]);
      }
    }
    return rows;
  }

  function monthTabs() {
    const today = new Date();
    const currentMonthIndex = today.getMonth();
    const tabs = [];
    for (let m = 0; m <= currentMonthIndex; m++) {
      const lastDay = m === currentMonthIndex ? today.getDate() : daysInMonth(YEAR, m);
      tabs.push({ monthIndex: m, rows: buildMonthRows(YEAR, m, lastDay) });
    }
    return tabs;
  }

  function budgetRows() {
    return CATEGORIES.map((c) => [c.name, String(c.budget)]);
  }

  return { budgetRows, monthTabs, year: YEAR };
})();
