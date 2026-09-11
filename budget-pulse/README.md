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
  month, colored green/amber/red by how much of the budget is used. Food's
  row also carries a nested breakdown by sub-category (Breakfast, Lunch,
  Dinner, ...), each against its own budget — scoped to whichever month is
  selected, same as every other row. Only when you're looking at the
  current real month does each sub-category also get a running "RM X / day"
  left until payday.
- **Stat tiles** — total budgeted, total spent, remaining, and how many
  categories are over budget, for the selected month.
- **Trend chart** — total spend by month against your overall monthly budget,
  so you can see whether a bad month was a blip or a pattern.
- **Sample data mode** — click "Try it with sample data" to see the whole
  thing without connecting a real sheet.
- Mobile-friendly, and installable on your phone's home screen (see
  "Installing it on your phone" below).

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
| Food: Breakfast | 200 |
| Food: Lunch | 350 |
| Food: Dinner | 244 |

The last three rows are optional, and only Food supports them: any row named
`Food: <something>` (also accepts `Food - <something>`) sets a budget for
that *sub-category* — matching whatever you type into the Food Sub-Category
column in a month tab (Breakfast/Lunch/Dinner, or your own names) — instead
of adding another top-level category. It's what drives the "left to spend
per day until payday" breakdown nested under Food's row in the category
list, kept independent of Food's own overall row above: the two aren't
cross-checked against each other, so it's on you to keep them sensible
together if that matters to you.

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
   Google review needed). Under **Data Access → Add or remove scopes**, add
   both `.../auth/spreadsheets.readonly` and `.../auth/userinfo.email` — the
   second one is just so Budget Pulse can remember *which* Google account
   signed in last (see "Staying signed in" below), never anything sensitive.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** —
   application type **Web application**. Under **Authorized JavaScript
   origins**, add the URL you'll host this on, e.g.
   `https://<your-username>.github.io`. Save, then copy the **Client ID**
   (looks like `123456-abc.apps.googleusercontent.com`).

   > Paste only that ID into Budget Pulse's Settings — no `https://` in
   > front of it. That field is a client ID, not a URL; a stray `https://`
   > (or trailing space) gets rejected as `Error 401: invalid_client`.

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
Spreadsheet ID, confirm the **Year** (defaults to the current year — this
is what turns a month tab's day number into a real date, so update it each
January when you start a new spreadsheet), and set **Salary day of month**
(defaults to 28 — this drives the Food "left to spend per day" breakdown
nested under Food in "Spending by category"; capped at 28 so it's always a
real date, even in February). Click **Save**, then **Sign in with Google**. You'll see the
standard Google consent screen asking for read-only Sheets access — approve
it, and the dashboard loads. These settings are remembered in your browser
(`localStorage`) so you won't need to re-enter them.

### Staying signed in

The app only ever holds a short-lived (~1 hour) access token in memory, never
a refresh token — that's a deliberate choice, since a static site with no
backend has nowhere safe to keep a permanent credential. In practice that
still adds up to something close to "stay signed in":

- Every time you open the app, and every time you switch back to it, it
  quietly tries to re-authenticate in the background — no click needed — and
  while the tab/app stays open it renews the token before it expires, so an
  in-progress session doesn't get interrupted.
- If a prompt does have to show, it remembers which Google account you used
  last and skips straight to that account instead of showing the chooser.

Whether the *silent* part above succeeds depends on your browser still
letting Google's background sign-in check see your Google session cookie.
If your browser blocks third-party cookies (increasingly the default in
Chrome, and always the case in Safari/iOS and in Incognito), that silent
check can't complete, and you'll land on a real "Sign in with Google" click
each time instead — that's Google's own security boundary for apps with no
backend, not something this app can override. If you want to test whether
that's what's happening: `chrome://settings/cookies` → check whether
third-party cookies are blocked, and whether `accounts.google.com` has an
exception.

## Running locally

No build step — just serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

For local testing, add `http://localhost:8000` as an additional Authorized
JavaScript origin on the OAuth Client ID.

## Installing it on your phone

Budget Pulse is a Progressive Web App (PWA) — once it's deployed to GitHub
Pages (HTTPS is required for this part; `localhost` also works for testing),
your phone can install it as a home-screen app with its own icon, no app
store involved:

- **Android (Chrome)**: open the deployed page, tap the **⋮** menu → **Add to
  Home screen** / **Install app** (Chrome sometimes offers this as a banner
  automatically). It'll open full-screen, without browser chrome, like any
  other app.
- **iPhone/iPad (Safari)**: open the page, tap the **Share** icon → **Add to
  Home Screen**. Chrome on iOS can't do this — it has to be Safari.

What "installed" gets you: instant opening (the app shell loads from cache,
even offline), a real icon and app-switcher entry, and no address bar. It
does **not** mean your budget data is available offline — that still has to
come live from Google Sheets, so you need a connection to see current
numbers. Signing in still briefly hands off to the browser/a Google system
sheet for the consent screen, even from the installed app — that's Google's
own security requirement (it won't authenticate inside an embedded app
view), and you're dropped right back into Budget Pulse afterwards.

If you change any HTML/CSS/JS file later, bump `CACHE_VERSION` at the top of
`service-worker.js` (e.g. `"v1"` → `"v2"`) — otherwise anyone who's already
installed the app keeps seeing the old cached version until that changes.

## Limitations / possible next steps

- Budgets are a single flat amount per category (not per-month) — a month
  with a different budget isn't supported yet.
- Categories are matched by exact text, so keep spelling consistent between
  the `Budget` tab and each month tab (a mismatched category shows up as
  "no budget set" rather than silently merging).
- One-off big items (a birthday, a trip) that don't fit the monthly rhythm —
  what an `Extra` tab is for in the original Excel version — aren't read yet.
- The Food "RM X/day left until payday" figure only appears for the current
  real month, and only up to payday itself — for the few trailing days of a
  month after payday has already passed (e.g. the 29th–31st, if payday is
  the 28th), the sub-category rows just show spent/budgeted with no
  per-day figure, since that stretch really belongs to next month's budget
  rather than this one.
- Only Food gets sub-category budgets — the `Food: <name>` convention isn't
  read for any other category.
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
