# fooood 🍙

A little home for her food rankings — replaces the running list in Google Notes with something she can actually browse, rank by dragging, and add photos to.

Static frontend (plain HTML/CSS/JS, no build step) + [Supabase](https://supabase.com) as the free backend, hosted on GitHub Pages.

## What it does (v1)

- Create ranking lists ("FamilyMart Onigiri", "7-Eleven Desserts", …)
- Add food to a list — name, photo, price, notes
- Drag to reorder — the order *is* the ranking, top of the list = #1, with 🥇🥈🥉 for the top 3
- Search everything she's tried, from the home page
- Edit / delete lists and items
- Mobile-first — the whole point is she can add food while standing in the store

Not in v1 (on purpose, see the project notes if you want to add them later): the "suggest food to try" internet-search feature, and a shared/couple layer for reactions — both were scoped out to ship the ranking database first.

## 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is plenty for this).
2. Create a new project. Pick any name/region; save the database password somewhere (you won't need it for this app, but Supabase asks).
3. Once it's provisioned, open **SQL Editor** in the left sidebar → **New query**.
4. Paste in the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the `lists` and `food_items` tables, the storage bucket for photos, and the access policies.
5. Open **Project Settings → API Keys**. You'll need two values from here for step 2 below:
   - **Project URL**
   - The **Publishable** key (starts with `sb_publishable_`) — or on an older project, the **anon / public** key (a long `eyJ...` string)
   - ⚠️ Do **not** copy the **Secret** key (`sb_secret_...`, or on an older project `service_role`). It must stay private, and Supabase will actively reject it from a browser with `401 Invalid API key` — if every request 401s, this is almost always why.

## 2. Point the site at your project

In the `js/` folder:

```
cp js/config.example.js js/config.js
```

Edit `js/config.js` and paste in your Project URL and anon key:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  STORAGE_BUCKET: "food-photos",
};
```

`config.js` needs to be committed to the repo (not gitignored) — GitHub Pages only serves static files, so this file has to actually be there for the live site to work. That's fine: the key is designed to be public in client-side apps like this one; real protection comes from the Row Level Security policies already set up in `schema.sql`, not from hiding the key.

**Seeing `401` on every request?** Almost always the Secret key got pasted in instead of the Publishable key (see the warning above) — double check `js/config.js` against **Project Settings → API Keys** again. If you're testing with VS Code's Live Server, also do a hard refresh (Live Server can serve a cached copy of `config.js` after you edit it) and check the failing request's response body in the browser's Network tab — Supabase's own error message there (e.g. `"Invalid API key"`) confirms which key is wrong.

## 3. Try it locally (optional but recommended)

Any static file server works, e.g.:

```
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL. You should see an empty "Her food hall of fame" home screen — try adding a list and a food item.

## 4. Deploy to GitHub Pages

1. Push this folder to a GitHub repo (or a subfolder of your existing `davidyapsy.github.io` repo).
2. In the repo's **Settings → Pages**, set the source to the branch/folder this lives in.
3. Give it a minute, then open the URL GitHub gives you.

Share that URL with her — that's the whole "install."

## A couple of things worth knowing

- **No login screen.** This is a private single-user app protected only by the URL being unlisted — don't post it publicly. If you want real access control later, add Supabase Auth (email magic link is the easiest) and change the RLS policies in `schema.sql` from "public" to "check `auth.uid()`".
- **Photos** are resized client-side (max ~900px) before upload, so they stay small in Supabase's free storage tier.
- **Free tier limits:** Supabase's free plan is generous for a personal app like this (500MB database, 1GB file storage, pauses after a week of total inactivity — opening the site wakes it back up in a few seconds).

## Where to take it next (v2 ideas)

The project notes already sketch these out if/when you want them: "suggest food to try" recommendations pulled from web search, a taste profile, a random "what should I eat" picker, a food diary/timeline, and a lightweight layer for you to react to her rankings. The data model (`lists` → `food_items` with a `rank`) was kept simple on purpose so all of these can be added later without a rewrite.
