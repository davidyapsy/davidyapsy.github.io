# fooood 🍙

A little home for her food rankings — replaces the running list in Google Notes with something she can actually browse, rank by dragging, and add photos to.

Static frontend (plain HTML/CSS/JS, no build step) + [Firebase](https://firebase.google.com) (Firestore + Cloud Storage) as the free backend, hosted on GitHub Pages.

## What it does (v1)

- Create ranking lists ("FamilyMart Onigiri", "7-Eleven Desserts", …)
- Add food to a list — name, photo, price, notes
- Drag to reorder — the order *is* the ranking, top of the list = #1, with medal icons for the top 3
- Filter items within a list, from the list page
- Edit / delete lists and items
- Mobile-first — the whole point is she can add food while standing in the store, with either the gallery or the camera for photos

Not in v1 (on purpose, see the project notes if you want to add them later): the "suggest food to try" internet-search feature, and a shared/couple layer for reactions — both were scoped out to ship the ranking database first.

## 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) and sign in with a Google account.
2. **Add project** → give it any name → you can skip Google Analytics (not needed here) → **Create project**.
3. In the left sidebar, open **Build → Firestore Database** → **Create database** → start in **production mode** → pick any region close to you → **Enable**. (Production mode just means it starts locked down; the rules you paste in step 3 below open it back up for this app.)
4. Still in the left sidebar, open **Build → Storage** → **Get started**. This is the one step with a catch: Cloud Storage requires the pay-as-you-go **Blaze** plan (a card on file), even though real usage for an app this size stays inside the free allowance (Blaze still gives ~5GB stored and ~1GB/day downloaded at $0 cost — the free Spark plan simply doesn't include Storage at all). If it prompts you to upgrade, that's expected — go ahead.
5. Register a web app: **Project settings** (gear icon, top of the sidebar) → scroll to **Your apps** → click the `</>` (web) icon → give it a nickname → **Register app**. You don't need Firebase Hosting here (the site's already on GitHub Pages). This shows you a `firebaseConfig` object with the values you'll need for step 2 below.

## 2. Paste in the security rules and create the one required index

Still in the Firebase console:

1. **Firestore Database → Rules** tab → replace the contents with everything in [`firestore.rules`](firestore.rules) → **Publish**.
2. **Storage → Rules** tab → replace the contents with everything in [`storage.rules`](storage.rules) → **Publish**.
3. Firestore needs one composite index (a query that filters on `listId` and sorts by `rank` at the same time isn't something it indexes automatically). Easiest way: just use the app once you've finished setup below — the first time you open a list, Firestore will throw an error in the browser console with a link that creates the exact index needed, one click. Alternatively, create it ahead of time: **Firestore Database → Indexes** tab → **Create index** → collection ID `food_items` → add field `listId` (Ascending) → add field `rank` (Ascending) → **Create**. (The same index is also described in [`firestore.indexes.json`](firestore.indexes.json) if you ever set up the Firebase CLI.) It takes a minute or two to finish building.

## 3. Point the site at your project

In the `js/` folder:

```
cp js/config.example.js js/config.js
```

Edit `js/config.js` and paste in the values from the `firebaseConfig` object you saw when registering the web app (step 1.5 above) — also available any time under **Project settings → Your apps**:

```js
window.APP_CONFIG = {
  FIREBASE_API_KEY: "AIzaSy...",
  FIREBASE_AUTH_DOMAIN: "your-project-id.firebaseapp.com",
  FIREBASE_PROJECT_ID: "your-project-id",
  FIREBASE_STORAGE_BUCKET: "your-project-id.firebasestorage.app",
  FIREBASE_APP_ID: "1:1234567890:web:abcdef123456",
};
```

`config.js` needs to be committed to the repo (not gitignored) — GitHub Pages only serves static files, so this file has to actually be there for the live site to work. That's fine: none of these values are secret — Firebase's real protection comes from the rules you pasted in step 2, not from hiding this config.

**Seeing a `permission-denied` error in the browser console?** Double-check the Rules tabs in step 2 actually got published (there's a separate **Publish** button after pasting — easy to miss). **Seeing `failed-precondition` when opening a list?** That's the missing composite index from step 2.3 — click the link in the error to create it, then reload once it finishes building (watch its status go from "Building" to "Enabled" in the Indexes tab).

## 4. Seed some sample data (optional)

Open [`seed-sample-data.html`](seed-sample-data.html) locally (same local server as step 5 below, e.g. `http://localhost:8000/seed-sample-data.html`) and click the button — it adds 5 sample lists with a few items each, so the app isn't starting empty. Safe to skip if you'd rather start blank; just don't click it twice, since it doesn't check for existing data.

## 5. Try it locally (optional but recommended)

Any static file server works, e.g.:

```
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL. You should see an empty "Her food hall of fame" home screen — try adding a list and a food item.

## 6. Deploy to GitHub Pages

1. Push this folder to a GitHub repo (or a subfolder of your existing `davidyapsy.github.io` repo).
2. In the repo's **Settings → Pages**, set the source to the branch/folder this lives in.
3. Give it a minute, then open the URL GitHub gives you.

Share that URL with her — that's the whole "install."

## A couple of things worth knowing

- **No login screen.** This is a private single-user app protected only by the URL being unlisted — don't post it publicly. If you want real access control later, add Firebase Authentication (email link is the easiest) and change `firestore.rules` / `storage.rules` from `allow read, write: if true;` to something that checks `request.auth != null`.
- **Photos** are resized client-side (max ~900px, ~240px for icons) before upload, so they stay small in Storage.
- **Free allowance:** the always-free Blaze allowance (~5GB stored, ~1GB/day downloaded, generous read/write quotas) comfortably covers a personal app like this, and unlike Supabase's free tier, nothing here pauses after a week of inactivity — it's just normal pay-as-you-go infrastructure sitting at $0.

## Where to take it next (v2 ideas)

The project notes already sketch these out if/when you want them: "suggest food to try" recommendations pulled from web search, a taste profile, a random "what should I eat" picker, a food diary/timeline, and a lightweight layer for you to react to her rankings. The data model (`lists` → `food_items` with a `rank`) was kept simple on purpose so all of these can be added later without a rewrite.
