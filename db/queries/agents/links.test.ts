import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { label, model, runOf, start, stepOf, tool } from "../../test/agents.ts";
import { item } from "../../test/events.ts";
import { insertMessages, type MessageRow } from "../../test/messages.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import type { RunItem } from "../ingest/rows.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { agentLinks } from "./links.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const since = new Date("2026-09-03T18:40:00.000Z");

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
const [s1, s2, s3, s4, s5, s6] = [1, 2, 3, 4, 5, 6].map(stepOf) as [string, string, string, string, string, string];

// billing hands work to researcher, who hands work to writer.
// Calls with no parent step, or one of their own agent, are no link.
const chain = (): RunItem["event"][] => [
    start(r1, "billing", "2026-10-03T12:00:00.000Z"),
    model(r1, "billing", s1, "2026-10-03T12:00:01.000Z"),
    tool(r1, "billing", s2, "2026-10-03T12:00:09.000Z", { durationMs: 7000 }),
    model(r1, "researcher", s3, "2026-10-03T12:00:04.000Z", { parentStepId: s2 }),
    model(r1, "researcher", s4, "2026-10-03T12:00:06.000Z", { parentStepId: s2 }),
    model(r1, "writer", s5, "2026-10-03T12:00:07.000Z", { parentStepId: s4 }),
    start(r2, "billing", "2026-10-03T13:00:00.000Z"),
    model(r2, "billing", s1, "2026-10-03T13:00:01.000Z"),
    model(r2, "researcher", s2, "2026-10-03T13:00:03.000Z", { parentStepId: s1 }),
    tool(r2, "billing", s3, "2026-10-03T13:00:05.000Z"),
    model(r2, "researcher", s4, "2026-10-03T13:00:08.000Z", { parentStepId: s3 }),
    model(r2, "researcher", s5, "2026-10-03T13:00:09.000Z", { parentStepId: s4 }),
    model(r2, "planner", s6, "2026-10-03T13:00:10.000Z", { parentStepId: stepOf(99) }),
];

const billingToResearcher = {
    from: "billing",
    to: "researcher",
    delegations: 3,
    untrusted: 0,
    runs: 2,
    lastAt: new Date("2026-10-03T13:00:08.000Z"),
};

const researcherToWriter = {
    from: "researcher",
    to: "writer",
    delegations: 1,
    untrusted: 0,
    runs: 1,
    lastAt: new Date("2026-10-03T12:00:07.000Z"),
};

