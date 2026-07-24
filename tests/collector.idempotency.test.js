// INFRA-002: unit tests for the collector's idempotency logic.
// Uses a fake DB client (no real Postgres) so this is a true unit test —
// the full-stack behavior is already covered by manual verification on
// INT-001, TEST-001, and STAB-001.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { upsertFact } = require('../collector/idempotency');

function fakeClient(returnRows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: returnRows };
    },
  };
}

test('upsertFact returns true when the row was newly inserted (xmax = 0)', async () => {
  const client = fakeClient([{ inserted: true }]);
  const fact = {
    flow_id: 'login-happy-path',
    layer: 'playwright',
    status: 'pass',
    execution_id: 'pw-run-1',
    executed_at: '2026-01-01T00:00:00.000Z',
    duration_ms: 100,
  };

  const result = await upsertFact(client, fact);

  assert.equal(result, true);
  assert.equal(client.calls.length, 1);
});

test('upsertFact returns false when an existing row was updated', async () => {
  const client = fakeClient([{ inserted: false }]);
  const fact = {
    flow_id: 'login-happy-path',
    layer: 'playwright',
    status: 'fail',
    execution_id: 'pw-run-1',
    executed_at: '2026-01-01T00:00:01.000Z',
    duration_ms: 200,
    error_message: 'timeout',
  };

  const result = await upsertFact(client, fact);

  assert.equal(result, false);
});

test('upsertFact passes execution_id as the ON CONFLICT key parameter', async () => {
  const client = fakeClient([{ inserted: true }]);
  const fact = {
    flow_id: 'login-happy-path',
    layer: 'synthetics',
    region: 'eu-west-1',
    status: 'pass',
    execution_id: 'synthetics-canary-1',
    executed_at: '2026-01-01T00:00:00.000Z',
    duration_ms: 150,
  };

  await upsertFact(client, fact);

  const [sql, params] = [client.calls[0].sql, client.calls[0].params];
  assert.match(sql, /ON CONFLICT \(execution_id\)/);
  assert.equal(params[4], 'synthetics-canary-1'); // execution_id is the 5th bound param ($5)
  assert.equal(params[2], 'eu-west-1'); // region
});

test('upsertFact defaults missing optional fields (region, error_message, duration_ms) to null', async () => {
  const client = fakeClient([{ inserted: true }]);
  const fact = {
    flow_id: 'login-happy-path',
    layer: 'playwright',
    status: 'pass',
    execution_id: 'pw-run-2',
    executed_at: '2026-01-01T00:00:00.000Z',
    // region, error_message, duration_ms all omitted
  };

  await upsertFact(client, fact);

  const params = client.calls[0].params;
  assert.equal(params[2], null); // region
  assert.equal(params[6], null); // error_message
  assert.equal(params[7], null); // duration_ms
});
