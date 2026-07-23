#!/usr/bin/env node
// FLOW-001: flows.json validator
'use strict';

const fs = require('fs');
const path = require('path');

const VALID_ACTIONS = ['navigate', 'input', 'click', 'assert'];
const VALID_CRITICALITY = ['high', 'medium', 'low'];

function validateStep(step, flowId, index) {
  const where = `flows["${flowId}"].steps[${index}]`;

  if (typeof step !== 'object' || step === null || Array.isArray(step)) {
    return [`${where}: must be an object`];
  }

  if (!VALID_ACTIONS.includes(step.action)) {
    return [`${where}: "action" must be one of ${VALID_ACTIONS.join(', ')}, got ${JSON.stringify(step.action)}`];
  }

  const errors = [];
  if (step.action === 'navigate') {
    if (typeof step.url !== 'string' || step.url.length === 0) {
      errors.push(`${where}: "navigate" steps require a non-empty "url" string`);
    }
  } else {
    if (typeof step.selector !== 'string' || step.selector.length === 0) {
      errors.push(`${where}: "${step.action}" steps require a non-empty "selector" string`);
    }
  }

  return errors;
}

function validateFlow(flow, index) {
  if (typeof flow !== 'object' || flow === null || Array.isArray(flow)) {
    return [`flows[${index}]: must be an object`];
  }

  const flowId = typeof flow.id === 'string' && flow.id.length > 0 ? flow.id : `#${index}`;
  const where = `flows["${flowId}"]`;
  const errors = [];

  if (typeof flow.id !== 'string' || flow.id.length === 0) {
    errors.push(`${where}: "id" must be a non-empty string`);
  }
  if (!VALID_CRITICALITY.includes(flow.criticality)) {
    errors.push(`${where}: "criticality" must be one of ${VALID_CRITICALITY.join(', ')}, got ${JSON.stringify(flow.criticality)}`);
  }
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
    errors.push(`${where}: "steps" must be a non-empty array`);
  } else {
    flow.steps.forEach((step, i) => errors.push(...validateStep(step, flowId, i)));
  }

  return errors;
}

function validateFlowsFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return [`Could not read ${filePath}: ${err.message}`];
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return [`${filePath} is not valid JSON: ${err.message}`];
  }

  if (!Array.isArray(data.flows) || data.flows.length === 0) {
    return [`${filePath}: top-level "flows" must be a non-empty array`];
  }

  const errors = [];
  const seenIds = new Set();
  data.flows.forEach((flow, i) => {
    if (flow && typeof flow.id === 'string') {
      if (seenIds.has(flow.id)) {
        errors.push(`flows[${i}]: duplicate flow id "${flow.id}"`);
      }
      seenIds.add(flow.id);
    }
    errors.push(...validateFlow(flow, i));
  });

  return errors;
}

function main() {
  const filePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'flows.json'));
  const errors = validateFlowsFile(filePath);

  if (errors.length === 0) {
    console.log(`Valid: ${filePath}`);
    process.exit(0);
  }

  console.error(`Invalid: ${filePath}`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

main();
