**Encore — Stage 1 MVP**

Stage 1 answers one question for one flow: *is `login-happy-path` actually working?* A Playwright producer and a (currently stubbed) Synthetics canary both exercise the flow, write facts to a shared Postgres `fact_store`, and a small dashboard shows the current status for both, updated every 5 minutes.

This started deliberately narrow, and has grown one real step further since: `login-happy-path` is now registered as a `kind: Flow` entity in a local Backstage instance (`encore/`), with a live status card on its entity page. Soundcheck integration and multi-flow support still don't exist — see **Vision (Stage 2+)** below for what's still ahead. It proves the fact-flow contract (manifest → producer → store → Backstage) end to end on the smallest possible surface.

---

**Architecture**

```
flows.json (single flow: login-happy-path)
       │
       ├─ Playwright producer ──→ artifacts/playwright-facts.json ──→ Collector ──┐
       │  (producers/playwright)      (NDJSON, one line per run)     (collector/)  │
       │                                                                          ▼
       └─ Synthetics canary ─────────────────────────────────→ direct write ─→ Postgres
          (producers/synthetics,                                              fact_store
           STUBBED — no real AWS yet)                                              │
                                                                                    ▼
                                                                     Dashboard API (Express)
                                                                       GET /api/flow-status
                                                                                    │
                                                                                    ▼
                                                                  Dashboard frontend (React)
                                                                    polls every 5 minutes
```

Playwright and Synthetics take different paths to the same table on purpose — Playwright writes to a local file that a separate collector process syncs (so a CI runner never needs direct DB access), while Synthetics writes directly (there's no separate machine to bridge from, once it's real). Both converge on `fact_store`, keyed for idempotency by `execution_id`.

---

**Repo layout: what ships vs. what's dev-only**

