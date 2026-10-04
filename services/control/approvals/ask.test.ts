import { claimOnce, decideApproval, getApprovalRequest } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { CUT, type ApprovalAnswer } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Context } from "../server/context.ts";
import { CONNECTION_LIMITS } from "../socket/limits.ts";
import { failingUpdates, newProject, readyConnection, testContext, type TestProject } from "../test/context.ts";
import { askMessage, HASH, IBAN, RULES } from "../test/messages.ts";
import { ask, beat, cancel } from "./ask.ts";

const DANA = "dana@acme.com";
// Far older than the stale limit
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

async function setup() {
    const project = await newProject(test.db);
    const ctx = testContext(test.db);
    return { project, ctx, ...(await readyConnection(ctx, project)) };
}

// Opens a request for a payInvoice call that then leaves: its connection closes
// and its beats stop. Returns the request id.
async function leftRequest(ctx: Context, project: TestProject, argsHash = HASH): Promise<string> {
    const { connection, socket } = await readyConnection(ctx, project);
    const message = askMessage({ argsHash });
    await ask(ctx, connection, message);
    ctx.registry.remove(connection);
    await test.db
        .updateTable("approval_waiters")
        .set({ last_beat_at: LONG_AGO })
        .where("ask_id", "=", message.askId)
        .execute();
    return String(socket.of("asked")[0]?.requestId);
}

function waiterRow(projectId: string, askId: string) {
    return test.db
        .selectFrom("approval_waiters")
        .selectAll()
        .where("project_id", "=", projectId)
        .where("ask_id", "=", askId)
        .executeTakeFirstOrThrow();
}

describe("ask", () => {
    it("opens a request, redacted by its project's redactor, and waits on it", async () => {
        const { project, ctx, connection, socket } = await setup();
        const message = askMessage();
        const redactor = vi.spyOn(ctx.keys, "redactor");

        await ask(ctx, connection, message);

        const [asked] = socket.of("asked");
        expect(asked).toEqual({ type: "asked", askId: message.askId, requestId: expect.stringMatching(/^apr_/) });
        const request = await getApprovalRequest(test.db, project.projectId, String(asked?.requestId));
        expect(request).toMatchObject({
            runId: message.runId,
            stepId: message.stepId,
            agent: "billing",
            tool: "payInvoice",
            argsHash: HASH,
            args: { iban: IBAN, amount: 4950, apiKey: CUT },
            masked: { iban: "DE89…3000", amount: 4950, apiKey: CUT },
            labels: message.labels,
            context: message.context,
            reasons: message.reasons,
            rulesHash: RULES.hash,
            answer: null,
        });
        expect(await waiterRow(project.projectId, message.askId)).toMatchObject({
            request_id: asked?.requestId,
            done_at: null,
        });
        expect(ctx.registry.waiting(project.projectId, String(asked?.requestId))).toHaveLength(1);
        expect(redactor).toHaveBeenCalledWith(project.projectId);
    });

    it("lets an identical call wait on the same open request", async () => {
        const { project, ctx, connection, socket } = await setup();
        const other = await readyConnection(ctx, project);

        await ask(ctx, connection, askMessage());
        await ask(ctx, other.connection, askMessage({ rules: undefined }));

        const requestId = socket.of("asked")[0]?.requestId;
        expect(other.socket.of("asked")[0]?.requestId).toBe(requestId);
        expect(ctx.registry.waiting(project.projectId, String(requestId))).toHaveLength(2);
    });

    it("stores no rules hash when the call sent none", async () => {
        const { project, ctx, connection, socket } = await setup();

        await ask(ctx, connection, askMessage({ rules: undefined, argsHash: "e".repeat(32) }));

        const request = await getApprovalRequest(test.db, project.projectId, String(socket.of("asked")[0]?.requestId));
        expect(request?.rulesHash).toBeNull();
    });

    it("passes at once on an always approve", async () => {
        const { project, ctx, connection, socket } = await setup();
        const requestId = await leftRequest(ctx, project);
        await decideApproval(test.db, project.projectId, requestId, "always", DANA);
        const message = askMessage();

        await ask(ctx, connection, message);

        const grant = await test.db
            .selectFrom("approval_grants")
            .select(["id", "times_used"])
            .where("project_id", "=", project.projectId)
            .executeTakeFirstOrThrow();
        expect(socket.of("decided")).toEqual([
            { type: "decided", askId: message.askId, answer: "always", grantId: grant.id },
        ]);
        expect(grant.times_used).toBe(1);
        expect(socket.of("asked")).toEqual([]);
    });

    it("sends the answer even when noting it fails", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(failingUpdates(test.db, "approval_waiters"));
        const { connection, socket } = await readyConnection(ctx, project);
        const requestId = await leftRequest(ctx, project, "a1".repeat(16));
        await decideApproval(test.db, project.projectId, requestId, "always", DANA);
        const message = askMessage({ argsHash: "a1".repeat(16) });

        await expect(ask(ctx, connection, message)).rejects.toThrow("updates of approval_waiters fail");

        expect(socket.of("decided")).toEqual([
            { type: "decided", askId: message.askId, answer: "always", grantId: expect.stringMatching(/^grt_/) },
        ]);
    });

    it("refuses a new call when too many wait on its connection, but takes one asked again", async () => {
        const { project, ctx, connection, socket } = await setup();
        const message = askMessage({ argsHash: "e2".repeat(16) });
        await ask(ctx, connection, message);
        for (let n = 1; n < CONNECTION_LIMITS.waiters; n += 1) {
            ctx.registry.wait(connection, askMessage(), "apr_full");
        }
        const extra = askMessage({ argsHash: "e3".repeat(16) });

        await ask(ctx, connection, extra);
        await ask(ctx, connection, message);

        expect(socket.of("error")).toEqual([
            { type: "error", code: "too_many_waiters", message: expect.any(String), id: extra.askId },
        ]);
        expect(socket.of("asked").map((asked) => asked.askId)).toEqual([message.askId, message.askId]);
        expect(await waiterRow(project.projectId, extra.askId).catch(() => undefined)).toBeUndefined();
    });

    it("runs an approve once that came after the waiting call left", async () => {
        const { project, ctx, connection, socket } = await setup();
        const requestId = await leftRequest(ctx, project);
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        const message = askMessage();

        await ask(ctx, connection, message);

        expect(socket.of("decided")).toEqual([{ type: "decided", askId: message.askId, answer: "once", requestId }]);
        expect(await getApprovalRequest(test.db, project.projectId, requestId)).toMatchObject({
            usedBy: message.askId,
        });
    });
});

