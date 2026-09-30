# CivicLens React UI — the GitHub Pages build

A standalone **Vite + React 18 + Tailwind 3** website: the nagarsevak /
ward-governance experience of CivicLens, restyled with an **Anime.js + scroll-tide**
visual language (ScrollTide-style reveals, animated wave hero, count-ups) that is
deliberately **different from the main dashboard's** instrument look.

Static by design: GitHub Pages has no Python runner and no Docker, so this site
ships the **distilled BMC lexicon** (`src/lib/data/triage_lexicon.json`, generated
by `ml/export_bmc_lexicon.py` from the BMC/Mumbai corpus) and runs the triage
pipeline **entirely client-side** — same 3-layer contract (lexicon → rules →
manual review), same taxonomy, same SLA math, layer labelled on every ticket.

## Run it

```bash
cd site
bun install        # or npm install
bun run dev        # dev server on 0.0.0.0
bun run build      # static output in dist/ (relative base ./ — works on any sub-path)
bun run typecheck
```

## Deploy to GitHub Pages

`base` is `./`, so `dist/` works from any sub-path. Two options:

**A. Actions (recommended)** — the repo already contains
`.github/workflows/deploy-site-pages.yml`. After pushing to GitHub:
1. Settings → Pages → Source: **GitHub Actions**.
2. Push a change under `site/**` (or run the workflow manually) — the site goes
   live at `https://<user>.github.io/<repo>/`.

**B. Manual** — push `site/dist` to a `gh-pages` branch
(`npx gh-pages -d site/dist` or any static deploy tool).

## Pages

| Route | What it does |
|---|---|
| `/` | Anime.js wave hero, live BMC ticker, 3-layer pipeline explainer, demo queue |
| `/nagarsevak` | Corporator directory — search, zone filter, SLA/response metrics, WhatsApp escalation |
| `/nagarsevak/:id` | Ward profile — live ward queue, accountability meters, escalation explainer |
| `/report` | Snap & Send — live client-side triage preview (category/priority/department/signals) + photo check |
| `/track` | Public lifecycle stepper + SLA clock + co-sign (escalates at 5) |
| `/karma` | Civic Karma wallet, tiers, leaderboard |

Routing is hash-based (`HashRouter`) so deep links work on GitHub Pages
without 404 rewrites.

## Data & honesty notes

- Ward/zone structure mirrors the real MCGM ward map; representative rows are
  clearly-marked demo data.
- The lexicon JSON embeds **held-out accuracy measured on the BMC corpus**
  (see `metrics` inside the JSON) — the site displays that number, not a
  invented one.
- Ticket submissions persist to `localStorage` (single-device demo state);
  the full Postgres-backed app lives in the main repository.