**Ships** (the Stage 1 MVP surface — what a pilot customer would actually run):
- `flows.json` — the manifest
- `db/schema.sql` — the `fact_store` schema
- `collector/` — syncs facts to Postgres
- `producers/playwright/`, `producers/synthetics/` — the two producers (Synthetics is currently a local stub — see the header comment in `producers/synthetics/canary.js` — until there's a real AWS account to deploy to)
- `dashboard/backend/`, `dashboard/frontend/` — the API + UI
- `scripts/validate-flows.js` — the `flows.json` validator
- `lib/describe-error.js` — shared error-message helper (pg's connection errors surface as `AggregateError`, whose `.message` is empty by design)

**Dev-only** (exists to get to MVP, not part of the product):
- `fixtures/local-app/` — throwaway login page standing in for a real staging app. A pilot customer brings their own; delete this once one exists. Nothing else in the repo depends on it.
- Root-level planning docs (`STAGE_1_LINEAR_CONTEXT.md`, `ONE_PANE_CONTEXT.md`, etc.) — gitignored on purpose (`*.md` in `.gitignore`), never committed, not shipped.

---

**Setup**

Prerequisites: Node 20+, a local Postgres.

```
npm install
npx playwright install chromium   # one-time, downloads the browser binary
cp .env.example .env              # fill in DB_URL if your Postgres isn't at the default
psql postgresql://localhost:5432/one_pane -f db/schema.sql
```

The frontend is a separate package (its own toolchain — Vite/React, not plain Node):
```
npm --prefix dashboard/frontend install
```

---

**Running things**

One-off, for trying a single piece:
```
npm run validate-flows   # checks flows.json against the manifest schema
npm run fixture:serve    # the throwaway login page, :8080
npm run test:pw          # runs the Playwright producer once
npm run collector:once   # syncs artifacts/playwright-facts.json -> fact_store, once
npm run syn:canary       # runs the (stubbed) Synthetics canary once, direct write
```

**The dashboard** — two processes:
```
npm run dashboard:api        # Express API — http://localhost:4000
npm run dashboard:frontend   # Vite dev server — http://localhost:5173
```
Open **http://localhost:5173**. It polls `/api/flow-status?flow_id=login-happy-path` every 5 minutes (Vite proxies `/api` to the backend, so both need to be running; override the API port with `DASHBOARD_API_PORT` if 4000 is taken).

This is still useful on its own for local iteration without the full Backstage stack running, but it's no longer the primary way this flow's status gets viewed — see below.

**Dashboard hosting: standalone first, then a real Backstage plugin.** This standalone dashboard shipped first because scaffolding a plugin package and learning Backstage's catalog/entity APIs was real setup cost with no immediate payoff — at the time, this repo had no Backstage instance to plug into (that assumption turned out to be wrong; see the correction in `encore/`'s commit history). A real plugin (`encore/plugins/flow-status`) now exists and is the primary way to see this flow's status — it consumes this same API unchanged, exactly as planned. This standalone dashboard still works and is useful for local iteration without the full Backstage stack running.

**Running continuously — to actually accumulate data.** Everything above runs on-demand, one execution at a time. To let facts build up over time instead, run all of these long-lived (each in its own terminal, or a process manager — pm2, tmux, launchd, whatever you're comfortable with):
```
npm run collector          # syncs playwright-facts.json -> fact_store every 5 min
npm run pw:schedule        # runs the Playwright producer every 5 min
npm run syn:schedule       # runs the (stubbed) Synthetics canary every 5 min
npm run dashboard:api
npm run dashboard:frontend
```
All three schedules default to every 5 minutes, matching the dashboard's own poll interval. Override with `COLL_SCHEDULE`, `PW_SCHEDULE`, `SYN_SCHEDULE` (standard cron syntax). A fact-write failure never blocks a producer's own run — both producers and the collector log the error and keep going on the next cycle rather than crashing the long-lived process.

---

**Emit paths**

Both producers emit the same fact shape but take different paths to `fact_store`:

- **Playwright** — appends one NDJSON line per run to `artifacts/playwright-facts.json` (not committed — gitignored, regenerated locally). The collector reads that file on its own schedule and upserts each line.
- **Synthetics** — writes to `fact_store` directly (currently: because it's a local stub with no separate machine to bridge from; for real AWS, this is one of the two options the ticket named — the other being a Lambda subscribed to canary completion events).

Fact shape (both producers):
```json
{
  "flow_id": "login-happy-path",
  "layer": "playwright",
  "region": null,
  "status": "pass",
  "execution_id": "pw-run-1784916290149",
  "executed_at": "2026-07-24T18:04:34.816Z",
  "duration_ms": 145,
  "error_message": null
}
```
`region` is only populated for `synthetics` facts (e.g. `"eu-west-1"`).

---

**Fact store schema and query examples**

`fact_store` (see `db/schema.sql` for the full definition with indexes):

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` | primary key |
| `flow_id` | `VARCHAR` | e.g. `"login-happy-path"` |
| `layer` | `VARCHAR` | `"playwright"` or `"synthetics"` |
| `region` | `VARCHAR`, nullable | only set for `synthetics` |
| `status` | `VARCHAR` | `"pass"` or `"fail"` |
| `execution_id` | `VARCHAR`, unique | idempotency key — `ON CONFLICT` target |
| `executed_at` | `TIMESTAMPTZ` | when the flow actually ran |
| `recorded_at` | `TIMESTAMPTZ` | when the fact was written, defaults to `NOW()` |
| `error_message` | `TEXT`, nullable | set when `status = 'fail'` |
| `duration_ms` | `INT` | flow execution time |

Both timestamp columns are `TIMESTAMPTZ`, not `TIMESTAMP` — they store an actual point in time regardless of which timezone fed them, which matters more than it sounds (see Troubleshooting).

Useful queries:
```sql
-- Most recent facts for a flow
SELECT * FROM fact_store
WHERE flow_id = 'login-happy-path'
ORDER BY executed_at DESC
LIMIT 20;

-- Latest status per layer (what the dashboard API effectively computes)
SELECT DISTINCT ON (layer) layer, region, status, executed_at, execution_id
FROM fact_store
WHERE flow_id = 'login-happy-path'
ORDER BY layer, executed_at DESC;

-- Failure rate per layer
SELECT layer, COUNT(*) FILTER (WHERE status = 'fail') AS failures, COUNT(*) AS total
FROM fact_store
GROUP BY layer;
```

**Dashboard API contract** — `GET /api/flow-status?flow_id=<id>`:
- `200` — known flow, grouped-by-layer status (empty `layers: []` if the flow exists in `flows.json` but has no facts yet)
- `400` — missing `flow_id` query param
- `404` — `flow_id` isn't in `flows.json` at all
- `500` — DB error

Example `200` response:
```json
{
  "flow_id": "login-happy-path",
  "layers": [
    {
      "layer": "synthetics",
      "region": "eu-west-1",
      "last_status": "pass",
      "last_executed_at": "2026-07-24T19:13:50.335Z",
      "last_execution_id": "synthetics-canary-1784920430188",
      "recent_results": [{ "status": "pass", "executed_at": "2026-07-24T19:13:50.335Z" }]
    },
    {
      "layer": "playwright",
      "last_status": "pass",
      "last_executed_at": "2026-07-24T19:13:45.683Z",
      "last_execution_id": "pw-run-1784920425537",
      "recent_results": [{ "status": "pass", "executed_at": "2026-07-24T19:13:45.683Z" }]
    }
  ]
}
```

---

**CI and pre-commit checks**

Three checks, run together via `npm run ci`: `flows.json` validation, ESLint (root Node code only — `dashboard/frontend` is a separate package with its own toolchain), and the unit test suite (`node --test`, no new test framework, no real Postgres needed — the idempotency tests mock the DB client).

- **CI:** `.github/workflows/ci.yml` runs `npm run ci` on every push/PR to `main`.
- **Pre-commit hook:** tracked in `.githooks/pre-commit` (git hooks in `.git/hooks` aren't committable, so this uses `core.hooksPath` instead). Activate once per clone:
  ```
  git config core.hooksPath .githooks
  ```
  After that, a commit is blocked if `flows.json` is invalid, lint fails, or a test fails.

---

**Troubleshooting**

- **`DB_URL is not set`** — `cp .env.example .env` and fill it in; every process that touches Postgres checks this explicitly at startup rather than failing with a cryptic driver error.
- **`EADDRINUSE`** on 8080 (fixture), 4000 (dashboard API), or 5173 (frontend) — something's already listening. Check `lsof -i :<port>`; if it's a stale process from an earlier session, kill it before restarting.
- **`flow "login-happy-path" not found in .../flows.json`** — either you're running a script from the wrong working directory, or `flows.json` itself is missing/corrupted. Run `npm run validate-flows` to check it directly.
- **Postgres connection refused** — confirm Postgres is actually running (`pg_isready`), and that `DB_URL` in `.env` points at the right host/port/db name.
- **Timestamps look off by exactly your local UTC offset** — this bit us during end-to-end testing: `fact_store.executed_at`/`recorded_at` must stay `TIMESTAMPTZ`. If a future migration ever changes them back to plain `TIMESTAMP`, timestamps fed from app code (UTC ISO strings) and `NOW()` (session-local) will silently diverge by the session's timezone offset.
- **Pre-commit hook doesn't seem to run** — `core.hooksPath` is a per-clone git config, not something that travels with the repo automatically: `git config core.hooksPath .githooks`.
- **A DB error logs a blank message** — shouldn't happen anymore (`lib/describe-error.js` handles it), but if you see it in new code: `pg`'s connection-refused errors are `AggregateError`, whose `.message` is empty by design — use `.code` or `.errors` instead of `.message` directly.

---

**Vision (Stage 2+)**

The longer-term goal is a Backstage plugin — **Flow Scorecard** — that tracks every critical user journey (login, checkout, account creation) as a first-class Backstage entity (`kind: Flow`), with a scorecard showing pass/fail across four layers: pre-merge (ephemeral environments), pipeline (this repo's Playwright), production (this repo's Synthetics, by region), and coverage (Jira Xray history). All four reference the same flow definition, so a failure at any layer traces back to one workflow — no cross-referencing four dashboards during an incident.

Built open-core: the entity model, scorecard view, and fact producers (this repo) are open. Automated failure correlation (tracing a break to the responsible commit/PR/flag) and risk-scored release recommendations (promote/pause/rollback/disable-flag) are a separate paid tier. The open tier is real, standalone value on its own — adopting only that is a legitimate outcome, not a lesser one.

**What Stage 2 actually adds, concretely:** multi-flow support (today: just `login-happy-path`), a Flow entity processor that materializes `flows.json` into the Backstage catalog, Soundcheck integration (facts as checks on those entities), a Change Lens stub (correlating failures to Git commits/PRs), coverage-confidence scoring from Xray, and — separately from all of that — replacing the Synthetics stub in this repo with a real deployed AWS CloudWatch Synthetics canary.

---

**Contributing**

Feedback and issues welcome. This is an early-stage project — the entity model in particular is still open to change based on real adopter feedback.

**License / Patent notice**

**Patent pending**. This project is released under [LICENSE — TBD]. The open tier described above is intended for broad use; the paid tier is a separate, closed offering. See LICENSE for full terms.
