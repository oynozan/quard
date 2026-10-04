-- One incident per run where a guard blocked a tool call, or would have
-- in observe mode. The row also holds the worker's job state.
CREATE TABLE incidents (
    project_id uuid NOT NULL,
    id text NOT NULL CHECK (id ~ '^inc_[0-9a-f]{16}$'),
    run_id text NOT NULL,
    opened_at timestamptz NOT NULL,
    -- Copied from the verdict, null until it is found
    category text CHECK (
        category IN ('bad input', 'bad reasoning', 'bad handoff', 'broken tool', 'missing guard')
    ),
    damage_step_id text,
    damage_tool text,
    damage_agent text,
    entry_agent text,
    entry_origin text,
    entry_trust text CHECK (entry_trust IN ('trusted', 'untrusted')),
    turning_agent text,
    verdict jsonb,
    reviewer jsonb,
    replay jsonb,
    find_state text NOT NULL DEFAULT 'pending' CHECK (find_state IN ('pending', 'done', 'failed')),
    find_error text,
    review_state text NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'done', 'skipped', 'failed')),
    replay_state text NOT NULL DEFAULT 'idle' CHECK (
        replay_state IN ('idle', 'requested', 'running', 'done', 'failed')
    ),
    -- Job queue: the worker leases a row while it works on it
    attempts integer NOT NULL DEFAULT 0,
    run_after timestamptz NOT NULL DEFAULT now(),
    leased_until timestamptz,
    -- Every model call the worker made for it: reviewer and replay
    spent_usd double precision NOT NULL DEFAULT 0,
    cap_usd double precision NOT NULL DEFAULT 5,
    replay_requested_by text,
    PRIMARY KEY (project_id, id),
    UNIQUE (project_id, run_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);

CREATE INDEX incidents_opened ON incidents (project_id, opened_at DESC);

-- Rows with a job still to do
CREATE INDEX incidents_due ON incidents (run_after)
    WHERE find_state = 'pending'
        OR (find_state = 'done' AND (review_state = 'pending' OR replay_state IN ('requested', 'running')));

-- Runs blocked before this table existed. Ingest uses the same id.
INSERT INTO incidents (project_id, id, run_id, opened_at)
SELECT project_id, 'inc_' || left(md5(project_id::text || ':' || run_id), 16), run_id, min(at)
FROM decisions
WHERE decision = 'block'
GROUP BY project_id, run_id
ON CONFLICT DO NOTHING;
