import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { model, runOf, start, stepOf, tool } from "../../test/agents.ts";
import { item } from "../../test/events.ts";
import { insertMessages, type MessageRow } from "../../test/messages.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import type { RunItem } from "../ingest/rows.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { agentMessageLinks } from "./messages.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const since = new Date("2026-09-03T18:40:00.000Z");
const [r1, r2] = [runOf(1), runOf(2)];
const [s1, s2, s3] = [1, 2, 3].map(stepOf) as [string, string, string];

async function projectWith(events: RunItem["event"][], rows: MessageRow[]): Promise<string> {
    const projectId = await createProject(test.db, "Acme");
    await ingestBatch(
        test.db,
        projectId,
        events.map((event) => item(event)),
    );
    if (rows.length > 0) await insertMessages(test.db, projectId, rows);
    return projectId;
}

const runs = () => [start(r1, "triage", "2026-10-03T12:00:00.000Z"), start(r2, "triage", "2026-10-03T13:00:00.000Z")];

const row = (runId: string, kind: MessageRow["kind"], from: string, to: string, at: string, more = {}) => ({
    runId,
    stepId: s3,
    kind,
    from,
    to,
    at: `2026-10-03T${at}.000Z`,
    ...more,
});

// triage hands off to billing and runs research as a tool; billing writes back
const traffic = (): MessageRow[] => [
    row(r1, "handoff", "triage", "billing", "12:00:01"),
    row(r1, "tool", "triage", "billing", "12:00:02", { trust: "untrusted" }),
    row(r2, "handoff", "triage", "billing", "13:00:01"),
    row(r1, "message", "billing", "triage", "12:00:05", { verified: false }),
    row(r2, "message", "billing", "triage", "13:00:05", { trust: "untrusted", verified: false }),
    row(r1, "tool", "triage", "research", "12:00:03"),
    // An agent that talks to itself is no link
    row(r1, "message", "triage", "triage", "12:00:04"),
];

const triageToBilling = {
    delegated: 0,
    delegatedMessages: 0,
    from: "triage",
    to: "billing",
    handoffs: 3,
    messages: 0,
    untrusted: 1,
    lastAt: new Date("2026-10-03T13:00:01.000Z"),
};

const billingToTriage = {
    delegated: 0,
    delegatedMessages: 0,
    from: "billing",
    to: "triage",
    handoffs: 0,
    messages: 2,
    untrusted: 2,
    lastAt: new Date("2026-10-03T13:00:05.000Z"),
};

const triageToResearch = {
    delegated: 0,
    delegatedMessages: 0,
    from: "triage",
    to: "research",
    handoffs: 1,
    messages: 0,
    untrusted: 0,
    lastAt: new Date("2026-10-03T12:00:03.000Z"),
};

