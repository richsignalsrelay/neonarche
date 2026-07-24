#!/usr/bin/env node
// COLL-001: collector process — reads playwright-facts.json, syncs to fact_store
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { Client } = require('pg');
const { upsertFact } = require('./idempotency');

// Fact file is newline-delimited JSON (one fact object per line) — PW-001 appends a
// line per test run. That avoids read-modify-write races on a single JSON array.
const FACTS_FILE = path.join(__dirname, '..', 'artifacts', 'playwright-facts.json');
const CRON_SCHEDULE = process.env.COLL_SCHEDULE || '*/5 * * * *';
const REQUIRED_FIELDS = ['flow_id', 'layer', 'status', 'execution_id', 'executed_at'];

function readFacts(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { facts: [], errors: [] }; // nothing produced yet — not an error
    }
    return { facts: [], errors: [`could not read ${filePath}: ${err.message}`] };
  }

  const facts = [];
  const errors = [];

  raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line, i) => {
      let fact;
      try {
        fact = JSON.parse(line);
      } catch (err) {
        errors.push(`line ${i + 1}: malformed JSON (${err.message}), skipping`);
        return;
      }

      const missing = REQUIRED_FIELDS.filter((field) => !fact[field]);
      if (missing.length > 0) {
        errors.push(`line ${i + 1}: missing required field(s) ${missing.join(', ')}, skipping`);
        return;
      }

      facts.push(fact);
    });

  return { facts, errors };
}

async function syncOnce() {
  const startedAt = new Date().toISOString();
  const { facts, errors: readErrors } = readFacts(FACTS_FILE);

  console.log(`[${startedAt}] collector run: ${facts.length} fact(s) read from ${FACTS_FILE}`);
  readErrors.forEach((e) => console.error(`[${startedAt}]   read error: ${e}`));

  if (facts.length === 0) {
    return;
  }

  const client = new Client({ connectionString: process.env.DB_URL });

  try {
    await client.connect();
  } catch (err) {
    console.error(`[${startedAt}] DB connection failed, will retry next cycle: ${err.message}`);
    return;
  }

  let inserted = 0;
  let updated = 0;
  const writeErrors = [];

  try {
    for (const fact of facts) {
      try {
        const wasInserted = await upsertFact(client, fact);
        if (wasInserted) inserted += 1;
        else updated += 1;
      } catch (err) {
        writeErrors.push(`execution_id=${fact.execution_id}: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log(`[${startedAt}] sync complete: ${inserted} inserted, ${updated} upserted (already existed)`);
  writeErrors.forEach((e) => console.error(`[${startedAt}]   write error: ${e}`));
}

function main() {
  if (!process.env.DB_URL) {
    console.error('DB_URL is not set. Copy .env.example to .env and set DB_URL.');
    process.exit(1);
  }

  if (process.argv.includes('--once')) {
    syncOnce().then(() => process.exit(0));
    return;
  }

  console.log(`Collector starting. Syncing every 5 minutes from ${FACTS_FILE}.`);
  syncOnce();
  cron.schedule(CRON_SCHEDULE, syncOnce);
}

main();
