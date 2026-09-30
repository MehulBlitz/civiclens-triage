# CivicLens — Deployment, CI/CD & Mobile Builds

Production web app: **Next.js 14** (dashboard + API routes) with a
**scikit-learn ML service** for triage, a **Neon Postgres** database, and
**Capacitor** native shells for Android/iOS.

**Live:** https://nextjs-boilerplate-one-lac-zbu1jn70rc.vercel.app
(deployed via the Vercel REST API; `DATABASE_URL`, `UPLOADTHING_SECRET`,
`UPLOADTHING_APP_ID` are configured on the project for all targets; the ML
layer intentionally degrades to the in-process lexical engine there —
`/api/health` shows `degraded` until an ML service URL is attached).

---

## 1. Web production deploy

### Freebuff (primary)
1. Push this repository to GitHub (see §2), then connect it in Freebuff.
2. Press **Deploy** once — hosting runs:
   - install: `bun install` (Python/venv intentionally NOT touched — the
     production builder is Node.js-only, so `setup-ml.sh` must never run there)
   - build: `next build`
   - serve: `sh ./scripts/start-prod.sh` (Next.js on `0.0.0.0:$PORT`)
3. Set production env vars in the hosting console (Settings → Environment):
   - `DATABASE_URL` — Neon Postgres connection string
   - `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID` — image evidence uploads
   - optional: `ML_SERVICE_URL`, `CIVIC_NEWS_FEEDS`, `WHATSAPP_VERIFY_TOKEN`

> The production builder is Node.js-only: Python/venv and the trained model
> files are not present there. By design the triage pipeline degrades
> gracefully — L1 (ML service) is skipped and L2 (in-process lexical rules)
> classifies. The app never breaks; the queue labels which layer decided
> (`source_layer`).

### Connecting the real models (the fix for "models aren't connected")

The trained BMC models (SVM bundle + risk NN + photo CNN, v4, n=4822) are
committed in `ml/models/` and ship in a Docker image that any container host
can run. **Vercel/Pages cannot run Python** — the service lives on a
Docker-capable host and both frontends call it over HTTPS:

1. **Deploy the model service (pick one, ~2 minutes):**
   - **Railway** (recommended): railway.app → New Project → Deploy from
     GitHub repo → this repo. `railway.json` is preconfigured (Dockerfile at
     `ml/Dockerfile`, healthcheck `/health`, binds `$PORT`). Generate a
     public domain under Settings → Networking.
   - **Render**: Render dashboard → New → Blueprint → this repo → Apply
     (`render.yaml` is committed). Free tier sleeps after 15 min idle —
     first request wakes it (~30 s).
   - **GHCR image**: every push touching `ml/**` builds
     `ghcr.io/mehulblitz/civiclens-ml:latest` (workflow:
     `deploy-ml-image.yml`) — runnable on any Docker host.
   The image bakes the **verified trained artifacts** — no training at
   build/boot, cold start in seconds, and inference matches the sandbox
   bit-for-bit.
2. **Point the Vercel/Freebuff web app at it:** set env `ML_SERVICE_URL`
   (e.g. `https://civiclens-ml-production.up.railway.app`) in the hosting
   dashboard. `src/lib/triage/ml.ts`, `/api/insights`, `/api/health` and the
   vision layer already read it — `/api/health` flips from `degraded` to
   L1-connected.
3. **Point the GitHub Pages site at it:** add a repository **variable**
   (Settings → Secrets and variables → Actions → Variables)
   `VITE_ML_SERVICE_URL = <service base url>` and re-run
   `deploy-site-pages.yml`. The Pages build injects it and the site upgrades
   from the on-device lexicon to the live SVM triage. If the service is
   unreachable, the site transparently falls back to the browser lexicon and
   the Report page says which mode decided.
4. CORS is open (`*`) on the service — it is a public, read-only inference
   API with no auth surface. Add `allow_origins` pinning if you expose
   anything stateful later.

