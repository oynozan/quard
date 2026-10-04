-- Policy files and signature feeds that failed to load in an SDK,
-- one row per message, with how often it was reported
CREATE TABLE config_errors (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    source text NOT NULL CHECK (source IN ('policy', 'signatures')),
    message text NOT NULL,
    first_seen_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    count integer NOT NULL DEFAULT 1,
    PRIMARY KEY (project_id, source, message)
);

CREATE INDEX config_errors_last ON config_errors (project_id, last_seen_at DESC);

-- Events an SDK dropped and reported with a batch. The batch's first
-- event id makes a resend harmless.
CREATE TABLE upload_drops (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    batch_id text NOT NULL,
    count integer NOT NULL CHECK (count > 0),
    at timestamptz NOT NULL,
    PRIMARY KEY (project_id, batch_id)
);

CREATE INDEX upload_drops_at ON upload_drops (project_id, at);
