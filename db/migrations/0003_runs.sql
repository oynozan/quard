-- One row per run, with the counts the runs list shows
CREATE TABLE runs (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    run_id text NOT NULL CHECK (run_id ~ '^[0-9a-f]{32}$'),
    agent text NOT NULL,
    origins jsonb NOT NULL DEFAULT '{}',
    started_at timestamptz NOT NULL,
    last_event_at timestamptz NOT NULL,
    -- Set when quard.run() reports how its function finished
    ended_at timestamptz,
    outcome text CHECK (outcome IN ('completed', 'failed', 'blocked')),
    error text,
    model_calls integer NOT NULL DEFAULT 0,
    tool_calls integer NOT NULL DEFAULT 0,
    blocked integer NOT NULL DEFAULT 0,
    -- Summed from model calls; false when a model's price is unknown
    cost_usd double precision NOT NULL DEFAULT 0,
    cost_known boolean NOT NULL DEFAULT true,
    influenced boolean NOT NULL DEFAULT false,
    flagged boolean NOT NULL DEFAULT false,
    degraded boolean NOT NULL DEFAULT false,
    PRIMARY KEY (project_id, run_id)
);

CREATE INDEX runs_started_at ON runs (project_id, started_at DESC);

-- Model calls and tool calls
CREATE TABLE steps (
    project_id uuid NOT NULL,
    run_id text NOT NULL,
    step_id text NOT NULL CHECK (step_id ~ '^[0-9a-f]{16}$'),
    kind text NOT NULL CHECK (kind IN ('model_call', 'tool_call')),
    agent text NOT NULL,
    parent_step_id text,
    name text NOT NULL,
    call_id text,
    status text NOT NULL,
    influenced boolean NOT NULL DEFAULT false,
    flagged boolean NOT NULL DEFAULT false,
    at timestamptz NOT NULL,
    duration_ms integer NOT NULL DEFAULT 0,
    detail jsonb NOT NULL DEFAULT '{}',
    PRIMARY KEY (project_id, run_id, step_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);