describe("agentLinks", () => {
    it("has no links in an empty project", async () => {
        expect(await agentLinks(test.db, await projectWith([]), { since })).toEqual([]);
    });

    it("counts delegations per pair, most first, in its own project", async () => {
        // The same runs elsewhere, with untrusted content and one more link
        await projectWith([
            ...chain(),
            label(r1, s1, "c1", "2026-10-03T12:00:00.500Z"),
            model(r1, "intruder", stepOf(7), "2026-10-03T12:00:08.000Z", { parentStepId: s1 }),
        ]);
        const projectId = await projectWith(chain());

        expect(await agentLinks(test.db, projectId, { since })).toEqual([billingToResearcher, researcherToWriter]);
    });

    it("keeps the links of one agent", async () => {
        const projectId = await projectWith(chain());
        const linksOf = async (agent: string) => agentLinks(test.db, projectId, { since, agent });

        expect(await linksOf("researcher")).toEqual([billingToResearcher, researcherToWriter]);
        expect(await linksOf("billing")).toEqual([billingToResearcher]);
        expect(await linksOf("writer")).toEqual([researcherToWriter]);
        expect(await linksOf("planner")).toEqual([]);
    });

    it("leaves out a delegation that a message from another process counts", async () => {
        const message = (runId: string, parentStepId: string, to: string, more: Partial<MessageRow> = {}) => ({
            runId,
            stepId: stepOf(8),
            kind: "message" as const,
            from: "billing",
            to,
            parentStepId,
            at: "2026-10-03T12:00:03.000Z",
            ...more,
        });
        const other = await projectWith(chain());
        await insertMessages(test.db, other, [message(r2, s1, "researcher")]);
        const projectId = await projectWith(chain());
        await insertMessages(test.db, projectId, [
            message(r1, s2, "researcher"),
            // Another receiver, a handoff, and a message from before since
            message(r2, s1, "writer"),
            message(r2, s3, "researcher", { kind: "handoff" }),
            message(r2, s3, "researcher", { at: "2026-09-03T18:39:59.000Z" }),
        ]);

        expect(await agentLinks(test.db, projectId, { since })).toEqual([
            { ...billingToResearcher, delegations: 2, runs: 1 },
            researcherToWriter,
        ]);
    });

    it("leaves out a delegation that a handoff or agent run as a tool counts", async () => {
        // The SDK records these on the parent's step, with no parent step
        const handoff = (runId: string, stepId: string, to: string, more: Partial<MessageRow> = {}) => ({
            runId,
            stepId,
            kind: "handoff" as const,
            from: "billing",
            to,
            at: "2026-10-03T12:00:03.000Z",
            ...more,
        });
        const projectId = await projectWith(chain());
        await insertMessages(test.db, projectId, [
            handoff(r1, s2, "researcher"),
            handoff(r2, s1, "researcher", { kind: "tool" }),
            // Another receiver, and a handoff from before since
            handoff(r2, s3, "writer"),
            handoff(r1, s4, "writer", { at: "2026-09-03T18:39:59.000Z" }),
        ]);

        expect(await agentLinks(test.db, projectId, { since })).toEqual([
            { ...billingToResearcher, delegations: 1, runs: 1 },
            researcherToWriter,
        ]);
    });

    it("marks a delegation untrusted when its first model call had read untrusted content", async () => {
        // billing hands work to researcher in each run
        const handOff = (n: number, ...events: RunItem["event"][]) => [
            tool(runOf(n), "billing", s1, "2026-10-03T12:00:30.000Z"),
            ...events,
        ];
        const call = (n: number, step: string, at: string, durationMs = 1000) =>
            model(runOf(n), "researcher", step, at, { parentStepId: s1, durationMs });
        const projectId = await projectWith([
            // Read before the first call started
            ...handOff(
                1,
                call(1, s2, "2026-10-03T12:00:03.000Z"),
                label(runOf(1), s6, "c1", "2026-10-03T12:00:01.000Z"),
            ),
            // The first call's own input
            ...handOff(
                2,
                call(2, s2, "2026-10-03T12:00:03.000Z"),
                label(runOf(2), s2, "c1", "2026-10-03T12:00:02.500Z"),
            ),
            // Stored right as the first call started
            ...handOff(
                3,
                call(3, s2, "2026-10-03T12:00:03.000Z"),
                label(runOf(3), s6, "c1", "2026-10-03T12:00:02.000Z"),
            ),
            // Read by the second call only
            ...handOff(
                4,
                call(4, s2, "2026-10-03T12:00:03.000Z"),
                call(4, s3, "2026-10-03T12:00:05.000Z"),
                label(runOf(4), s3, "c1", "2026-10-03T12:00:03.500Z"),
            ),
            // Trusted
            ...handOff(
                5,
                call(5, s2, "2026-10-03T12:00:03.000Z"),
                label(runOf(5), s6, "c1", "2026-10-03T12:00:01.000Z", "trusted"),
            ),
            // The first call started at :01 and ended last. The label came after it started.
            ...handOff(
                6,
                call(6, s2, "2026-10-03T12:00:05.000Z", 4000),
                call(6, s3, "2026-10-03T12:00:03.000Z"),
                label(runOf(6), s6, "c1", "2026-10-03T12:00:01.500Z"),
            ),
            // The same calls, where the label is the first call's own input
            ...handOff(
                7,
                call(7, s2, "2026-10-03T12:00:05.000Z", 4000),
                call(7, s3, "2026-10-03T12:00:03.000Z"),
                label(runOf(7), s2, "c1", "2026-10-03T12:00:01.500Z"),
            ),
        ]);

        expect(await agentLinks(test.db, projectId, { since })).toEqual([
            {
                from: "billing",
                to: "researcher",
                delegations: 7,
                untrusted: 3,
                runs: 7,
                lastAt: new Date("2026-10-03T12:00:05.000Z"),
            },
        ]);
    });

    it("counts a delegation with a call from since on, judged by its first call", async () => {
        const projectId = await projectWith([
            // Its first call ended before since, its second right at since
            tool(r1, "billing", s1, "2026-09-03T18:40:30.000Z"),
            model(r1, "researcher", s2, "2026-09-03T18:39:59.000Z", { parentStepId: s1 }),
            model(r1, "researcher", s3, "2026-09-03T18:40:00.000Z", { parentStepId: s1 }),
            // Read after the first call started, before the second one did
            label(r1, s6, "c1", "2026-09-03T18:39:58.500Z"),
            // Every call ended before since
            tool(r2, "billing", s1, "2026-09-03T18:40:30.000Z"),
            model(r2, "researcher", s2, "2026-09-03T18:39:59.999Z", { parentStepId: s1 }),
        ]);

        expect(await agentLinks(test.db, projectId, { since })).toEqual([
            { from: "billing", to: "researcher", delegations: 1, untrusted: 0, runs: 1, lastAt: since },
        ]);
    });
});
