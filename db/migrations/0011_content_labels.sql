-- Chunks of public content a detector labeled, kept for the review queue.
-- The text is stored as the detector got it: secrets removed, and
-- emails, IBANs and cards masked.
CREATE TABLE chunk_labels (
    project_id uuid NOT NULL,
    event_id text NOT NULL,
    run_id text NOT NULL,
    step_id text NOT NULL,
    agent text NOT NULL,
    tool text NOT NULL,
    origin text NOT NULL,
    detector text NOT NULL,
    chunk integer NOT NULL,
    text text NOT NULL,
    label text NOT NULL,
    probabilities jsonb NOT NULL,
    -- The chance of the picked label. Low means the detector was unsure.
    confidence double precision NOT NULL,
    -- The risky labels added up
    score double precision NOT NULL,
    injection double precision,
    at timestamptz NOT NULL,
    -- The label a person says is right, and who said it
    reviewed_label text,
    reviewed_by text,
    reviewed_at timestamptz,
    -- The AI fallback, for chunks labeled none. Null for other labels.
    fallback_state text CHECK (fallback_state IN ('pending', 'done', 'skipped', 'failed')),
    fallback_label text,
    fallback_reason text,
    fallback_model text,
    fallback_cost_usd double precision,
    fallback_error text,
    attempts integer NOT NULL DEFAULT 0,
    leased_until timestamptz,
    PRIMARY KEY (project_id, event_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);

CREATE INDEX chunk_labels_queue ON chunk_labels (project_id, confidence, at DESC) WHERE reviewed_at IS NULL;
CREATE INDEX chunk_labels_reviewed ON chunk_labels (project_id, reviewed_at DESC) WHERE reviewed_at IS NOT NULL;
CREATE INDEX chunk_labels_fallback ON chunk_labels (at) WHERE fallback_state = 'pending';
CREATE INDEX chunk_labels_run ON chunk_labels (project_id, run_id, at);
