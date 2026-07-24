#!/usr/bin/env node
// PW-001: Playwright test harness — runs login-happy-path, emits a fact
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// TODO(PW-002): move these to env vars (PW_TARGET_URL, PW_TEST_USER, PW_TEST_PASSWORD)
const TARGET_URL = 'http://localhost:8080';
const TEST_USER = 'test@example.com';
const TEST_PASSWORD = 'test-password';

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

main();
