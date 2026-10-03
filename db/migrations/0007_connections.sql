-- SDK processes linked to control
CREATE TABLE sdk_connections (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    id text NOT NULL CHECK (id ~ '^con_[0-9a-f]{16}$'),
    key_id uuid NOT NULL REFERENCES agent_keys (id) ON DELETE CASCADE,
    sdk text NOT NULL,
    host text NOT NULL,
    pid integer NOT NULL,
    rules_hash text,
    connected_at timestamptz NOT NULL DEFAULT now(),
    disconnected_at timestamptz,
    PRIMARY KEY (project_id, id)
);

-- Each set of active rules, as names and a hash. The dashboard shows
-- them read-only, because rules live in code and the policy file.
CREATE TABLE rule_sets (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{16}$'),
    rules jsonb NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, hash)
);

-- Each agent's model, instructions and tools, once per version
CREATE TABLE agent_versions (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    agent text NOT NULL,
    version text NOT NULL CHECK (version ~ '^[0-9a-f]{16}$'),
    model text NOT NULL,
    tools text[] NOT NULL DEFAULT '{}',
    instructions text,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, agent, version)
);

-- Every decision records the rules in force and, for approvals, the request
ALTER TABLE decisions ADD COLUMN rules_hash text;
ALTER TABLE decisions ADD COLUMN request_id text;
