import { claimOnce, claimRequest, decideApproval, decidedRequests, getApprovalRequest } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { APPROVAL_STALE_MS, type ApprovalAnswer, type AskMessage } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { brokenDb, newConnection, newProject, readyConnection, testContext } from "../test/context.ts";
import { askMessage, REDACTOR } from "../test/messages.ts";
import { ask, beat } from "./ask.ts";
import { createDelivery } from "./deliver.ts";

const DANA = "dana@acme.com";

let test: TestDb;
let hashes = 0;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// Arguments no other test uses, so each test has its own requests
function freshHash(): string {
    hashes += 1;
    return hashes.toString(16).padStart(32, "0");
}

// `count` calls with the same arguments, each on its own connection, all waiting on one request
async function waitingCalls(ctx: Context, projectId: string, count: number) {
    const argsHash = freshHash();
    const calls = [];
    for (let n = 0; n < count; n += 1) {
        const made = await readyConnection(ctx, { projectId, keyId: (await keyOf(projectId)).id });
        const message = askMessage({ argsHash });
        await ask(ctx, made.connection, message);
        calls.push({ ...made, message });
    }
    const requestId = String(calls[0]?.socket.of("asked")[0]?.requestId);
    return { calls, requestId, argsHash };
}

function keyOf(projectId: string) {
    return test.db.selectFrom("agent_keys").select("id").where("project_id", "=", projectId).executeTakeFirstOrThrow();
}

function waiterRow(askId: string) {
    return test.db.selectFrom("approval_waiters").selectAll().where("ask_id", "=", askId).executeTakeFirstOrThrow();
}

async function setup() {
    const project = await newProject(test.db);
    const clock = { now: Date.now() };
    const ctx = testContext(test.db, { now: () => new Date(clock.now) });
    return { project, ctx, clock, delivery: createDelivery(ctx) };
}

function beatOf(ctx: Context, call: { connection: Connection; message: AskMessage }) {
    return beat(ctx, call.connection, { type: "beat", askIds: [call.message.askId] });
}

describe("delivery of deny and always approve", () => {
    it.each(["deny", "always"] as ApprovalAnswer[])("tells every waiting call about a %s", async (answer) => {
        const { project, ctx, delivery } = await setup();
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 2);
        await decideApproval(test.db, project.projectId, requestId, answer, DANA);

        await delivery.check();

        for (const call of calls) {
            expect(call.socket.of("decided")).toEqual([
                { type: "decided", askId: call.message.askId, answer, requestId },
            ]);
            expect(await waiterRow(call.message.askId)).toMatchObject({ done_at: expect.any(Date) });
        }
        expect(ctx.registry.requestIds()).toEqual([]);
    });

    it("leaves calls alone while the request is open", async () => {
        const { project, ctx, delivery } = await setup();
        const { calls } = await waitingCalls(ctx, project.projectId, 1);

        await delivery.check();

        expect(calls[0]?.socket.of("decided")).toEqual([]);
    });
});

