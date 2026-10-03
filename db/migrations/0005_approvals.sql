-- Calls that wait for a human. An open request keeps the full arguments
-- (secrets removed) for the approver; once decided only the hash and the
-- masked arguments stay.
CREATE TABLE approval_requests (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    id text NOT NULL CHECK (id ~ '^apr_[0-9a-f]{16}$'),
    -- The call that asked first
    run_id text NOT NULL CHECK (run_id ~ '^[0-9a-f]{32}$'),
    step_id text NOT NULL CHECK (step_id ~ '^[0-9a-f]{16}$'),
    agent text NOT NULL,
    tool text NOT NULL,
    args_hash text NOT NULL CHECK (args_hash ~ '^[0-9a-f]{32}$'),
    args jsonb,
    masked jsonb NOT NULL,
    labels jsonb NOT NULL DEFAULT '[]',
    context jsonb NOT NULL DEFAULT '{}',
    reasons jsonb NOT NULL DEFAULT '[]',
    rules_hash text,
    opened_at timestamptz NOT NULL DEFAULT now(),
    answer text CHECK (answer IN ('once', 'always', 'deny')),
    decided_by text,
    decided_at timestamptz,
    -- The waiting call that ran an "approve once"
    used_by text,
    used_at timestamptz,
    PRIMARY KEY (project_id, id),
    CHECK ((answer IS NULL) = (decided_at IS NULL))
);

-- Identical calls wait on one open request
CREATE UNIQUE INDEX approval_requests_open ON approval_requests (project_id, agent, tool, args_hash)
    WHERE answer IS NULL;
CREATE INDEX approval_requests_opened ON approval_requests (project_id, opened_at DESC);
-- control checks the requests its waiting calls hold, by id, every second
CREATE INDEX approval_requests_id ON approval_requests (id);

-- Each call waiting on a request, with its heartbeat
CREATE TABLE approval_waiters (
    project_id uuid NOT NULL,
    ask_id text NOT NULL CHECK (ask_id ~ '^[0-9a-f]{16}$'),
    request_id text NOT NULL,
    run_id text NOT NULL,
    step_id text NOT NULL,
    agent text NOT NULL,
    since timestamptz NOT NULL DEFAULT now(),
    last_beat_at timestamptz NOT NULL DEFAULT now(),
    -- Set when the call got its answer or stopped waiting
    done_at timestamptz,
    PRIMARY KEY (project_id, ask_id),
    FOREIGN KEY (project_id, request_id) REFERENCES approval_requests (project_id, id) ON DELETE CASCADE
);

CREATE INDEX approval_waiters_request ON approval_waiters (project_id, request_id);

-- "Always approve": later calls from the same agent, with the same tool
-- and exact arguments, pass without asking until someone revokes it
CREATE TABLE approval_grants (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    id text NOT NULL CHECK (id ~ '^grt_[0-9a-f]{16}$'),
    request_id text NOT NULL,
    agent text NOT NULL,
    tool text NOT NULL,
    args_hash text NOT NULL,
    masked jsonb NOT NULL,
    approved_by text NOT NULL,
    approved_at timestamptz NOT NULL DEFAULT now(),
    times_used integer NOT NULL DEFAULT 0,
    last_used_at timestamptz,
    revoked_at timestamptz,
    revoked_by text,
    PRIMARY KEY (project_id, id)
);

CREATE UNIQUE INDEX approval_grants_active ON approval_grants (project_id, agent, tool, args_hash)
    WHERE revoked_at IS NULL;
