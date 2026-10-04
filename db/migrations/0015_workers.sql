-- Each worker process checks in every few seconds, so a stopped worker shows
CREATE TABLE workers (
    id text PRIMARY KEY,
    host text NOT NULL,
    pid integer NOT NULL,
    started_at timestamptz NOT NULL,
    seen_at timestamptz NOT NULL
);
