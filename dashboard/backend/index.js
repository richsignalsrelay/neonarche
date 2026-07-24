#!/usr/bin/env node
// DASH-003: dashboard API — GET /api/flow-status?flow_id=login-happy-path
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const { describeError } = require('../../lib/describe-error');

if (!process.env.DB_URL) {
  console.error('DB_URL is not set. Copy .env.example to .env and fill in DB_URL.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DB_URL });
const PORT = process.env.DASHBOARD_API_PORT || 4000;

// Known flows come from the manifest, not fact_store — a flow with zero facts yet
// (freshly added, producers haven't run) is a normal state, not a 404. Only a
// flow_id absent from the manifest entirely is "not found" (STAB-001).
const FLOWS_FILE = path.join(__dirname, '..', '..', 'flows.json');
const KNOWN_FLOW_IDS = new Set(JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf8')).flows.map((f) => f.id));

const QUERY = `
  SELECT layer, region, status, execution_id, executed_at, duration_ms, error_message
  FROM fact_store
  WHERE flow_id = $1
  ORDER BY executed_at DESC
  LIMIT 20
`;

// Groups the (already most-recent-first) rows by layer. The first row seen
// per layer is the most recent, so it doubles as that layer's "last_*" fields.
function buildResponse(flowId, rows) {
  const layers = new Map();

  for (const row of rows) {
    if (!layers.has(row.layer)) {
      layers.set(row.layer, {
        layer: row.layer,
        ...(row.region ? { region: row.region } : {}),
        last_status: row.status,
        last_executed_at: row.executed_at,
        last_execution_id: row.execution_id,
        recent_results: [],
      });
    }
    layers.get(row.layer).recent_results.push({
      status: row.status,
      executed_at: row.executed_at,
    });
  }

  return { flow_id: flowId, layers: Array.from(layers.values()) };
}

const app = express();

app.get('/api/flow-status', async (req, res) => {
  const flowId = req.query.flow_id;
  if (!flowId) {
    res.status(400).json({ error: 'flow_id query parameter is required' });
    return;
  }

  let result;
  try {
    result = await pool.query(QUERY, [flowId]);
  } catch (err) {
    console.error(`DB query failed: ${describeError(err)}`);
    res.status(500).json({ error: 'internal error querying fact_store' });
    return;
  }

  if (result.rows.length === 0) {
    if (!KNOWN_FLOW_IDS.has(flowId)) {
      res.status(404).json({ error: `no facts found for flow_id "${flowId}"` });
      return;
    }
    // Known flow, no facts yet (e.g. freshly added, producers haven't run) — not an error.
    res.json({ flow_id: flowId, layers: [] });
    return;
  }

  res.json(buildResponse(flowId, result.rows));
});

app.listen(PORT, () => {
  console.log(`Dashboard API listening on http://localhost:${PORT}`);
});
