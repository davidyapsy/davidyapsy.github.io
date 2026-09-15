// Thin wrapper around the Supabase client so the rest of the app just
// uses `db` without worrying about setup / missing config.

const CONFIG_IS_MISSING =
  !window.APP_CONFIG ||
  !window.APP_CONFIG.SUPABASE_URL ||
  window.APP_CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF") ||
  !window.APP_CONFIG.SUPABASE_ANON_KEY ||
  window.APP_CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON-PUBLIC-KEY");

const db = CONFIG_IS_MISSING
  ? null
  : supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);

const STORAGE_BUCKET = (window.APP_CONFIG && window.APP_CONFIG.STORAGE_BUCKET) || "food-photos";
