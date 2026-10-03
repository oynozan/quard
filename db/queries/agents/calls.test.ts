import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check, label, model, runOf, start, stepOf, tool } from "../../test/agents.ts";
import { item } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import type { RunItem } from "../ingest/rows.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { getRun, type RunDetail } from "../runs.ts";
import { agentRecentCalls } from "./calls.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

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
const asked = [{ callId: "call_1", name: "payInvoice", arguments: "{}" }];

const runs = (): RunItem["event"][] => [
    // billing pays after a permission check and an action block, then researcher reads the web
    start(r1, "billing", "2026-10-03T10:00:00.000Z"),
    label(r1, s1, "c1", "2026-10-03T10:00:00.500Z", "trusted"),
    model(r1, "billing", s1, "2026-10-03T10:00:01.000Z", { toolCalls: asked }),
    check(r1, "billing", s2, "2026-10-03T10:00:01.900Z", "allow", { guard: "permission", rule: "permission" }),
    check(r1, "billing", s2, "2026-10-03T10:00:01.950Z", "block"),
    tool(r1, "billing", s2, "2026-10-03T10:00:02.000Z", { tool: "payInvoice", callId: "call_1", status: "blocked" }),
    label(r1, s3, "c2", "2026-10-03T10:00:02.500Z"),
    check(r1, "researcher", s3, "2026-10-03T10:00:02.900Z", "allow", { guard: "permission", rule: "requested-call" }),
    model(r1, "researcher", s3, "2026-10-03T10:00:03.000Z", { parentStepId: s2 }),
    // A newer run with an ask
    label(r2, s1, "c1", "2026-10-03T11:00:00.500Z"),
    model(r2, "billing", s1, "2026-10-03T11:00:01.000Z"),
    check(r2, "billing", s2, "2026-10-03T11:00:01.900Z", "ask", { guard: "approval", rule: "approval" }),
    tool(r2, "billing", s2, "2026-10-03T11:00:02.000Z"),
    // An older run
    label(r3, s1, "c1", "2026-10-03T09:00:00.500Z"),
    model(r3, "billing", s1, "2026-10-03T09:00:01.000Z"),
];

const ofBilling = <T extends { agent: string }>(rows: T[]) => rows.filter((row) => row.agent === "billing");

async function stored(projectId: string, runId: string): Promise<RunDetail> {
    const run = await getRun(test.db, projectId, runId);
    if (run === undefined) throw new Error(`run ${runId} is missing`);
    return run;
}

describe("agentRecentCalls", () => {
    it("has no calls in an empty project", async () => {
        expect(await agentRecentCalls(test.db, await projectWith([]), "billing", { limit: 60 })).toEqual([]);
    });

    it("has no calls for an agent without steps in the project", async () => {
        await projectWith([model(r1, "planner", s1, "2026-10-03T10:00:01.000Z")]);
        const projectId = await projectWith(runs());

        expect(await agentRecentCalls(test.db, projectId, "planner", { limit: 60 })).toEqual([]);
    });

    it("groups the newest steps by run, with labels and decisions as getRun reads them", async () => {
        // The same runs elsewhere, with one more label and a newer run
        await projectWith([
            ...runs(),
            label(r1, s1, "c9", "2026-10-03T10:00:00.700Z"),
            model(r4, "billing", s1, "2026-10-03T12:00:01.000Z"),
        ]);
        const projectId = await projectWith(runs());
        const [run1, run2] = [await stored(projectId, r1), await stored(projectId, r2)];

        const groups = await agentRecentCalls(test.db, projectId, "billing", { limit: 3 });

        expect(groups).toEqual([
            { runId: r2, steps: run2.steps, labels: run2.labels, decisions: run2.decisions },
            {
                runId: r1,
                steps: run1.steps.filter((step) => step.stepId === s2),
                labels: run1.labels,
                decisions: ofBilling(run1.decisions),
            },
        ]);
        const [newer, older] = groups;
        expect(newer?.steps.map((step) => step.kind)).toEqual(["model_call", "tool_call"]);
        expect(older?.steps[0]).toMatchObject({ stepId: s2, name: "payInvoice", callId: "call_1", status: "blocked" });
        expect(older?.labels.map((row) => row.contentId)).toEqual(["c1", "c2"]);
        expect(older?.decisions.map((row) => row.rule)).toEqual(["permission", "iban:from"]);
        expect(older?.decisions[1]).toMatchObject({ enforced: true, degraded: false, score: null });
    });

    it("keeps every step of each run when the limit allows", async () => {
        const projectId = await projectWith(runs());
        const run1 = await stored(projectId, r1);

        const groups = await agentRecentCalls(test.db, projectId, "billing", { limit: 60 });

        expect(groups.map((group) => group.runId)).toEqual([r2, r1, r3]);
        expect(groups[1]?.steps).toEqual(ofBilling(run1.steps));
        expect(groups[1]?.steps.map((step) => step.stepId)).toEqual([s1, s2]);
    });
});
