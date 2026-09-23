import type { CapacitorConfig } from "@capacitor/cli";

/**
 * CivicLens mobile shells (Android/iOS via Capacitor).
 *
 * Strategy: the native app is a thin shell around the deployed web app.
 * - `webDir` points to the static export of the mobile landing shell
 *   (produced by `bun run mobile:export`) so the app boots instantly offline.
 * - `server.url` (set from CAP_SERVER_URL at sync time) routes the WebView to
 *   the production site, where the full dashboard + APIs live. This keeps the
 *   native binaries tiny and the data pipeline server-side.
 *
 * For a fully offline native app later: swap server.url for API base URL
 * injection and ship the triage UI inside the bundle.
 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "gov.civiclens.app",
  appName: "CivicLens",
  webDir: "mobile/www",
  ...(serverUrl
    ? { server: { url: serverUrl, cleartext: false, androidScheme: "https" } }
    : {}),
  android: {
    allowMixedContent: false
  },
  ios: {
    contentInset: "automatic"
  }
};

export default config;
