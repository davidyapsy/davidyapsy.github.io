// Budget Pulse — Google sign-in via Google Identity Services (GIS).
// Uses the OAuth2 implicit token flow, scoped to read-only Sheets access.
// The access token lives only in memory (a JS variable) for this tab — it is
// never written to localStorage or sent anywhere but Google's own API.
//
// This flow deliberately never obtains a refresh token (that would require a
// backend to hold it safely), so "staying signed in" here means three
// smaller, honest things instead of one big one:
//  1. A quiet, non-interactive re-auth attempt on load and on refocus, which
//     succeeds instantly if the browser still has a live Google session and
//     nothing is blocking it (see the FedCM/third-party-cookie note below).
//  2. Remembering *which* account signed in last (as a `login_hint`, not a
//     credential) so if a prompt does have to show, it skips straight to
//     "Continue as you" instead of a full account chooser.
//  3. Proactively renewing the ~1-hour token in the background while the tab
//     stays open, so an in-progress session never dead-ends mid-use.
//
// What this can't do: guarantee zero prompts forever. Google's own silent
// check runs through a background iframe that depends on first-party-ish
// cookie access to accounts.google.com. If a browser blocks third-party
// cookies for that (increasingly the default), the silent attempt fails and
// a manual "Sign in" click is genuinely required — that's Google's
// boundary, not something fixable from a static site with no backend.

const Auth = (() => {
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let refreshTimer = null;

  function isSignedIn() {
    return Boolean(accessToken) && Date.now() < tokenExpiresAt;
  }

  function getToken() {
    return isSignedIn() ? accessToken : null;
  }

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function signOut() {
    clearRefreshTimer();
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
  }

  // Best-effort only: learns the signed-in account's email so future sign-ins
  // can carry it as a login_hint. Never blocks or fails the actual sign-in.
  function rememberEmail(token) {
    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (info?.email) Config.save({ lastEmail: info.email });
      })
      .catch(() => {});
  }

  // Quietly renews the token ~2 minutes before it expires, as long as the tab
  // stays open — so a long session never suddenly hits an expired token.
  function scheduleProactiveRefresh() {
    clearRefreshTimer();
    const delay = Math.max(tokenExpiresAt - Date.now() - 120000, 30000);
    refreshTimer = setTimeout(() => {
      requestToken({ interactive: false }).catch(() => {});
    }, delay);
  }

  // GIS's script tag loads with `async`, so on a slow connection (common on
  // phones) it can still be mid-download when the page's own DOMContentLoaded
  // fires. Poll briefly rather than giving up on the very first check —
  // otherwise the automatic silent-reauth attempt can silently no-op.
  function waitForGis(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      const start = Date.now();
      const interval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error("Google Identity Services hasn't loaded yet — check your internet connection and reload."));
        }
      }, 150);
    });
  }

  /**
   * Requests (or silently reuses) an access token.
   * Returns a Promise<string> resolving to the access token.
   */
  async function requestToken({ interactive = true } = {}) {
    if (isSignedIn()) return accessToken;

    const settings = Config.load();
    const clientId = settings.clientId;
    if (!clientId) {
      throw new Error("No Google OAuth Client ID configured yet. Open Settings to add one.");
    }

    await waitForGis(interactive ? 15000 : 5000);

    return new Promise((resolve, reject) => {
      const promptValue = interactive ? "" : "none";

      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        // `email` (a non-sensitive, standard scope) is only used to remember
        // *which* account this is, for the login_hint trick above — never
        // shown or stored anywhere but this browser's localStorage.
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email",
        prompt: promptValue,
        login_hint: settings.lastEmail || undefined,
        callback: (response) => {
          if (response.error) {
            reject(new Error(`Google sign-in failed: ${response.error}`));
            return;
          }
          accessToken = response.access_token;
          const expiresInSeconds = Number(response.expires_in || 3600);
          tokenExpiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
          rememberEmail(accessToken);
          scheduleProactiveRefresh();
          resolve(accessToken);
        },
        error_callback: (err) => {
          reject(new Error(err?.message || "Google sign-in was cancelled or failed."));
        },
      });

      tokenClient.requestAccessToken({ prompt: promptValue, login_hint: settings.lastEmail || undefined });
    });
  }

  return { requestToken, isSignedIn, getToken, signOut };
})();
