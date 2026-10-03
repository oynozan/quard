-- Per-day counts for limit guards, shared by every process in a project.
-- Days are UTC. counter is "calls" or "amount:<field>".
CREATE TABLE day_counters (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    day date NOT NULL,
    tool text NOT NULL,
    counter text NOT NULL,
    used double precision NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, day, tool, counter)
);

-- When the fleet check first saw a value; its first days only observe
ALTER TABLE projects ADD COLUMN fleet_started_at timestamptz;

-- Values the fleet check watches, by hashed key. Kept for a year, so old
-- values never look new again.
CREATE TABLE fleet_values (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    key text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('iban', 'email', 'domain')),
    -- The field it was first seen in
    field text NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    quarantined_at timestamptz,
    -- Quarantined while the check still only observed
    observe boolean NOT NULL DEFAULT false,
    known_at timestamptz,
    known_by text,
    PRIMARY KEY (project_id, key)
);

CREATE INDEX fleet_values_quarantined ON fleet_values (project_id) WHERE quarantined_at IS NOT NULL;

-- Each call that used a watched value, blocked attempts included
CREATE TABLE fleet_uses (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id uuid NOT NULL,
    key text NOT NULL,
    run_id text NOT NULL,
    agent text NOT NULL,
    tool text NOT NULL,
    blocked boolean NOT NULL,
    at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (project_id, key) REFERENCES fleet_values (project_id, key) ON DELETE CASCADE
);

CREATE INDEX fleet_uses_key ON fleet_uses (project_id, key, at DESC);
