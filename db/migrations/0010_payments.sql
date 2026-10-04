-- x402 payment steps, from the price request to the paid response, from
-- payment events. Wallet addresses stay in clear: they are public on chain.
CREATE TABLE payments (
    project_id uuid NOT NULL,
    event_id text NOT NULL,
    run_id text NOT NULL,
    step_id text NOT NULL,
    agent text NOT NULL,
    stage text NOT NULL CHECK (stage IN ('challenged', 'refused', 'signed', 'settled', 'failed')),
    host text NOT NULL,
    resource text NOT NULL,
    x402_version integer NOT NULL,
    scheme text NOT NULL,
    network text NOT NULL,
    asset text NOT NULL,
    -- Atomic units
    amount numeric(78, 0) NOT NULL,
    -- Null when the token's USD value is unknown
    usd double precision,
    pay_to text NOT NULL,
    tx_hash text,
    -- False for "paid, not delivered"
    delivered boolean,
    reason text,
    at timestamptz NOT NULL,
    PRIMARY KEY (project_id, event_id),
    FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, run_id) ON DELETE CASCADE
);

CREATE INDEX payments_at ON payments (project_id, at DESC);
CREATE INDEX payments_run ON payments (project_id, run_id, at);

-- Settled x402 spend per run, next to the model cost
ALTER TABLE runs ADD COLUMN spend_usd double precision NOT NULL DEFAULT 0;
-- False when a settled payment's token has no known USD value
ALTER TABLE runs ADD COLUMN spend_known boolean NOT NULL DEFAULT true;

-- The fleet check also watches the wallets x402 payments go to
ALTER TABLE fleet_values DROP CONSTRAINT fleet_values_kind_check;
ALTER TABLE fleet_values ADD CONSTRAINT fleet_values_kind_check
    CHECK (kind IN ('iban', 'email', 'domain', 'wallet'));
