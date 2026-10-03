import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check, label, model, runOf, stepOf, tool } from "../../test/agents.ts";
import { item } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import type { RunItem } from "../ingest/rows.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { agentStats } from "./stats.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const since = new Date("2026-10-02T18:40:00.000Z");

async function projectWith(events: RunItem["event"][]): Promise<string> {
    const projectId = await createProject(test.db, "Acme");
    await ingestBatch(
        test.db,
        projectId,
        events.map((event) => item(event)),
    );
    return projectId;
}

const [r1, r2] = [runOf(1), runOf(2)];
const [s1, s2, s3, s4, s5, s6, s7, s8, s9] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(stepOf) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
];
const noon = (time: string) => `2026-10-03T12:00:${time}Z`;

const calls = (): RunItem["event"][] => [
    // Started before any untrusted content
    model(r1, "billing", s1, noon("01.000")),
    label(r1, s9, "c1", noon("02.000")),
    // Started after it
    model(r1, "billing", s2, noon("04.000")),
    // Failed without a price, and started before it
    model(r1, "billing", s3, noon("02.000"), { model: "mystery", status: "error", usage: undefined }),
    // Started before it too, but its own input was untrusted
    model(r1, "billing", s4, noon("01.500"), { durationMs: 0 }),
    label(r1, s4, "c2", noon("09.000")),
    tool(r1, "billing", s5, noon("10.000")),
    model(r1, "researcher", s6, noon("11.000")),
    // Right before since, and right at it
    model(r2, "billing", s1, "2026-10-02T18:39:59.999Z"),
    model(r2, "billing", s2, "2026-10-02T18:40:00.000Z"),
];

const checks = (): RunItem["event"][] => [
    // Two asks and a block on one call
    check(r1, "billing", s5, noon("10.100"), "ask"),
    check(r1, "billing", s5, noon("10.200"), "ask", { guard: "approval", rule: "approval" }),
    check(r1, "billing", s5, noon("10.300"), "block", { guard: "approval", rule: "human" }),
    check(r1, "billing", s6, noon("10.400"), "block"),
    // The same step id in another run is another call
    check(r2, "billing", s6, noon("10.400"), "block"),
    // Observed, allowed, another agent's, or before since
    check(r1, "billing", s7, noon("10.500"), "block", { mode: "observe", enforced: false }),
    check(r1, "billing", s8, noon("10.600"), "allow"),
    check(r1, "researcher", s9, noon("10.700"), "block"),
    check(r2, "billing", s7, "2026-10-02T18:39:59.999Z", "ask"),
    check(r2, "billing", s8, "2026-10-02T18:40:00.000Z", "ask"),
];

describe("agentStats", () => {
    it("is all zero in an empty project", async () => {
        expect(await agentStats(test.db, await projectWith([]), "billing", { since })).toEqual({
            modelCalls: 0,
            influenced: 0,
            costUsd: 0,
            costKnown: true,
            asked: 0,
            blocked: 0,
        });
    });

    it("counts the agent's model calls, influence, cost and guarded calls since since", async () => {
        // The same runs elsewhere, with untrusted content before every call
        await projectWith([...calls(), ...checks(), label(r1, s9, "c0", "2026-10-03T11:00:00.000Z")]);
        const projectId = await projectWith([...calls(), ...checks()]);

        const stats = await agentStats(test.db, projectId, "billing", { since });

        expect(stats).toEqual({
            modelCalls: 5,
            influenced: 2,
            costUsd: expect.closeTo(0.0123, 10) as number,
            costKnown: true,
            asked: 2,
            blocked: 3,
        });
    });

    it("knows the cost is unknown when a call that answered has no price", async () => {
        const projectId = await projectWith([
            model(r1, "billing", s1, noon("01.000")),
            model(r1, "billing", s2, noon("03.000"), { model: "mystery" }),
        ]);

        const stats = await agentStats(test.db, projectId, "billing", { since });

        expect(stats).toMatchObject({ modelCalls: 2, costUsd: 0.003075, costKnown: false });
    });
});
