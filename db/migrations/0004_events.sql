-- Every event as received, after redaction. The id makes resends harmless.
CREATE TABLE events (
    project_id uuid NOT NULL,
    event_id text NOT NULL CHECK (event_id ~ '^[0-9a-f]{16}$'),
    run_id text NOT NULL,
    step_id text,
    type text NOT NULL,
    agent text NOT NULL,
    at timestamptz NOT NULL,
    degraded boolean NOT NULL DEFAULT false,
    body jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, event_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);

CREATE INDEX events_run ON events (project_id, run_id, at);

-- Where each piece of content came from
CREATE TABLE labels (
    project_id uuid NOT NULL,
    run_id text NOT NULL,
    content_id text NOT NULL,
    step_id text NOT NULL,
    agent text NOT NULL,
    origin text NOT NULL,
    trust text NOT NULL CHECK (trust IN ('trusted', 'untrusted')),
    sensitivity text NOT NULL CHECK (sensitivity IN ('internal', 'public')),
    flags text[] NOT NULL DEFAULT '{}',
    keys text[] NOT NULL DEFAULT '{}',
    at timestamptz NOT NULL,
    PRIMARY KEY (project_id, run_id, content_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);

-- Every guard decision, allows included
CREATE TABLE decisions (
    project_id uuid NOT NULL,
    event_id text NOT NULL,
    run_id text NOT NULL,
    step_id text NOT NULL,
    agent text NOT NULL,
    tool text NOT NULL,
    guard text NOT NULL,
    rule text NOT NULL,
    decision text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('block', 'observe')),
    enforced boolean NOT NULL,
    reason text,
    field text,
    at timestamptz NOT NULL,
    PRIMARY KEY (project_id, event_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);

CREATE INDEX decisions_run ON decisions (project_id, run_id, at);