describe("ask after a reconnect", () => {
    it("waits again on a request that is still open", async () => {
        const { project, ctx, connection, socket } = await setup();
        const before = await readyConnection(ctx, project);
        const message = askMessage();
        await ask(ctx, before.connection, message);
        const requestId = String(before.socket.of("asked")[0]?.requestId);
        ctx.registry.remove(before.connection);

        await ask(ctx, connection, { ...message, requestId });

        expect(socket.of("asked")).toEqual([{ type: "asked", askId: message.askId, requestId }]);
        expect(ctx.registry.waiting(project.projectId, requestId).map((waiter) => waiter.connection)).toEqual([
            connection,
        ]);
    });

    it.each(["deny", "always"] as ApprovalAnswer[])("hears a %s given while it was away", async (answer) => {
        const { project, ctx, connection, socket } = await setup();
        const message = askMessage({ argsHash: answer === "deny" ? "a".repeat(32) : "b".repeat(32) });
        const requestId = await leftRequest(ctx, project, message.argsHash);
        await decideApproval(test.db, project.projectId, requestId, answer, DANA);

        await ask(ctx, connection, { ...message, requestId });

        expect(socket.of("decided")).toEqual([{ type: "decided", askId: message.askId, answer, requestId }]);
    });

    it("runs an approve once given while it was away, also when asked twice", async () => {
        const { project, ctx, connection, socket } = await setup();
        const requestId = await leftRequest(ctx, project, "9".repeat(32));
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        const message = askMessage({ argsHash: "9".repeat(32), requestId });

        await ask(ctx, connection, message);
        await ask(ctx, connection, message);

        expect(socket.of("decided")).toEqual([
            { type: "decided", askId: message.askId, answer: "once", requestId },
            { type: "decided", askId: message.askId, answer: "once", requestId },
        ]);
        expect(await waiterRow(project.projectId, message.askId).catch(() => undefined)).toBeUndefined();
    });

    it("asks afresh when another call ran the approve once", async () => {
        const { project, ctx, connection, socket } = await setup();
        const argsHash = "8".repeat(32);
        const requestId = await leftRequest(ctx, project, argsHash);
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        const call = { agent: "billing", tool: "payInvoice", argsHash };
        await claimOnce(test.db, project.projectId, { ...call, askId: "7".repeat(16) });
        const message = askMessage({ argsHash, requestId });

        await ask(ctx, connection, message);

        const [asked] = socket.of("asked");
        expect(asked?.requestId).toMatch(/^apr_/);
        expect(asked?.requestId).not.toBe(requestId);
        expect(await waiterRow(project.projectId, message.askId)).toMatchObject({ request_id: asked?.requestId });
    });

    it("asks afresh with the id of another call's request or an unknown one", async () => {
        const { project, ctx, connection, socket } = await setup();
        const requestId = await leftRequest(ctx, project, "6".repeat(32));
        await decideApproval(test.db, project.projectId, requestId, "always", DANA);

        await ask(ctx, connection, askMessage({ argsHash: "5".repeat(32), requestId }));
        await ask(ctx, connection, askMessage({ argsHash: "4".repeat(32), requestId: `apr_${"0".repeat(16)}` }));

        expect(socket.of("decided")).toEqual([]);
        expect(socket.of("asked")).toHaveLength(2);
    });
});

describe("beat and cancel", () => {
    it("note that a call is still waiting", async () => {
        const { project, ctx, connection } = await setup();
        const message = askMessage({ argsHash: "3".repeat(32) });
        await ask(ctx, connection, message);
        const old = new Date("2026-01-01T00:00:00.000Z");
        await test.db
            .updateTable("approval_waiters")
            .set({ last_beat_at: old })
            .where("ask_id", "=", message.askId)
            .execute();

        await beat(ctx, connection, { type: "beat", askIds: [message.askId] });

        expect((await waiterRow(project.projectId, message.askId)).last_beat_at.getTime()).toBeGreaterThan(
            old.getTime(),
        );
    });

    it("stop a call from waiting", async () => {
        const { project, ctx, connection, socket } = await setup();
        const message = askMessage({ argsHash: "2".repeat(32) });
        await ask(ctx, connection, message);

        await cancel(ctx, connection, { type: "cancel", askId: message.askId });

        expect(await waiterRow(project.projectId, message.askId)).toMatchObject({ done_at: expect.any(Date) });
        expect(ctx.registry.requestIds()).not.toContain(socket.of("asked")[0]?.requestId);
    });
});
