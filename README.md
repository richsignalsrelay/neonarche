Flow Scorecard

A Backstage plugin that tracks the health of critical user journeys — login, checkout, account creation — across every stage of validation, from pre-merge testing through production monitoring.

Instead of checking four separate tools to answer "is login actually working," Flow Scorecard gives you one scorecard, per user flow, right in the Backstage catalog you already use.

What it does

Flow Scorecard registers each critical user journey as a first-class Backstage entity (kind: Flow), then attaches a scorecard showing whether that flow is passing at every layer:

Pre-merge — validated in ephemeral preview environments
Pipeline — CI test results (Playwright)
Production — canary health, by region (AWS CloudWatch Synthetics)
Coverage — test execution history and flakiness (Jira Xray)

All four layers reference the same underlying flow definition, so a failure at any layer can be traced back to the exact same workflow — no more manually cross-referencing four dashboards during an incident.

Status

Early beta. The entity model and fact producers are functional; UI shown in early demos is a static mock of the intended scorecard shape, not yet wired to a live fact store or the Soundcheck check/scorecard API.

Expect the schema (spec.owner, spec.dependsOn, spec.layers) to shift before a second team adopts this — nothing here is stable yet.

What's open, what's not

This project is built open-core, on purpose:

Tier	Includes
Open (this repo)	Flow entity model, scorecard view, fact producers for CI and canary results
Paid (separate)	Automated failure correlation (tracing a broken flow to the responsible commit, PR, or feature flag) and risk-scored release recommendations (promote / pause / rollback / disable flag)

If you adopt the open tier, you get real, standalone value — a better scorecard, on an entity model that will outlast any future paid features. Stopping here is a legitimate outcome, not a lesser one.

Getting started
# install (placeholder — package not yet published)
yarn add @your-org/plugin-flow-scorecard

Point the plugin at your flows.json manifest and your CI/canary integrations. Flow entities and their checks populate from there.

Manifest format

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
Contributing

Feedback and issues welcome. This is an early-stage project — the entity model in particular is still open to change based on real adopter feedback.

License / Patent notice

Patent pending. This project is released under [LICENSE — TBD]. The open tier described above is intended for broad use; the paid tier is a separate, closed offering. See LICENSE for full terms.