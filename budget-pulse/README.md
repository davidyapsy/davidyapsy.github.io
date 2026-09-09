# Budget Pulse

A tiny budget-vs-actual dashboard that reads straight from a Google Sheet you
already keep — no uploading a spreadsheet every month end, no backend, no
database. It's a static site (HTML/CSS/JS, no build step) meant to be hosted
for free on GitHub Pages.

You keep recording your transactions the way you already do — one row per
transaction, one tab per month, weekly entries summarized at month end.
Budget Pulse reads that sheet directly in your browser via the Google Sheets
API and shows you, per category, whether you're under, near, or over budget —
plus a spend trend across months.

**Your data never leaves your browser except to talk directly to Google.**
There's no server component at all: the page calls `sheets.googleapis.com`
with a token from your own Google sign-in, computes everything client-side,
and throws it away when you close the tab. Nothing is written back to the
sheet either — this is read-only.

## What it looks like

- **Per-category meters** — a progress bar per category for the selected
  month, colored green/amber/red by how much of the budget is used.
- **Stat tiles** — total budgeted, total spent, remaining, and how many
  categories are over budget, for the selected month.
- **Trend chart** — total spend by month against your overall monthly budget,
  so you can see whether a bad month was a blip or a pattern.
- **Table view** — the same numbers as a plain table, for copy-pasting or a
  denser read.
- **Sample data mode** — click "Try it with sample data" to see the whole
  thing without connecting a real sheet.

## Your Google Sheet

One spreadsheet per calendar year (start a new one every January — same as
switching to a new Excel file each year). It holds:

**A `Budget` tab** — one row per category you actually want to track. Fixed,
autopay-style expenses (rent/loan payments, insurance, standing transfers)
don't belong here — if you never log day-to-day transactions for something,
there's nothing for this dashboard to compare it against:

| Category | Monthly Budget |
|---|---|
| Food | 794 |
| Transportation | 200 |
| Health | 72 |
| Babe | 100 |
| Entertainment | 40 |
| Social | 50 |
| Apparel | 100 |
| Household | 40 |
| Other | 100 |
| Telco | 30 |
| Education | 50 |

**One tab per month** — `Jan`, `Feb`, `Mar`, ... `Dec` (also accepts full
names and a couple of common spellings like `Sept`/`July`). Only create the
tabs you're using — a fresh year's sheet can start with just `Jan`. Add the
next month's tab whenever you're ready for it (copy the previous tab and
clear the rows is the easiest way to keep the columns consistent). Each row
is a transaction:

| Date | Category | Notes | Food Sub-Category | Income (+) | Expense (-) |
|---|---|---|---|---|---|
| 1 | Food | | Lunch | | 18.50 |
| | Transportation | Toll | | | 5.55 |
| 2 | Food | | Breakfast | | 9.00 |

`Date` is just the day-of-month number — leave it **blank on a second
transaction the same day** (like the second row above); Budget Pulse carries
the day down from the row above it, same as reading the sheet by eye. `Food
Sub-Category` only matters for the `Food` row's own note-taking (Breakfast /
Lunch / Dinner / etc.) — Budget Pulse rolls it up into the `Food` total for
now. `Income (+)` is there if you want to log income the same way; only the
`Expense (-)` column feeds the budget comparison.

Column order matters (A–B for `Budget`, A–F for each month tab); header row
is expected on row 1 and is skipped automatically. The `Budget` tab's name is
configurable in Settings if you'd rather call it something else — month tabs
are found automatically, nothing to configure there.

Starter CSVs matching this layout are in [`templates/`](templates) —
`Budget.csv` and a `Month-tab-template.csv` you can import once per month tab
(**File → Import → Insert new sheet**) and rename to that month.

## One-time setup

You need two things: a Google OAuth Client ID (so your browser can ask
Google, on your behalf, for read access to Sheets) and your spreadsheet's ID.
Both are entered in the app's **Settings** panel — nothing to edit in code.

### 1. Create the Google Sheet

Make a Google Sheet with a `Budget` tab and an `Expenses` tab as described
above (or import the CSVs in `templates/`). Copy its **Spreadsheet ID** out of
the URL:

```
https://docs.google.com/spreadsheets/d/  1AbCdEfGhIjKlMnOpQrStUvWxYz...  /edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ this part
```

### 2. Create an OAuth Client ID

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a new project (or reuse one) — this is free.
2. **APIs & Services → Library** — search for **Google Sheets API** and
   enable it.
3. **APIs & Services → OAuth consent screen** — choose **External**, fill in
   an app name and your email, and add yourself as a **test user** (this
   keeps the app in "testing" mode, which is fine for personal/demo use — no
   Google review needed).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** —
   application type **Web application**. Under **Authorized JavaScript
   origins**, add the URL you'll host this on, e.g.
   `https://<your-username>.github.io`. Save, then copy the **Client ID**
   (looks like `123456-abc.apps.googleusercontent.com`).

### 3. Deploy to GitHub Pages

1. Push this repo to your own GitHub account.
2. **Settings → Pages** on the repo — set the source to the `main` branch,
   root folder. Save; GitHub gives you a URL like
   `https://<your-username>.github.io/budget-pulse/`.
3. If your Pages URL includes a path (like `/budget-pulse/`), go back to your
   OAuth Client ID in Google Cloud and make sure the **origin** you added is
   just the scheme + host (`https://<your-username>.github.io`, no path) —
   Google authorizes by origin, not by full URL.

### 4. Connect the app

Open your deployed page, click **Settings**, and paste in the Client ID and
Spreadsheet ID, and confirm the **Year** (defaults to the current year — this
is what turns a month tab's day number into a real date, so update it each
January when you start a new spreadsheet). Click **Save**, then **Sign in
with Google**. You'll see the standard Google consent screen asking for
read-only Sheets access — approve it, and the dashboard loads. These settings
are remembered in your browser (`localStorage`) so you won't need to re-enter
them, though you will need to sign in again each time you return (the app
only ever holds a short-lived token in memory, never a refresh token, by
design).

## Running locally

No build step — just serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

For local testing, add `http://localhost:8000` as an additional Authorized
JavaScript origin on the OAuth Client ID.

## Limitations / possible next steps

- Budgets are a single flat amount per category (not per-month) — a month
  with a different budget isn't supported yet.
- Categories are matched by exact text, so keep spelling consistent between
  the `Budget` tab and each month tab (a mismatched category shows up as
  "no budget set" rather than silently merging).
- One-off big items (a birthday, a trip) that don't fit the monthly rhythm —
  what an `Extra` tab is for in the original Excel version — aren't read yet.
- No `Food Sub-Category` breakdown in the dashboard yet (Breakfast / Lunch /
  Dinner / ...) — it's read but only rolled into the `Food` total for now.
- Read-only by design — it won't ever write back to your sheet.
- No offline caching yet — every load re-fetches from the Sheets API.

## Why this instead of a file-upload tool

An earlier version of this idea was "upload your budget and expense Excel
files every month end and get a comparison." That works, but it means the
tool only ever tells you what already happened. Reading live from a sheet you
already update means the dashboard is accurate as of today, not as of last
month's export — and there's no upload step at all.

## License

MIT — see [`LICENSE`](LICENSE).
