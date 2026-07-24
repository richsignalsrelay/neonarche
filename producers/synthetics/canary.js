#!/usr/bin/env node
// SYN-001: Synthetics canary — STUBBED, no real AWS CloudWatch Synthetics yet.
//
// A real Synthetics canary runs inside AWS's own runtime, on AWS's own
// schedule — there's no local process to invoke, and it needs an AWS
// account, IAM roles, and a deployed canary resource this project doesn't
// have. Until that exists, this script simulates the contract: it runs
// login-happy-path (via Playwright, standing in for Synthetics' own
// headless-Chromium runtime) and writes a "synthetics" layer fact straight
// to fact_store, tagged with a region — the same shape a real canary would
// produce. Porting this to an actual AWS canary later is mostly swapping
// the execution engine; the flows.json step-translation logic carries over
// almost unchanged (see producers/playwright/test-harness.js).
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { chromium } = require('playwright');
const { Client } = require('pg');
const { upsertFact } = require('../../collector/idempotency');
const { describeError } = require('../../lib/describe-error');

if (!process.env.DB_URL) {
  console.error('DB_URL is not set. Copy .env.example to .env and fill in DB_URL.');
  process.exit(1);
}

const TARGET_URL = process.env.PW_TARGET_URL || 'http://localhost:8080';
const REGION = process.env.SYN_REGION || 'eu-west-1'; // TODO(real AWS): comes from the canary's deployed region, not an env var

const FLOW_ID = 'login-happy-path';
const FLOWS_FILE = path.join(__dirname, '..', '..', 'flows.json');

function loadFlow(flowId) {
  const data = JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf8'));
  const flow = data.flows.find((f) => f.id === flowId);
  if (!flow) {
    throw new Error(`flow "${flowId}" not found in ${FLOWS_FILE}`);
  }
  return flow;
}

function resolveValue(value) {
  if (value === '${PW_TEST_USER}') return process.env.PW_TEST_USER || 'synthetic-value';
  if (value === '${PW_TEST_PASSWORD}') return process.env.PW_TEST_PASSWORD || 'synthetic-value';
  return value;
}

async function runStep(page, step) {
  switch (step.action) {
    case 'navigate':
      await page.goto(new URL(step.url, TARGET_URL).toString());
      return;
    case 'input':
      await page.fill(step.selector, resolveValue(step.value));
      return;
    case 'click':
      await page.click(step.selector);
      return;
    case 'assert':
      await page.waitForSelector(step.selector, { timeout: 5000 });
      return;
    default:
      throw new Error(`unknown action "${step.action}"`);
  }
}

async function runCanary(flow) {
  const executionId = `synthetics-canary-${Date.now()}`;
  const startedAt = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    for (const step of flow.steps) {
      await runStep(page, step);
    }
    return {
      flow_id: FLOW_ID,
      layer: 'synthetics',
      region: REGION,
      status: 'pass',
      execution_id: executionId,
      executed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      error_message: null,
    };
  } catch (err) {
    return {
      flow_id: FLOW_ID,
      layer: 'synthetics',
      region: REGION,
      status: 'fail',
      execution_id: executionId,
      executed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      error_message: err.message,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const flow = loadFlow(FLOW_ID);
  const fact = await runCanary(flow);

  // Canary completion must not be blocked by a fact-write failure — log and move on.
  try {
    const client = new Client({ connectionString: process.env.DB_URL });
    try {
      await client.connect();
      await upsertFact(client, fact);
      console.log(
        `${fact.status.toUpperCase()}: ${FLOW_ID} [${REGION}] (${fact.duration_ms}ms) — fact written directly to fact_store`
      );
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error(`canary completed but fact write failed: ${describeError(err)}`);
  }

  if (fact.status === 'fail') process.exitCode = 1;
}

if (process.argv.includes('--schedule')) {
  const schedule = process.env.SYN_SCHEDULE || '*/5 * * * *';
  console.log(`Synthetics canary scheduled: ${schedule}`);
  main();
  cron.schedule(schedule, main);
} else {
  main();
}
