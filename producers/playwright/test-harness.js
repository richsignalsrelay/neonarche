#!/usr/bin/env node
// PW-001: Playwright test harness — runs login-happy-path, emits a fact
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { chromium } = require('playwright');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Copy .env.example to .env and fill in ${name}.`);
    process.exit(1);
  }
  return value;
}

const TARGET_URL = requireEnv('PW_TARGET_URL');
const TEST_USER = requireEnv('PW_TEST_USER');
const TEST_PASSWORD = requireEnv('PW_TEST_PASSWORD');

const FLOW_ID = 'login-happy-path'; // hardcoded per PW-001 scope
const FLOWS_FILE = path.join(__dirname, '..', '..', 'flows.json');
const FACTS_FILE = path.join(__dirname, '..', '..', 'artifacts', 'playwright-facts.json');

function loadFlow(flowId) {
  const data = JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf8'));
  const flow = data.flows.find((f) => f.id === flowId);
  if (!flow) {
    throw new Error(`flow "${flowId}" not found in ${FLOWS_FILE}`);
  }
  return flow;
}

function resolveValue(value) {
  // flows.json stores credential placeholders as ${PW_TEST_USER} / ${PW_TEST_PASSWORD}
  if (value === '${PW_TEST_USER}') return TEST_USER;
  if (value === '${PW_TEST_PASSWORD}') return TEST_PASSWORD;
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

function appendFact(fact) {
  fs.mkdirSync(path.dirname(FACTS_FILE), { recursive: true });
  fs.appendFileSync(FACTS_FILE, `${JSON.stringify(fact)}\n`);
}

async function main() {
  const flow = loadFlow(FLOW_ID);
  const executionId = `pw-run-${Date.now()}`;
  const startedAt = Date.now();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    for (const step of flow.steps) {
      await runStep(page, step);
    }

    const fact = {
      flow_id: FLOW_ID,
      layer: 'playwright',
      status: 'pass',
      execution_id: executionId,
      executed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      error_message: null,
    };
    appendFact(fact);
    console.log(`PASS: ${FLOW_ID} (${fact.duration_ms}ms) — fact appended to ${FACTS_FILE}`);
  } catch (err) {
    const fact = {
      flow_id: FLOW_ID,
      layer: 'playwright',
      status: 'fail',
      execution_id: executionId,
      executed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      error_message: err.message,
    };
    appendFact(fact);
    console.error(`FAIL: ${FLOW_ID} (${fact.duration_ms}ms) — ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

if (process.argv.includes('--schedule')) {
  const schedule = process.env.PW_SCHEDULE || '*/5 * * * *';
  console.log(`Playwright producer scheduled: ${schedule}`);
  main();
  cron.schedule(schedule, main);
} else {
  main();
}
