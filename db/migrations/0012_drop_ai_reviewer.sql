-- Incidents have no AI reviewer, so no note and no review job
DROP INDEX incidents_due;
ALTER TABLE incidents DROP COLUMN reviewer;
ALTER TABLE incidents DROP COLUMN review_state;

-- Rows with a job still to do
CREATE INDEX incidents_due ON incidents (run_after)
    WHERE find_state = 'pending'
        OR (find_state = 'done' AND replay_state IN ('requested', 'running'));
