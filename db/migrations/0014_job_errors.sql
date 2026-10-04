-- How many times in a row the incident's job threw
ALTER TABLE incidents ADD COLUMN errors integer NOT NULL DEFAULT 0;
