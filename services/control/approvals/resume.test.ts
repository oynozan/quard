import { addWaiter, claimOnce, decideApproval, openApprovalRequest } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import type { ApprovalAnswer, AskMessage } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../server/context.ts";
import { newProject, readyConnection, testContext, type TestProject } from "../test/context.ts";
import { askMessage, KEYS } from "../test/messages.ts";
import { ask } from "./ask.ts";
import { requestInput, waiterInput } from "./input.ts";

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
    return hashes.toString(16).padStart(32, "a");
}

async function setup() {
    const project = await newProject(test.db);
    return { project, ctx: testContext(test.db) };
}

// The call asks, then its connection drops before the SDK reads "asked",
// so the SDK never learns the request id
async function lostAsk(ctx: Context, project: TestProject, message: AskMessage): Promise<string> {
    const { connection, socket } = await readyConnection(ctx, project);
    await ask(ctx, connection, message);
    ctx.registry.remove(connection);
    return String(socket.of("asked")[0]?.requestId);
}

async function openIds(projectId: string): Promise<string[]> {
    const rows = await test.db
        .selectFrom("approval_requests")
        .select("id")
        .where("project_id", "=", projectId)
        .where("answer", "is", null)
        .execute();
    return rows.map((row) => row.id);
}

describe("an ask sent again after a reconnect, without the request id", () => {
    it.each(["deny", "always", "once"] as ApprovalAnswer[])("hears a %s given while it was away", async (answer) => {
        const { project, ctx } = await setup();
        const message = askMessage({ argsHash: freshHash() });
        const requestId = await lostAsk(ctx, project, message);
        await decideApproval(test.db, project.projectId, requestId, answer, DANA);
        const back = await readyConnection(ctx, project);

        await ask(ctx, back.connection, message);

        expect(back.socket.of("decided")).toEqual([{ type: "decided", askId: message.askId, answer, requestId }]);
        expect(back.socket.of("asked")).toEqual([]);
        expect(await openIds(project.projectId)).toEqual([]);
    });

    it("waits again on its request while it is open", async () => {
        const { project, ctx } = await setup();
        const message = askMessage({ argsHash: freshHash() });
        const requestId = await lostAsk(ctx, project, message);
        const back = await readyConnection(ctx, project);

        await ask(ctx, back.connection, message);

        expect(back.socket.of("asked")).toEqual([{ type: "asked", askId: message.askId, requestId }]);
        expect(ctx.registry.waiting(project.projectId, requestId).map((waiter) => waiter.connection)).toEqual([
            back.connection,
        ]);
    });

    it("follows control's record over an older request id the SDK sends", async () => {
        const { project, ctx } = await setup();
        const message = askMessage({ argsHash: freshHash() });
        const first = await lostAsk(ctx, project, message);
        await decideApproval(test.db, project.projectId, first, "once", DANA);
        const call = { agent: message.agent, tool: message.tool, argsHash: message.argsHash };
        await claimOnce(test.db, project.projectId, { ...call, askId: "7".repeat(16) });
        // Control asked the call again on a new request, which the SDK never heard of
        const input = requestInput(message, KEYS.redactor(project.projectId));
        const { id: second } = await openApprovalRequest(test.db, project.projectId, input);
        await addWaiter(test.db, project.projectId, waiterInput(message, second));
        await decideApproval(test.db, project.projectId, second, "deny", DANA);
        const back = await readyConnection(ctx, project);

        await ask(ctx, back.connection, { ...message, requestId: first });

        expect(back.socket.of("decided")).toEqual([
            { type: "decided", askId: message.askId, answer: "deny", requestId: second },
        ]);
        expect(await openIds(project.projectId)).toEqual([]);
    });
});
