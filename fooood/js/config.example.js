// Copy this file to js/config.js and fill in your own Supabase project's
// values (Project Settings > API Keys in the Supabase dashboard).
//
// Use the PUBLISHABLE key (starts with "sb_publishable_"), or on an older
// project the "anon" / "public" key (a long string starting "eyJ..."). It
// is *meant* to be visible in client-side code like this — Supabase's
// security comes from the Row Level Security policies in
// supabase/schema.sql, not from hiding this key.
//
// Do NOT put the SECRET key here (starts with "sb_secret_", or on an
// older project "service_role"). It must stay private, and Supabase
// actively rejects it from a browser with a 401 "Invalid API key" —
// that's the #1 cause of a 401 on every request if you hit one.
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
  STORAGE_BUCKET: "food-photos",
};
