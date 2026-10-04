-- When someone first opened the incident's page, null until then
ALTER TABLE incidents ADD COLUMN seen_at timestamptz;

-- A replay starts from the incident page, so those pages were opened
UPDATE incidents SET seen_at = opened_at WHERE replay_state <> 'idle';