### Vercel (optional secondary)
The `Deploy Web` workflow triggers an explicit Vercel deploy **only if** you
configure `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets.
Otherwise hosting's Git integration deploys automatically on push to `main`.

---

## 2. Version control

- Default branch: **`main`** (already initialized locally, single clean commit).
- `.gitignore` excludes: all `.env*` files, keystores (`*.jks`, `*.keystore`,
  `*.p12`, `*.p8`, `*.mobileprovision`), `key.properties`, native build
  outputs (`*.apk`, `*.aab`, `*.ipa`, `android/.gradle/`, `ios/App/Pods/`).
- **Never commit** keystore files or passwords. Signing material travels only
  through GitHub Actions Secrets (below).

Connected: **github.com/MehulBlitz/civiclens-triage** (private). Pushes use a
repo-scoped PAT exposed to the app as `GITHUB_TOKEN` (Keys/Environment) via
`sh ./scripts/github-connect.sh` — re-run it any time to push new work.
For routine pushes, `node scripts/ship-main.cjs --all --file MSG.txt` stages,
commits and pushes `main` (falling back to a dated branch + PR if `main` is
protected); the token is fed to git through an ephemeral credential helper
and never printed or persisted.

All CI workflows install with **Bun** (`oven-sh/setup-bun` +
`bun install --frozen-lockfile`) to match `bun.lock`; npm cache/ci steps were
removed because no `package-lock.json` exists.

---

## 3. CI/CD pipelines (GitHub Actions)

| Workflow | Trigger | Runner | Produces |
|---|---|---|───|
| `ci.yml` | push/PR → main | ubuntu | typecheck + web build status |
| `deploy-web.yml` | push → main | ubuntu | production web deploy (Vercel if secrets set) |
| `android-debug.yml` | PR → main, manual | ubuntu | **debug APK** (no secrets needed) |
| `android-release.yml` | push/PR → main, manual | ubuntu | **signed APK + signed AAB** |
| `ios-build.yml` | push/PR → main, manual | **macOS** | **unsigned IPA** (+ signed IPA when secrets exist) |

All build outputs are uploaded as downloadable GitHub Actions **artifacts**
(Actions → run → Artifacts). Nothing is uploaded to Google Play or the App
Store — by design there is no store deployment job anywhere.

---

## 4. Android release signing (JKS via GitHub Secrets)

You (or your team) generate a keystore **once**, locally:

```bash
keytool -genkeypair -v \
  -keystore civiclens-release.jks \
  -alias civiclens \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then base64-encode it (this string goes into a secret, not the repo):

```bash
base64 -w0 civiclens-release.jks        # Linux
base64 -i civiclens-release.jks -o -    # macOS
```

### Required GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 string of `civiclens-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias (e.g. `civiclens`) |
| `ANDROID_KEY_PASSWORD` | key password |

The workflow decodes the JKS to `$RUNNER_TEMP`, generates `key.properties`
for Gradle, builds `assembleRelease` + `bundleRelease`, uploads
`civiclens-android-release-apk` and `civiclens-android-release-aab`
artifacts, then **deletes all signing material from the runner** (`if: always()`).

**No secrets?** `android/app/build.gradle` falls back to the debug signing
config so local/CI builds still produce an installable (non-store) APK.

### Debug APK workflow
`android-debug.yml` builds a plain debug APK — **requires zero secrets** —
and uploads `civiclens-android-debug-apk`. Great for quick device testing
while signing credentials are pending.

---

## 5. iOS build (macOS runner)

### Unsigned IPA (default — no Apple credentials required)
`ios-build.yml` archives with `CODE_SIGNING_ALLOWED=NO`, packages
`Payload/*.app` into `CivicLens-unsigned.ipa`, and uploads it as an artifact.
No Apple Developer account, certificate, or profile needed.

### Signed IPA (optional — only if you want a redistributable signed build)
Add these secrets; the `build-signed` job then activates:

| Secret name | Value |
|---|---|
| `IOS_P12_BASE64` | base64 of your Apple distribution `.p12` certificate |
| `IOS_P12_PASSWORD` | password for the `.p12` |
| `IOS_MOBILEPROVISION_BASE64` | base64 of the `.mobileprovision` profile |
| `IOS_TEAM_ID` | your Apple Developer Team ID (10 chars) |

The job imports the cert into a temporary keychain, installs the profile,
archives with `CODE_SIGN_STYLE=Manual`, and cleans the keychain afterward
(`if: always()`). **No App Store Connect upload step exists.**

---

## 6. What is explicitly NOT required

- **Capacitor / Ionic need no API key.** They are local build tooling only.
- No Google Play service account, no App Store Connect API key — the brief
  forbids store uploads and no such job exists in any workflow.
- No Firebase, no push-service JSON, no `google-services.json` (the Android
  template's optional google-services plugin is simply skipped when the file
  is absent).
- `CAP_SERVER_URL` (non-secret, optional): set at `cap sync` time to point
  the native WebView at the deployed dashboard. If unset, the shipped static
  shell links to `/` which the WebView resolves to the bundled shell page.

---

## 7. Local mobile development

```bash
bun run cap:sync        # export web shell + copy to native projects
bun run android:debug   # debug APK via Gradle
bun run android:release # signed release APK + AAB (needs local key.properties)
bun run ios:build       # local unsigned archive (macOS only)
```

Native projects live in `android/` and `ios/` and are committed (sources
only — build outputs are ignored).
