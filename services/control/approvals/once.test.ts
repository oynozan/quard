import { decideApproval, getApprovalRequest } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import type { AskMessage } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../server/context.ts";
import { newProject, readyConnection, testContext, type TestProject } from "../test/context.ts";
import { askMessage } from "../test/messages.ts";
import { ask } from "./ask.ts";

// An approve once belongs to the call that waits longest on its request,
// as long as that call still beats

const DANA = "dana@acme.com";
// Far older than the stale limit
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");

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
    return hashes.toString(16).padStart(32, "b");
}

async function setup() {
    const project = await newProject(test.db);
    return { project, ctx: testContext(test.db) };
}

// A call that asks on its own connection. Its request id is in `asked`.
async function asking(ctx: Context, project: TestProject, message: AskMessage) {
    const made = await readyConnection(ctx, project);
    await ask(ctx, made.connection, message);
    return { ...made, message, asked: () => made.socket.of("asked"), decided: () => made.socket.of("decided") };
}

// The call stopped beating long ago, so the dashboard shows it as no longer waiting
async function stopBeating(askId: string): Promise<void> {
    await test.db.updateTable("approval_waiters").set({ last_beat_at: LONG_AGO }).where("ask_id", "=", askId).execute();
}

describe("an approve once given while the call that asked still beats", () => {
    it("stays with that call while a new identical call asks", async () => {
        const { project, ctx } = await setup();
        const message = askMessage({ argsHash: freshHash() });
        const first = await asking(ctx, project, message);
        const requestId = String(first.asked()[0]?.requestId);
        // Its connection drops, and it is still alive on the dashboard
        ctx.registry.remove(first.connection);
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);

        const other = await asking(ctx, project, askMessage({ argsHash: message.argsHash }));
        expect(other.decided()).toEqual([]);
        expect(other.asked()[0]?.requestId).not.toBe(requestId);

        const back = await asking(ctx, project, message);
        expect(back.decided()).toEqual([{ type: "decided", askId: message.askId, answer: "once", requestId }]);
        expect(await getApprovalRequest(test.db, project.projectId, requestId)).toMatchObject({
            usedBy: message.askId,
        });
    });

    it("goes to the next identical call once that call stopped beating", async () => {
        const { project, ctx } = await setup();
        const first = await asking(ctx, project, askMessage({ argsHash: freshHash() }));
        const requestId = String(first.asked()[0]?.requestId);
        ctx.registry.remove(first.connection);
        await stopBeating(first.message.askId);
        await decideApproval(test.db, project.projectId, requestId, "once", DANA);

        const next = await asking(ctx, project, askMessage({ argsHash: first.message.argsHash }));

        expect(next.decided()).toEqual([{ type: "decided", askId: next.message.askId, answer: "once", requestId }]);
    });
});
