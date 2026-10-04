import { startTestDb, type TestDb } from "@quard/db/testing";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openClient, wait } from "../test/client.ts";
import { newProject, type TestProject } from "../test/context.ts";
import { askMessage, countMessage, helloMessage } from "../test/messages.ts";
import { startTestControl, until } from "../test/server.ts";

let test: TestDb;
let project: TestProject;

beforeAll(async () => {
    test = await startTestDb();
    project = await newProject(test.db);
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("a connection", () => {
    it("is closed when hello does not come in time", async () => {
        const control = await startTestControl(test, { timing: { helloMs: 50 } });
        const client = await openClient(control.port, project.key);

        expect(await client.closed).toEqual({ code: 4400, reason: "hello expected" });
        await control.close();
    });

    it("stays open after hello, past the hello time", async () => {
        // Long enough for hello to arrive on a busy machine
        const control = await startTestControl(test, { timing: { helloMs: 500 } });
        const client = await openClient(control.port, project.key);

        await client.hello();
        await wait(600);

        expect(client.socket.readyState).toBe(WebSocket.OPEN);
        await client.close();
        await control.close();
    });

    it("handles its messages one at a time, in order", async () => {
        const control = await startTestControl(test);
        const client = await openClient(control.port, project.key);
        const count = countMessage({ tool: "connectionOrder" });

        client.send(helloMessage());
        client.send(count);

        expect((await client.next("ready")).type).toBe("ready");
        expect(await client.next("counted")).toEqual({ type: "counted", id: count.id, ok: true, used: [1] });
        await client.close();
        await control.close();
    });

    it("stays open after a message it can't read", async () => {
        const control = await startTestControl(test);
        const client = await openClient(control.port, project.key);

        client.send("not json");

        expect(await client.next("error")).toMatchObject({ code: "bad_message" });
        expect(client.socket.readyState).toBe(WebSocket.OPEN);
        await client.close();
        await control.close();
    });

    it("is closed for a message over 1 MB", async () => {
        const control = await startTestControl(test);
        const client = await openClient(control.port, project.key);

        client.send("x".repeat(1024 * 1024 + 1));

        expect((await client.closed).code).toBe(1009);
        await control.close();
    });

    it("stops reading a peer that floods it until its queue drains, then answers everything", async () => {
        const pause = vi.spyOn(WebSocket.prototype, "pause");
        const resume = vi.spyOn(WebSocket.prototype, "resume");
        const control = await startTestControl(test);
        const client = await openClient(control.port, project.key);
        await client.hello();
        const ids = Array.from({ length: 400 }, (_, n) => n.toString(16).padStart(16, "0"));

        for (const id of ids) {
            client.send(countMessage({ id, tool: "connectionFlood" }));
        }
        const answers = await Promise.all(ids.map((id) => client.next("counted", (message) => message.id === id)));

        expect(answers).toHaveLength(400);
        expect(pause).toHaveBeenCalled();
        expect(resume).toHaveBeenCalled();
        expect(client.socket.readyState).toBe(WebSocket.OPEN);
        pause.mockRestore();
        resume.mockRestore();
        await client.close();
        await control.close();
    });

    it("is dropped when it stops answering pings", async () => {
        const control = await startTestControl(test, { timing: { pingMs: 30 } });
        const quiet = await openClient(control.port, project.key, { autoPong: false });
        const lively = await openClient(control.port, project.key);

        expect((await quiet.closed).code).toBe(1006);
        await wait(100);

        expect(lively.socket.readyState).toBe(WebSocket.OPEN);
        await lively.close();
        await control.close();
    });

    it("records its close and keeps the rows of its waiting calls", async () => {
        const control = await startTestControl(test);
        const client = await openClient(control.port, project.key);
        await client.hello();
        const ask = askMessage({ argsHash: "f".repeat(32) });
        client.send(ask);
        await client.next("asked");

        await client.close();

        await until(async () => {
            const row = await test.db
                .selectFrom("sdk_connections")
                .select("disconnected_at")
                .where("project_id", "=", project.projectId)
                .where("disconnected_at", "is", null)
                .executeTakeFirst();
            return row === undefined;
        });
        const waiter = await test.db
            .selectFrom("approval_waiters")
            .select("done_at")
            .where("ask_id", "=", ask.askId)
            .executeTakeFirstOrThrow();
        expect(waiter.done_at).toBeNull();
        await control.close();
    });
});
