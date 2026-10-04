-- What a sender stores before a message to another agent leaves, so the
-- receiving process can look its labels up through control. Values go by
-- their keyed hash only.
CREATE TABLE message_records (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    ref text NOT NULL CHECK (ref ~ '^[0-9a-f]{16}$'),
    run_id text NOT NULL CHECK (run_id ~ '^[0-9a-f]{32}$'),
    step_id text CHECK (step_id ~ '^[0-9a-f]{16}$'),
    sender text NOT NULL,
    depth integer NOT NULL CHECK (depth >= 0),
    print text NOT NULL CHECK (print ~ '^[0-9a-f]{64}$'),
    label jsonb NOT NULL,
    value_labels jsonb NOT NULL DEFAULT '[]',
    tools text[],
    stored_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, ref)
);

CREATE INDEX message_records_run ON message_records (project_id, run_id);

-- Labels of memory items, keyed by a hash of the content. One row per
-- item: each write merges in its labels, keeping the least trusted and
-- most sensitive, so writing again never makes an item more trusted.
-- They outlive runs, so a later run reads them back.
CREATE TABLE memory_labels (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    print text NOT NULL CHECK (print ~ '^[0-9a-f]{64}$'),
    -- The first writer's store, run and agent
    store text NOT NULL,
    run_id text NOT NULL CHECK (run_id ~ '^[0-9a-f]{32}$'),
    agent text NOT NULL,
    label jsonb NOT NULL,
    value_labels jsonb NOT NULL DEFAULT '[]',
    first_written_at timestamptz NOT NULL DEFAULT now(),
    last_written_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, print)
);

-- Counters of runs that span processes: steps, cost, and per-run tool
-- calls and amounts
CREATE TABLE run_counters (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    run_id text NOT NULL CHECK (run_id ~ '^[0-9a-f]{32}$'),
    counter text NOT NULL,
    used double precision NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, run_id, counter)
);

-- Messages and handoffs between agents, from message and handoff events,
-- for the agent graph
CREATE TABLE agent_messages (
    project_id uuid NOT NULL,
    event_id text NOT NULL,
    run_id text NOT NULL,
    step_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('message', 'handoff', 'tool')),
    from_agent text NOT NULL,
    to_agent text NOT NULL,
    -- For messages: the sender's step, from the carrier
    parent_step_id text,
    trust text NOT NULL CHECK (trust IN ('trusted', 'untrusted')),
    sensitivity text NOT NULL CHECK (sensitivity IN ('internal', 'public')),
    -- False for a message no record vouched for
    verified boolean NOT NULL DEFAULT true,
    at timestamptz NOT NULL,
    PRIMARY KEY (project_id, event_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);

CREATE INDEX agent_messages_at ON agent_messages (project_id, at DESC);
