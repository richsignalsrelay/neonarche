**Flow Scorecard**

A Backstage plugin that tracks the health of critical user journeys — login, checkout, account creation — across every stage of validation, from pre-merge testing through production monitoring.

Instead of checking four separate tools to answer "is login actually working," Flow Scorecard gives you one scorecard, per user flow, right in the Backstage catalog you already use.

**What it does**

Flow Scorecard registers each critical user journey as a first-class Backstage entity (kind: Flow), then attaches a scorecard showing whether that flow is passing at every layer:

**Pre-merge** — validated in ephemeral preview environments
**Pipeline** — CI test results (Playwright)
**Production** — canary health, by region (AWS CloudWatch Synthetics)
**Coverage** — test execution history and flakiness (Jira Xray)

All four layers reference the same underlying flow definition, so a failure at any layer can be traced back to the exact same workflow — no more manually cross-referencing four dashboards during an incident.

**Status**

**Early beta.** The entity model and fact producers are functional; UI shown in early demos is a static mock of the intended scorecard shape, not yet wired to a live fact store or the Soundcheck check/scorecard API.

Expect the schema (spec.owner, spec.dependsOn, spec.layers) to shift before a second team adopts this — nothing here is stable yet.

**What's open, what's not**

This project is built open-core, on purpose:

Tier	Includes
Open (this repo)	Flow entity model, scorecard view, fact producers for CI and canary results
Paid (separate)	Automated failure correlation (tracing a broken flow to the responsible commit, PR, or feature flag) and risk-scored release recommendations (promote / pause / rollback / disable flag)

If you adopt the open tier, you get real, standalone value — a better scorecard, on an entity model that will outlast any future paid features. Stopping here is a legitimate outcome, not a lesser one.

**Getting started**
# install (placeholder — package not yet published)
yarn add @your-org/plugin-flow-scorecard

Point the plugin at your flows.json manifest and your CI/canary integrations. Flow entities and their checks populate from there.

**Manifest format**

Flows are defined with a small, intentionally limited action vocabulary — navigate, input, click, assert — kept minimal on purpose. Anything more complex belongs in your test framework, not the manifest.

json
{
  "id": "login-happy-path",
  "criticality": "high",
  "steps": [
    { "action": "navigate", "url": "/login" },
    { "action": "input", "selector": "#email" },
    { "action": "click", "selector": "#submit" },
    { "action": "assert", "selector": "#dashboard" }
  ]
}
**Repo layout: what ships vs. what's dev-only**

**Ships** (the Stage 1 MVP surface — what a pilot customer would actually run):
- `flows.json` — the manifest
- `db/schema.sql` — the `fact_store` schema
- `collector/` — syncs facts to Postgres
- `producers/playwright/`, `producers/synthetics/` — the two producers (Synthetics is currently a local stub — see the header comment in `producers/synthetics/canary.js` — until there's a real AWS account to deploy to)
- `dashboard/backend/`, `dashboard/frontend/` — the API + UI
- `scripts/validate-flows.js` — the `flows.json` validator

**Dev-only** (exists to get to MVP, not part of the product):
- `fixtures/local-app/` — throwaway login page standing in for a real staging app. A pilot customer brings their own; delete this once one exists. Nothing else in the repo depends on it.
- Root-level planning docs (`STAGE_1_LINEAR_CONTEXT.md`, `ONE_PANE_CONTEXT.md`, etc.) — gitignored on purpose (`*.md` in `.gitignore`), never committed, not shipped.

**Local development setup**

Copy `.env.example` to `.env` and fill in your local Postgres connection string:

```
cp .env.example .env
```

`.env` is gitignored — never commit it. `DB_URL` is read by the collector and the dashboard API to connect to the `fact_store` Postgres database.

**Running the Playwright producer**

Set `PW_TEST_USER`, `PW_TEST_PASSWORD`, and `PW_TARGET_URL` (in `.env`, or exported in your shell), then:

```
node producers/playwright/test-harness.js
```

Against the local throwaway login fixture (`fixtures/local-app`), the defaults in `.env.example` already work — start it with `npm run fixture:serve` first. No credentials are hardcoded in the harness; it exits with an error naming the missing variable if any of the three aren't set.

**Dashboard hosting: standalone, not a Backstage plugin (for now)**

Stage 1's dashboard is a standalone Node/Express API (`dashboard/backend`, `GET /api/flow-status`) with a React frontend (`dashboard/frontend`) — not a Backstage plugin, even though the longer-term vision (see "What it does" above) is a Backstage-native scorecard.

**Why:** a Backstage plugin means scaffolding a plugin package, wiring it into a Backstage app shell, and learning its catalog/entity APIs before a single fact can be displayed — real setup cost with no Stage 1 payoff, since there's no existing Backstage instance to plug into yet. A standalone API + React app gets a working dashboard in hours, not days, and the API shape (`/api/flow-status`) doesn't change when it's time to migrate — a plugin just becomes a new frontend consuming the same endpoint.

**Stage 2:** once there's a real Backstage instance to embed in, wrap this API in a plugin card component. The fact store and API layer stay as-is.

**Running the dashboard (DASH-005)**

Two processes, two terminals:

```
npm run dashboard:api        # Express API — http://localhost:4000
npm run dashboard:frontend   # Vite dev server — http://localhost:5173
```

Open **http://localhost:5173** — that's the dashboard. It polls `/api/flow-status?flow_id=login-happy-path` every 5 minutes (Vite proxies `/api` to the backend, so both need to be running). The API port is configurable via `DASHBOARD_API_PORT` if 4000 is taken.

For Stage 1 this *is* the deployment — a real hosting target (Heroku/Vercel/etc.) isn't worth the setup cost yet per the no-pilot-customer, no-external-deadline constraint on this stage. Revisit once there's an actual audience for the dashboard beyond local dev.

**Running continuously (SYN-002) — to actually accumulate data**

Everything up to this point ran on-demand, one execution at a time. To let facts build up over time instead, run all of these long-lived, each in its own terminal (or a process manager — pm2, tmux, launchd, whatever you're comfortable with):

```
npm run collector          # syncs playwright-facts.json -> fact_store every 5 min
npm run pw:schedule        # runs the Playwright producer every 5 min
npm run syn:schedule       # runs the (stubbed) Synthetics canary every 5 min
npm run dashboard:api      # :4000
npm run dashboard:frontend # :5173
```

All three schedules default to every 5 minutes, matching the dashboard's own poll interval. Override with `COLL_SCHEDULE`, `PW_SCHEDULE`, `SYN_SCHEDULE` using standard cron syntax.

A fact-write failure never blocks a producer's own run — both producers and the collector log the error and keep going on the next cycle rather than crashing the long-lived process.

**Contributing**

Feedback and issues welcome. This is an early-stage project — the entity model in particular is still open to change based on real adopter feedback.

**License / Patent notice**

**Patent pending**. This project is released under [LICENSE — TBD]. The open tier described above is intended for broad use; the paid tier is a separate, closed offering. See LICENSE for full terms.
