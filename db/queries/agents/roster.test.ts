import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finish, model, runOf, start, stepOf } from "../../test/agents.ts";
import { item } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import type { RunItem } from "../ingest/rows.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { agentLastSeen, agentRoster } from "./roster.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// The request time is 2026-10-03 18:40 UTC
const window = {
    since: new Date("2026-09-03T18:40:00.000Z"),
    dayAgo: new Date("2026-10-02T18:40:00.000Z"),
    idleSince: new Date("2026-10-03T18:38:00.000Z"),
};

async function projectWith(events: RunItem["event"][]): Promise<string> {
    const projectId = await createProject(test.db, "Acme");
    await ingestBatch(
        test.db,
        projectId,
        events.map((event) => item(event)),
    );
    return projectId;
}

const [r1, r2, r3, r4] = [runOf(1), runOf(2), runOf(3), runOf(4)];
const [s1, s2, s3] = [stepOf(1), stepOf(2), stepOf(3)];

describe("agentRoster", () => {
    it("has no agents in an empty project", async () => {
        expect(await agentRoster(test.db, await projectWith([]), window)).toEqual([]);
    });

    it("lists each agent with its last event, runs of the last day, model and state", async () => {
        const projectId = await projectWith([
            // A finished run where billing hands work to researcher
            start(r1, "billing", "2026-10-03T12:00:00.000Z"),
            model(r1, "billing", s1, "2026-10-03T12:00:01.000Z"),
            model(r1, "researcher", s2, "2026-10-03T12:00:03.000Z", { model: "gpt-5.4-nano", parentStepId: s1 }),
            model(r1, "billing", s3, "2026-10-03T12:00:05.000Z", { model: "gpt-5.4" }),
            finish(r1, "billing", "2026-10-03T12:00:10.000Z"),
            // Older than a day
            start(r2, "billing", "2026-10-01T09:00:00.000Z"),
            model(r2, "billing", s1, "2026-10-01T09:00:01.000Z", { model: "gpt-5" }),
            // No recorded end and a recent event
            start(r3, "billing", "2026-10-03T18:39:00.000Z"),
            // No recorded end, but quiet since idleSince
            start(r4, "planner", "2026-10-03T18:38:00.000Z"),
        ]);

        expect(await agentRoster(test.db, projectId, window)).toEqual([
            {
                agent: "billing",
                lastSeenAt: new Date("2026-10-03T18:39:00.000Z"),
                runs24h: 2,
                running: true,
                model: "gpt-5.4",
            },
            {
                agent: "planner",
                lastSeenAt: new Date("2026-10-03T18:38:00.000Z"),
                runs24h: 1,
                running: false,
                model: null,
            },
            {
                agent: "researcher",
                lastSeenAt: new Date("2026-10-03T12:00:03.000Z"),
                runs24h: 1,
                running: false,
                model: "gpt-5.4-nano",
            },
        ]);
    });

    it("counts from since and dayAgo on, and a recorded end stops running", async () => {
        const projectId = await projectWith([
            // Seen right at since; its only model call is older
            model(r1, "edge", s1, "2026-09-03T18:39:59.999Z"),
            start(r2, "edge", "2026-09-03T18:40:00.000Z"),
            // Only seen before since
            start(r3, "gone", "2026-09-03T18:39:59.999Z"),
            // One run starts right at dayAgo, one just before
            start(runOf(5), "daily", "2026-10-02T18:40:00.000Z"),
            start(runOf(6), "daily", "2026-10-02T18:39:59.999Z"),
            // A recent event in a run that ended
            start(runOf(7), "done", "2026-10-03T18:39:00.000Z"),
            finish(runOf(7), "done", "2026-10-03T18:39:30.000Z"),
        ]);

        const roster = await agentRoster(test.db, projectId, window);

        expect(roster.map((row) => row.agent)).toEqual(["daily", "done", "edge"]);
        expect(roster[0]).toMatchObject({ runs24h: 1, running: false });
        expect(roster[1]).toMatchObject({ runs24h: 1, running: false });
        expect(roster[2]).toEqual({
            agent: "edge",
            lastSeenAt: new Date("2026-09-03T18:40:00.000Z"),
            runs24h: 0,
            running: false,
            model: null,
        });
    });

    it("keeps to its project", async () => {
        const other = await projectWith([
            start(r1, "billing", "2026-10-03T18:39:00.000Z"),
            start(r2, "intruder", "2026-10-03T18:39:00.000Z"),
        ]);
        const projectId = await projectWith([start(r1, "billing", "2026-10-01T09:00:00.000Z")]);

        expect(await agentRoster(test.db, projectId, window)).toEqual([
            {
                agent: "billing",
                lastSeenAt: new Date("2026-10-01T09:00:00.000Z"),
                runs24h: 0,
                running: false,
                model: null,
            },
        ]);
        expect((await agentRoster(test.db, other, window)).map((row) => row.agent)).toEqual(["billing", "intruder"]);
    });
});

describe("agentLastSeen", () => {
    it("finds the newest event of any time", async () => {
        const projectId = await projectWith([
            start(r1, "billing", "2025-01-01T08:00:00.000Z"),
            model(r1, "billing", s1, "2025-01-01T08:00:01.000Z"),
            start(r2, "billing", "2024-06-01T08:00:00.000Z"),
        ]);

        expect(await agentLastSeen(test.db, projectId, "billing")).toEqual(new Date("2025-01-01T08:00:01.000Z"));
    });

    it("knows nothing about an agent without events in the project", async () => {
        await projectWith([start(r1, "elsewhere", "2026-10-03T12:00:00.000Z")]);
        const projectId = await projectWith([start(r1, "billing", "2026-10-03T12:00:00.000Z")]);

        expect(await agentLastSeen(test.db, projectId, "elsewhere")).toBeUndefined();
        expect(await agentLastSeen(test.db, projectId, "Billing")).toBeUndefined();
    });
});
