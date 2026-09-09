// Budget Pulse — parsing, computation, and rendering.
// No charting library: a handful of DOM nodes and one small inline SVG line
// chart, built by hand per the house dataviz method (status colors for the
// per-category meters, one categorical hue for the trend line, a dashed
// muted baseline for the budget reference — never a second color axis).

const Dashboard = (() => {
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currency = (n) => `RM ${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function monthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return `${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`;
  }

  /**
   * Turns raw Sheets rows into a structured model.
   *
   * `monthTabs` is one entry per month tab that actually exists in the
   * spreadsheet: [{ monthIndex (0-11), rows }]. Each row is
   * [Date, Category, Notes, Food Sub-Category, Income(+), Expense(-)] — the
   * Date column only carries a day number and is blank on a continuation row
   * (a second transaction the same day), so a blank day forward-fills from
   * the last seen day in that tab, same as reading the sheet by eye.
   */
  function parse(budgetRows, monthTabs, year) {
    const budgets = new Map();
    (budgetRows || []).forEach((row) => {
      const [category, amount] = row;
      if (!category) return;
      const value = parseFloat(String(amount).replace(/[^0-9.-]/g, ""));
      budgets.set(String(category).trim(), isNaN(value) ? 0 : value);
    });

    const expenses = [];
    (monthTabs || []).forEach(({ monthIndex, rows }) => {
      let lastDay = null;
      (rows || []).forEach((row) => {
        const [dayRaw, category, notes, foodSubCat, , expenseRaw] = row;
        const dayStr = dayRaw === undefined || dayRaw === null ? "" : String(dayRaw).trim();
        if (dayStr !== "") {
          const dayNum = parseInt(dayStr, 10);
          if (!isNaN(dayNum)) lastDay = dayNum;
        }
        if (!category) return; // blank / separator row
        const expenseValue = parseFloat(String(expenseRaw ?? "").replace(/[^0-9.-]/g, ""));
        if (isNaN(expenseValue) || expenseValue === 0) return; // only the "-" column counts as spend

        const day = lastDay || 1;
        const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        expenses.push({
          date: `${monthKey}-${String(day).padStart(2, "0")}`,
          monthKey,
          category: String(category).trim(),
          subcategory: foodSubCat || "",
          notes: notes || "",
          amount: expenseValue,
        });
      });
    });

    const months = (monthTabs || [])
      .map((m) => `${year}-${String(m.monthIndex + 1).padStart(2, "0")}`)
      .sort();

    return { budgets, expenses, months };
  }

  function statusFor(spent, budgeted) {
    if (!budgeted || budgeted <= 0) return spent > 0 ? "unbudgeted" : "good";
    const pct = (spent / budgeted) * 100;
    if (pct >= 100) return "critical";
    if (pct >= 80) return "warning";
    return "good";
  }

  /** Per-category breakdown for a single month. */
  function computeMonth(monthKey, model) {
    const spentByCategory = new Map();
    model.expenses
      .filter((e) => e.monthKey === monthKey)
      .forEach((e) => spentByCategory.set(e.category, (spentByCategory.get(e.category) || 0) + e.amount));

    const allCategories = new Set([...model.budgets.keys(), ...spentByCategory.keys()]);
    const categories = Array.from(allCategories).map((name) => {
      const budgeted = model.budgets.get(name) || 0;
      const spent = spentByCategory.get(name) || 0;
      const pct = budgeted > 0 ? (spent / budgeted) * 100 : (spent > 0 ? Infinity : 0);
      return {
        name,
        budgeted,
        spent,
        remaining: budgeted - spent,
        pct,
        status: statusFor(spent, budgeted),
      };
    });

    categories.sort((a, b) => {
      // Over-budget first, then by spend descending — the categories that
      // need attention surface at the top.
      const rank = (s) => (s === "critical" ? 0 : s === "warning" ? 1 : s === "unbudgeted" ? 2 : 3);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return b.spent - a.spent;
    });

    const totals = categories.reduce(
      (acc, c) => {
        acc.budgeted += c.budgeted;
        acc.spent += c.spent;
        if (c.status === "critical") acc.overCount += 1;
        return acc;
      },
      { budgeted: 0, spent: 0, overCount: 0 }
    );
    totals.remaining = totals.budgeted - totals.spent;

    return { categories, totals };
  }

  /** Total spend per month, across all months present, for the trend line. */
  function computeTrend(model) {
    const budgetTotal = Array.from(model.budgets.values()).reduce((a, b) => a + b, 0);
    return model.months.map((monthKey) => {
      const spent = model.expenses
        .filter((e) => e.monthKey === monthKey)
        .reduce((sum, e) => sum + e.amount, 0);
      return { monthKey, label: monthLabel(monthKey), spent, budgetTotal };
    });
  }

  // ---------- Rendering ----------

  function renderStats(totals) {
    document.getElementById("stat-budget").textContent = currency(totals.budgeted);
    document.getElementById("stat-spent").textContent = currency(totals.spent);
    const remainingEl = document.getElementById("stat-remaining");
    remainingEl.textContent = currency(totals.remaining);
    remainingEl.classList.toggle("status-critical-text", totals.remaining < 0);
    document.getElementById("stat-over").textContent = String(totals.overCount);
  }

  const STATUS_ICON = { good: "✓", warning: "⚠", critical: "✕", unbudgeted: "–" };
  const STATUS_TEXT = { good: "On track", warning: "Near limit", critical: "Over budget", unbudgeted: "No budget set" };

  function renderMeters(categories) {
    const container = document.getElementById("meters");
    const emptyNote = document.getElementById("meters-empty");
    container.innerHTML = "";

    if (categories.length === 0) {
      emptyNote.hidden = false;
      return;
    }
    emptyNote.hidden = true;

    categories.forEach((c) => {
      const row = document.createElement("div");
      row.className = "meter-row";
      row.setAttribute("role", "listitem");
      row.dataset.status = c.status;

      const label = document.createElement("div");
      label.className = "meter-label";
      const nameEl = document.createElement("span");
      nameEl.className = "meter-cat";
      nameEl.textContent = c.name;
      const amountsEl = document.createElement("span");
      amountsEl.className = "meter-amounts";
      amountsEl.textContent = c.status === "unbudgeted"
        ? `${currency(c.spent)} · no budget`
        : `${currency(c.spent)} / ${currency(c.budgeted)}`;
      label.append(nameEl, amountsEl);

      const track = document.createElement("div");
      track.className = `meter-track status-${c.status}`;
      const fill = document.createElement("div");
      fill.className = `meter-fill status-${c.status === "unbudgeted" ? "critical" : c.status}`;
      const widthPct = c.status === "unbudgeted" ? 100 : Math.max(0, Math.min(100, c.pct));
      fill.style.width = `${widthPct}%`;
      track.appendChild(fill);

      const pctEl = document.createElement("div");
      pctEl.className = `meter-pct${c.status === "critical" ? " status-critical-text" : ""}`;
      pctEl.textContent = c.status === "unbudgeted" ? "—" : `${Math.round(Math.min(c.pct, 999))}%`;

      row.title = `${STATUS_ICON[c.status]} ${STATUS_TEXT[c.status]}`;
      row.append(label, track, pctEl);
      container.appendChild(row);
    });
  }

  function renderTable(categories) {
    const tbody = document.querySelector("#data-table tbody");
    tbody.innerHTML = "";
    categories.forEach((c) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = c.name;

      const tdBudget = document.createElement("td");
      tdBudget.textContent = c.budgeted ? currency(c.budgeted) : "—";

      const tdSpent = document.createElement("td");
      tdSpent.textContent = currency(c.spent);

      const tdRemaining = document.createElement("td");
      tdRemaining.textContent = c.budgeted ? currency(c.remaining) : "—";

      const tdPct = document.createElement("td");
      tdPct.textContent = c.budgeted ? `${Math.round(Math.min(c.pct, 999))}%` : "—";

      const tdStatus = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "status-pill";
      const swatch = document.createElement("i");
      swatch.className = `swatch status-${c.status === "unbudgeted" ? "critical" : c.status}`;
      pill.appendChild(swatch);
      pill.appendChild(document.createTextNode(`${STATUS_ICON[c.status]} ${STATUS_TEXT[c.status]}`));
      tdStatus.appendChild(pill);

      tr.append(tdName, tdBudget, tdSpent, tdRemaining, tdPct, tdStatus);
      tbody.appendChild(tr);
    });
  }

  function niceMax(value) {
    if (value <= 0) return 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (const s of steps) {
      if (value <= s * magnitude) return s * magnitude;
    }
    return 10 * magnitude;
  }

  function renderTrend(trend) {
    const wrap = document.getElementById("trend-chart");
    wrap.innerHTML = "";

    const width = 720;
    const height = 220;
    const padL = 56, padR = 20, padT = 20, padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const budgetTotal = trend.length ? trend[0].budgetTotal : 0;
    const maxVal = niceMax(Math.max(budgetTotal, ...trend.map((t) => t.spent)) * 1.1);
    const x = (i) => padL + (trend.length === 1 ? plotW / 2 : (i / (trend.length - 1)) * plotW);
    const y = (v) => padT + plotH - (v / maxVal) * plotH;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Total spend by month, against your total monthly budget");

    // Gridlines + y-axis ticks (0, mid, max)
    [0, 0.5, 1].forEach((f) => {
      const val = maxVal * f;
      const gy = y(val);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", padL); line.setAttribute("x2", width - padR);
      line.setAttribute("y1", gy); line.setAttribute("y2", gy);
      line.setAttribute("class", "trend-gridline");
      svg.appendChild(line);

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", padL - 8); text.setAttribute("y", gy + 4);
      text.setAttribute("text-anchor", "end");
      text.setAttribute("class", "trend-axis-label");
      text.textContent = `RM ${Math.round(val).toLocaleString("en-MY")}`;
      svg.appendChild(text);
    });

    // Budget baseline (dashed, muted — a reference, not a second series to legend)
    if (budgetTotal > 0) {
      const by = y(budgetTotal);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", padL); line.setAttribute("x2", width - padR);
      line.setAttribute("y1", by); line.setAttribute("y2", by);
      line.setAttribute("class", "trend-baseline");
      svg.appendChild(line);

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", width - padR); text.setAttribute("y", by - 6);
      text.setAttribute("text-anchor", "end");
      text.setAttribute("class", "trend-label");
      text.textContent = "Monthly budget";
      svg.appendChild(text);
    }

    // X-axis month labels
    trend.forEach((t, i) => {
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", x(i)); text.setAttribute("y", height - 8);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "trend-axis-label");
      text.textContent = t.label;
      svg.appendChild(text);
    });

    // Spend line
    const points = trend.map((t, i) => `${x(i)},${y(t.spent)}`).join(" ");
    const polyline = document.createElementNS(svgNS, "polyline");
    polyline.setAttribute("points", points);
    polyline.setAttribute("class", "trend-line");
    svg.appendChild(polyline);

    if (trend.length > 0) {
      const last = trend[trend.length - 1];
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", x(trend.length - 1)); text.setAttribute("y", y(last.spent) - 12);
      text.setAttribute("text-anchor", "end");
      text.setAttribute("class", "trend-label");
      text.textContent = "Spent";
      svg.appendChild(text);
    }

    // Dots + hit targets + tooltip
    const tooltip = document.createElement("div");
    tooltip.className = "trend-tooltip";
    tooltip.hidden = true;

    trend.forEach((t, i) => {
      const cx = x(i), cy = y(t.spent);
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("r", 4);
      dot.setAttribute("class", "trend-dot");
      svg.appendChild(dot);

      const hit = document.createElementNS(svgNS, "circle");
      hit.setAttribute("cx", cx); hit.setAttribute("cy", cy); hit.setAttribute("r", 14);
      hit.setAttribute("class", "trend-dot-hit");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-label", `${t.label}: spent ${currency(t.spent)} of ${currency(t.budgetTotal)} budget`);

      const show = () => {
        tooltip.hidden = false;
        tooltip.style.left = `${(cx / width) * 100}%`;
        tooltip.style.top = `${(cy / height) * 100}%`;
        tooltip.innerHTML = "";
        const strong = document.createElement("strong");
        strong.textContent = currency(t.spent);
        tooltip.appendChild(strong);
        tooltip.appendChild(document.createElement("br"));
        const small = document.createElement("span");
        small.textContent = `${t.label} · budget ${currency(t.budgetTotal)}`;
        tooltip.appendChild(small);
      };
      const hide = () => { tooltip.hidden = true; };

      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerleave", hide);
      hit.addEventListener("focus", show);
      hit.addEventListener("blur", hide);
      svg.appendChild(hit);
    });

    const chartWrap = document.createElement("div");
    chartWrap.className = "trend-wrap";
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tooltip);
    wrap.appendChild(chartWrap);
  }

  return { parse, computeMonth, computeTrend, renderStats, renderMeters, renderTable, renderTrend, monthLabel, currency };
})();
