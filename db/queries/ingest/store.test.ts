import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { content, decision, finished, item, modelCall, RUN, started, toolCall, warning } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { getRun } from "../runs.ts";
import { ingestBatch } from "./store.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("ingestBatch", () => {
    it("stores a run with its steps, labels, decisions and counts", async () => {
        const projectId = await createProject(test.db, "Acme");
        const items = [
            item(started()),
            item(modelCall()),
            item(content()),
            item(decision()),
            item(toolCall()),
            item(warning()),
        ];

        expect(await ingestBatch(test.db, projectId, items)).toBe(6);

        const run = await getRun(test.db, projectId, RUN);
        expect(run).toMatchObject({
            agent: "billing",
            origins: { "mcp:crm": { trust: "trusted" } },
            modelCalls: 1,
            toolCalls: 1,
            blocked: 1,
            influenced: true,
            flagged: true,
            degraded: false,
            costUsd: 0.003075,
            costKnown: true,
        });
        expect(run?.steps.map((step) => step.kind)).toEqual(["model_call", "tool_call"]);
        expect(run?.labels).toHaveLength(1);
        expect(run?.decisions).toHaveLength(1);
        expect(run?.decisions[0]).toMatchObject({ rulesHash: null, requestId: null });
        expect(run?.warnings).toHaveLength(1);
    });

    it("keeps the rules hash and approval request of each decision", async () => {
        const projectId = await createProject(test.db, "Acme");
        const answered = {
            ...decision(),
            guard: "approval",
            rule: "human",
            decision: "allow" as const,
            rules: "a".repeat(16),
            request: "apr_0123456789abcdef",
        };
        await ingestBatch(test.db, projectId, [item(started()), item(answered)]);

        const run = await getRun(test.db, projectId, RUN);
        expect(run?.decisions[0]).toMatchObject({
            guard: "approval",
            rule: "human",
            rulesHash: "a".repeat(16),
            requestId: "apr_0123456789abcdef",
        });
    });

    it("changes nothing when the same batch arrives again", async () => {
        const projectId = await createProject(test.db, "Acme");
        const items = [item(started()), item(modelCall()), item(decision())];
        await ingestBatch(test.db, projectId, items);

        expect(await ingestBatch(test.db, projectId, items)).toBe(0);
        const events = await test.db
            .selectFrom("events")
            .select("event_id")
            .where("project_id", "=", projectId)
            .execute();
        expect(events).toHaveLength(3);
    });

    it("joins later batches to the run, keeping the earliest start", async () => {
        const projectId = await createProject(test.db, "Acme");
        // A child agent's event arrives before run_started
        const early = { ...modelCall("2026-10-03T12:00:01.000Z"), agent: "researcher" };
        await ingestBatch(test.db, projectId, [item(early)]);
        await ingestBatch(test.db, projectId, [
            item(started()),
            item(toolCall("ok", "2026-10-03T12:00:09.000Z"), true),
        ]);

        const run = await getRun(test.db, projectId, RUN);
        expect(run).toMatchObject({ agent: "billing", blocked: 0, degraded: true, flagged: false });
        expect(run?.startedAt.toISOString()).toBe("2026-10-03T12:00:00.000Z");
        expect(run?.lastEventAt.toISOString()).toBe("2026-10-03T12:00:09.000Z");
    });

    it("records how a run finished, with its error", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [item(started())]);
        expect(await getRun(test.db, projectId, RUN)).toMatchObject({ endedAt: null, outcome: null, error: null });

        await ingestBatch(test.db, projectId, [item(finished("failed", "boom"))]);
        const failed = await getRun(test.db, projectId, RUN);
        expect(failed).toMatchObject({ outcome: "failed", error: "boom" });
        expect(failed?.endedAt?.toISOString()).toBe("2026-10-03T12:00:10.000Z");

        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, other, [item(started()), item(finished())]);
        expect(await getRun(test.db, other, RUN)).toMatchObject({ outcome: "completed", error: null });
    });

    it("marks the cost unknown when a model has no price, but not for failed calls", async () => {
        const projectId = await createProject(test.db, "Acme");
        const failed = { ...modelCall(), stepId: "7".repeat(16), status: "error" as const, usage: undefined };
        await ingestBatch(test.db, projectId, [item(started()), item(failed)]);
        expect(await getRun(test.db, projectId, RUN)).toMatchObject({ costUsd: 0, costKnown: true });

        await ingestBatch(test.db, projectId, [item({ ...modelCall(), model: "my-local-model" })]);
        expect(await getRun(test.db, projectId, RUN)).toMatchObject({ costUsd: 0, costKnown: false });
    });

    it("skips events that belong to no run, such as a config error", async () => {
        const projectId = await createProject(test.db, "Acme");
        const configError = {
            id: "b".repeat(16),
            event: {
                type: "config_error" as const,
                at: "2026-10-03T12:00:00.000Z",
                source: "policy" as const,
                message: "bad JSON",
            },
        };

        expect(await ingestBatch(test.db, projectId, [configError])).toBe(0);
        expect(await ingestBatch(test.db, projectId, [configError, item(started())])).toBe(1);
    });

    it("keeps runs apart per project", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await ingestBatch(test.db, one, [item(started())]);

        expect(await getRun(test.db, two, RUN)).toBeUndefined();
    });
});