describe("delivery of approve once", () => {
    it("runs the oldest call and asks the others again", async () => {
        const { project, ctx, delivery } = await setup();
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 3);
        const [first, second, third] = calls;
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);

        await delivery.check();

        expect(first?.socket.of("decided")).toEqual([
            { type: "decided", askId: first?.message.askId, answer: "once", requestId },
        ]);
        const next = second?.socket.of("asked")[1]?.requestId;
        expect(next).toMatch(/^apr_/);
        expect(next).not.toBe(requestId);
        expect(third?.socket.of("asked")[1]?.requestId).toBe(next);
        expect(await getApprovalRequest(test.db, project.projectId, requestId)).toMatchObject({
            usedBy: first?.message.askId,
        });
        expect(await waiterRow(String(second?.message.askId))).toMatchObject({ request_id: next, done_at: null });
        expect(ctx.registry.waiting(project.projectId, String(next))).toHaveLength(2);
    });

    it("asks everyone again when another call already ran it", async () => {
        const { project, ctx, delivery } = await setup();
        const { calls, requestId, argsHash } = await waitingCalls(ctx, project.projectId, 1);
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        const call = { agent: "billing", tool: "payInvoice", argsHash };
        await claimOnce(test.db, project.projectId, { ...call, askId: "7".repeat(16) });

        await delivery.check();

        expect(calls[0]?.socket.of("decided")).toEqual([]);
        expect(calls[0]?.socket.of("asked")[1]?.requestId).not.toBe(requestId);
    });

    it("gives it to the call that already holds it", async () => {
        const { project, ctx, delivery } = await setup();
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 2);
        const [oldest, holder] = calls;
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        await claimRequest(test.db, project.projectId, requestId, String(holder?.message.askId));

        await delivery.check();

        expect(holder?.socket.of("decided")).toHaveLength(1);
        expect(oldest?.socket.of("decided")).toEqual([]);
        expect(oldest?.socket.of("asked")).toHaveLength(2);
    });

    it("skips a call that stopped waiting during the delivery", async () => {
        const { project, ctx, delivery } = await setup();
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 3);
        const [first, second, third] = calls;
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        const [decision] = await decidedRequests(test.db, [requestId]);

        const delivering = delivery.deliver(decision!);
        ctx.registry.drop(project.projectId, String(second?.message.askId));
        await delivering;

        expect(first?.socket.of("decided")).toHaveLength(1);
        expect(second?.socket.of("asked")).toHaveLength(1);
        expect(second?.socket.of("decided")).toEqual([]);
        expect(third?.socket.of("asked")).toHaveLength(2);
    });

    it("does not ask again for a call that stopped waiting meanwhile", async () => {
        const project = await newProject(test.db);
        // The call to drop while it asks again, in the middle of opening its new request
        const dropping: { ask?: AskMessage } = {};
        const ctx: Context = testContext(test.db, {
            redactor: {
                ...REDACTOR,
                value: (value) => {
                    if (dropping.ask !== undefined) {
                        ctx.registry.drop(project.projectId, dropping.ask.askId);
                    }
                    return REDACTOR.value(value);
                },
            },
        });
        const delivery = createDelivery(ctx);
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 2);
        const [first, second] = calls;
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        dropping.ask = second?.message;

        await delivery.check();

        expect(first?.socket.of("decided")).toHaveLength(1);
        expect(second?.socket.of("asked")).toHaveLength(1);
        expect(ctx.registry.requestIds()).toEqual([]);
    });

    it("skips calls that stopped beating, which wait until they beat again", async () => {
        const { project, ctx, clock, delivery } = await setup();
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 3);
        const [gone, alive, late] = calls;
        clock.now += APPROVAL_STALE_MS + 1;
        await beatOf(ctx, alive!);
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);

        await delivery.check();

        expect(alive?.socket.of("decided")).toEqual([
            { type: "decided", askId: alive?.message.askId, answer: "once", requestId },
        ]);
        expect(gone?.socket.of("decided")).toEqual([]);
        expect(gone?.socket.of("asked")).toHaveLength(1);
        const left = ctx.registry.waiting(project.projectId, requestId).map((waiter) => waiter.ask);
        expect(left).toEqual([gone?.message, late?.message]);

        await beatOf(ctx, gone!);
        await delivery.check();

        expect(gone?.socket.of("decided")).toEqual([]);
        expect(gone?.socket.of("asked")).toHaveLength(2);
    });

    it("keeps an approve once for the next identical call when every waiting call stopped beating", async () => {
        const { project, ctx, clock, delivery } = await setup();
        const { calls, requestId, argsHash } = await waitingCalls(ctx, project.projectId, 1);
        clock.now += APPROVAL_STALE_MS + 1;
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);

        await delivery.check();
        const next = await readyConnection(ctx, project);
        const message = askMessage({ argsHash });
        await ask(ctx, next.connection, message);

        expect(calls[0]?.socket.of("decided")).toEqual([]);
        expect(next.socket.of("decided")).toEqual([
            { type: "decided", askId: message.askId, answer: "once", requestId },
        ]);
    });

    it("delivers one decision once, even when asked twice at the same time", async () => {
        const { project, ctx, delivery } = await setup();
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 1);
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);
        const decision = { projectId: project.projectId, id: requestId, answer: "once" as const, usedBy: null };

        await Promise.all([delivery.deliver(decision), delivery.deliver(decision)]);

        expect(calls[0]?.socket.of("decided")).toHaveLength(1);
    });
});

describe("notifications and failures", () => {
    it("deliver the decision a notification names", async () => {
        const { project, ctx, delivery } = await setup();
        const { calls, requestId } = await waitingCalls(ctx, project.projectId, 1);
        await decideApproval(test.db, project.projectId, requestId, "deny", DANA);

        await delivery.heard(`apr_${"f".repeat(16)}`);
        expect(calls[0]?.socket.of("decided")).toEqual([]);
        await delivery.heard(requestId);

        expect(calls[0]?.socket.of("decided")).toHaveLength(1);
    });

    it("log a decision that could not be delivered", async () => {
        const db = brokenDb();
        const ctx = testContext(db);
        const delivery = createDelivery(ctx);
        const { connection, socket } = newConnection(ctx, { keyId: "k", projectId: "p" });
        ctx.registry.wait(connection, askMessage(), "apr_1");

        await delivery.deliver({ projectId: "p", id: "apr_1", answer: "deny", usedBy: null });
        await delivery.deliver({ projectId: "p", id: "apr_2", answer: "always", usedBy: null });

        expect(socket.of("decided")).toHaveLength(1);
        expect(ctx.logs).toEqual([expect.stringContaining("control: could not deliver the decision on apr_1: ")]);
        await expect(delivery.check()).resolves.toBeUndefined();
        await db.destroy();
    });
});
