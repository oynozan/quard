-- A project holds one team's agents and runs
CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
