-- DB-001: fact_store schema
-- One Pane, Three Stories — Stage 1 MVP

CREATE TABLE fact_store (
  id SERIAL PRIMARY KEY,
  flow_id VARCHAR(255) NOT NULL,
  layer VARCHAR(50) NOT NULL,            -- "playwright" or "synthetics"
  region VARCHAR(100),                   -- NULL for playwright, e.g. "eu-west-1" for synthetics
  status VARCHAR(20) NOT NULL,           -- "pass" or "fail"
  execution_id VARCHAR(255),             -- unique run ID for traceability
  executed_at TIMESTAMP NOT NULL,        -- when the flow was executed
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(), -- when the fact was ingested
  error_message TEXT,                    -- populated when status = 'fail'
  duration_ms INT
);

CREATE INDEX idx_fact_store_flow_layer_executed
  ON fact_store (flow_id, layer, executed_at);

-- execution_id is the idempotency key the COLL-001 collector upserts on.
CREATE UNIQUE INDEX idx_fact_store_execution_id
  ON fact_store (execution_id)
  WHERE execution_id IS NOT NULL;
