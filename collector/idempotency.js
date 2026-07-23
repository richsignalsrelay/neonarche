// COLL-001: upsert a fact keyed on execution_id
'use strict';

const UPSERT_SQL = `
  INSERT INTO fact_store (
    flow_id, layer, region, status, execution_id, executed_at, error_message, duration_ms
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (execution_id) DO UPDATE SET
    flow_id = EXCLUDED.flow_id,
    layer = EXCLUDED.layer,
    region = EXCLUDED.region,
    status = EXCLUDED.status,
    executed_at = EXCLUDED.executed_at,
    error_message = EXCLUDED.error_message,
    duration_ms = EXCLUDED.duration_ms
  RETURNING (xmax = 0) AS inserted
`;

// Returns true if this call inserted a new row, false if it updated an existing one.
async function upsertFact(client, fact) {
  const result = await client.query(UPSERT_SQL, [
    fact.flow_id,
    fact.layer,
    fact.region || null,
    fact.status,
    fact.execution_id,
    fact.executed_at,
    fact.error_message || null,
    fact.duration_ms || null,
  ]);
  return result.rows[0].inserted;
}

module.exports = { upsertFact };
