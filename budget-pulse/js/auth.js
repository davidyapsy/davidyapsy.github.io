// Budget Pulse — Google sign-in via Google Identity Services (GIS).
// Uses the OAuth2 implicit token flow, scoped to read-only Sheets access.
// The access token lives only in memory (a JS variable) for this tab — it is
// never written to localStorage or sent anywhere but Google's own API.

const Auth = (() => {
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;

  function isSignedIn() {
    return Boolean(accessToken) && Date.now() < tokenExpiresAt;
  }

  function getToken() {
    return isSignedIn() ? accessToken : null;
  }

  function signOut() {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
  }

  /**
   * Requests (or silently reuses) an access token.
   * Returns a Promise<string> resolving to the access token.
   */
  function requestToken({ interactive = true } = {}) {
    return new Promise((resolve, reject) => {
      if (isSignedIn()) {
        resolve(accessToken);
        return;
      }
      if (!window.google?.accounts?.oauth2) {
        reject(new Error("Google Identity Services hasn't loaded yet — check your internet connection and reload."));
        return;
      }
      const clientId = Config.load().clientId;
      if (!clientId) {
        reject(new Error("No Google OAuth Client ID configured yet. Open Settings to add one."));
        return;
      }

      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        prompt: interactive ? "" : "none",
        callback: (response) => {
          if (response.error) {
            reject(new Error(`Google sign-in failed: ${response.error}`));
            return;
          }
          accessToken = response.access_token;
          const expiresInSeconds = Number(response.expires_in || 3600);
          tokenExpiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
          resolve(accessToken);
        },
        error_callback: (err) => {
          reject(new Error(err?.message || "Google sign-in was cancelled or failed."));
        },
      });

      tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
    });
  }

  return { requestToken, isSignedIn, getToken, signOut };
})();