describe("agentMessageLinks", () => {
    it("has no links in an empty project", async () => {
        expect(await agentMessageLinks(test.db, await projectWith([], []), { since })).toEqual([]);
    });

    it("counts handoffs and messages per pair, busiest first, in its own project", async () => {
        await projectWith(runs(), [...traffic(), row(r1, "message", "intruder", "triage", "12:00:06")]);
        const projectId = await projectWith(runs(), traffic());

        expect(await agentMessageLinks(test.db, projectId, { since })).toEqual([
            triageToBilling,
            billingToTriage,
            triageToResearch,
        ]);
    });

    it("keeps the links of one agent", async () => {
        const projectId = await projectWith(runs(), traffic());
        const linksOf = async (agent: string) => agentMessageLinks(test.db, projectId, { since, agent });

        expect(await linksOf("billing")).toEqual([triageToBilling, billingToTriage]);
        expect(await linksOf("research")).toEqual([triageToResearch]);
        expect(await linksOf("nobody")).toEqual([]);
    });

    it("counts a message as delegated only when it names another agent's step of its run", async () => {
        const projectId = await projectWith(
            [
                ...runs(),
                tool(r1, "orchestrator", s1, "2026-10-03T12:00:01.000Z"),
                model(r2, "orchestrator", s1, "2026-10-03T13:00:01.000Z"),
                tool(r2, "orchestrator", s2, "2026-10-03T13:00:02.000Z"),
                tool(r2, "billing", s3, "2026-10-03T13:00:03.000Z"),
            ],
            [
                // No record vouched for it, so its step tells who sent it
                row(r1, "message", "unknown", "billing", "12:00:02", { parentStepId: s1, verified: false }),
                // The step is in another run, or there is none, so it stays a message
                row(r1, "message", "unknown", "billing", "12:00:03", { parentStepId: s2, verified: false }),
                row(r1, "message", "unknown", "billing", "12:00:04", { parentStepId: stepOf(9), verified: false }),
                row(r1, "message", "unknown", "billing", "12:00:05", { verified: false }),
                // A step of the receiver itself is no delegation
                row(r2, "message", "unknown", "billing", "13:00:04", { parentStepId: s3, verified: false }),
                // A delegation is from the agent of its step, as in one process
                row(r2, "message", "planner", "billing", "13:00:05", { parentStepId: s1 }),
            ],
        );

        expect(await agentMessageLinks(test.db, projectId, { since })).toEqual([
            {
                ...billingToTriage,
                from: "unknown",
                to: "billing",
                messages: 4,
                untrusted: 4,
                lastAt: new Date("2026-10-03T13:00:04.000Z"),
            },
            {
                ...billingToTriage,
                from: "orchestrator",
                to: "billing",
                delegated: 2,
                delegatedMessages: 2,
                untrusted: 1,
                lastAt: new Date("2026-10-03T13:00:05.000Z"),
            },
        ]);
    });

    it("counts the messages that name the sender's step as delegated across processes", async () => {
        const steps = [
            tool(r1, "orchestrator", s1, "2026-10-03T12:00:01.000Z"),
            tool(r2, "orchestrator", s2, "2026-10-03T13:00:01.000Z"),
        ];
        const projectId = await projectWith(
            [...runs(), ...steps],
            [
                row(r1, "message", "orchestrator", "billing", "12:00:02", { parentStepId: s1 }),
                row(r2, "message", "orchestrator", "billing", "13:00:02", { parentStepId: s2, trust: "untrusted" }),
                // A reply with no carrier stays a message
                row(r2, "message", "orchestrator", "billing", "13:00:03"),
                row(r1, "handoff", "orchestrator", "billing", "12:00:04"),
            ],
        );

        expect(await agentMessageLinks(test.db, projectId, { since })).toEqual([
            {
                from: "orchestrator",
                to: "billing",
                handoffs: 1,
                messages: 3,
                delegated: 2,
                delegatedMessages: 2,
                untrusted: 1,
                lastAt: new Date("2026-10-03T13:00:03.000Z"),
            },
        ]);
    });

    it("counts a delegation once per run, step and receiver, as in one process", async () => {
        const projectId = await projectWith(
            [...runs(), tool(r1, "orchestrator", s1, "2026-10-03T12:00:01.000Z")],
            [
                row(r1, "message", "orchestrator", "billing", "12:00:02", { parentStepId: s1 }),
                row(r1, "message", "orchestrator", "billing", "12:00:03", { parentStepId: s1 }),
                row(r1, "message", "orchestrator", "research", "12:00:04", { parentStepId: s1 }),
            ],
        );
        const sent = { from: "orchestrator", handoffs: 0, untrusted: 0, delegated: 1 };

        // Both messages to billing are delegations, though they make one
        expect(await agentMessageLinks(test.db, projectId, { since })).toEqual([
            {
                ...sent,
                to: "billing",
                messages: 2,
                delegatedMessages: 2,
                lastAt: new Date("2026-10-03T12:00:03.000Z"),
            },
            {
                ...sent,
                to: "research",
                messages: 1,
                delegatedMessages: 1,
                lastAt: new Date("2026-10-03T12:00:04.000Z"),
            },
        ]);
    });

    it("counts rows from since on", async () => {
        const projectId = await projectWith(runs(), [
            { ...row(r1, "handoff", "triage", "billing", "12:00:01"), at: "2026-09-03T18:39:59.999Z" },
            { ...row(r1, "handoff", "triage", "billing", "12:00:01"), at: since.toISOString() },
        ]);

        expect(await agentMessageLinks(test.db, projectId, { since })).toEqual([
            { ...triageToBilling, handoffs: 1, untrusted: 0, lastAt: since },
        ]);
    });
});
