import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { database } from "@/lib/data/runs/live/client";
import { searchRuns } from "@/lib/data/search";
import { HASH_KEY, items, type RunEvent } from "./events";

// Starts the database the dashboard reads, with the hash key set before each test
export function setUpSearchDb(): (...events: RunEvent[]) => Promise<string> {
    let test: TestDb;

    beforeAll(async () => {
        test = await startTestDb();
        vi.stubEnv("DATABASE_URL", test.url);
        vi.stubEnv("QUARD_PROJECT_ID", "");
    }, 60_000);

    beforeEach(() => {
        vi.stubEnv("QUARD_HASH_KEY", HASH_KEY);
    });

    afterAll(async () => {
        await database().destroy();
        vi.unstubAllEnvs();
        await test.stop();
    });

    // A fresh project holding these runs, made the dashboard's current project
    return async (...events) => {
        const id = await createProject(test.db, "Search");
        if (events.length > 0) await ingestBatch(test.db, id, items(events));
        vi.stubEnv("QUARD_PROJECT_ID", id);
        return id;
    };
}

// What a search found, failing the test when the query was not searched
export async function found(query: string) {
    const search = await searchRuns(query);
    if (search.state !== "searched") throw new Error(`not searched: ${search.state}`);
    return search.result;
}
