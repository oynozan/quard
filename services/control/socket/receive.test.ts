import { dayCounts } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brokenDb, newConnection, newProject, readyConnection, testContext } from "../test/context.ts";
import {
    askMessage,
    countMessage,
    fleetMessage,
    helloMessage,
    IBAN_VALUE,
    lookupMessage,
    RULES,
    runCountMessage,
    uncountMessage,
} from "../test/messages.ts";
import { receive } from "./receive.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const text = (message: unknown) => JSON.stringify(message);

describe("receive", () => {
    it("routes every message once hello is done", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection, socket } = await readyConnection(ctx, project);
        const ask = askMessage();
        const count = countMessage();
        const fleet = fleetMessage(1, [IBAN_VALUE]);
        const agent = { type: "agent", agent: "billing", version: "b".repeat(16), model: "gpt-5", tools: [] };

        await receive(ctx, connection, text({ type: "rules", rules: { ...RULES, hash: "e".repeat(16) } }));
        await receive(ctx, connection, text(agent));
        await receive(ctx, connection, text(ask));
        await receive(ctx, connection, text({ type: "beat", askIds: [ask.askId] }));
        await receive(ctx, connection, text({ type: "cancel", askId: ask.askId }));
        await receive(ctx, connection, text(count));
        await receive(ctx, connection, text(uncountMessage()));
        await receive(ctx, connection, text(fleet));
        await receive(ctx, connection, text(lookupMessage()));
        await receive(ctx, connection, text(runCountMessage()));

        expect(socket.sent.map((message) => message.type)).toEqual([
            "ready",
            "asked",
            "counted",
            "fleet_result",
            "labels",
            "run_counted",
        ]);
        const stored = await test.db
            .selectFrom("sdk_connections")
            .select("rules_hash")
            .where("id", "=", connection.id)
            .executeTakeFirstOrThrow();
        expect(stored.rules_hash).toBe("e".repeat(16));
        expect(ctx.registry.requestIds()).toEqual([]);
        expect(await dayCounts(test.db, project.projectId, count.day)).toEqual([
            { tool: "payInvoice", counter: "calls", day: count.day, used: 0 },
        ]);
    });

    it("takes hello once", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection, socket } = newConnection(ctx, project);

        await receive(ctx, connection, text(helloMessage()));
        await receive(ctx, connection, text(helloMessage()));

        expect(socket.sent).toEqual([
            expect.objectContaining({ type: "ready" }),
            { type: "error", code: "duplicate_hello", message: "hello was already sent on this connection" },
        ]);
    });

    it("wants hello first", async () => {
        const ctx = testContext(test.db);
        const { connection, socket } = newConnection(ctx, { keyId: "k", projectId: "p" });
        const count = countMessage();

        await receive(ctx, connection, text(count));

        expect(socket.sent).toEqual([
            { type: "error", code: "hello_required", message: "Send hello first", id: count.id },
        ]);
    });

    it("says what is wrong with a message and keeps the connection", async () => {
        const ctx = testContext(test.db);
        const { connection, socket } = newConnection(ctx, { keyId: "k", projectId: "p" });

        await receive(ctx, connection, "not json");
        await receive(ctx, connection, text({ ...askMessage(), askId: "nope" }));

        expect(socket.sent).toEqual([
            { type: "error", code: "bad_message", message: "The message is not valid JSON" },
            { type: "error", code: "bad_message", message: expect.stringContaining("askId: "), id: "nope" },
        ]);
        expect(socket.closedWith).toBeUndefined();
    });

    it("skips messages that arrive after the socket closed", async () => {
        const ctx = testContext(test.db);
        const { connection, socket } = newConnection(ctx, { keyId: "k", projectId: "p" });
        ctx.registry.remove(connection);

        await receive(ctx, connection, text(helloMessage()));

        expect(socket.sent).toEqual([]);
    });

    it("skips messages that arrive while the socket is closing", async () => {
        const ctx = testContext(test.db);
        const { connection, socket } = newConnection(ctx, { keyId: "k", projectId: "p" });
        socket.close(1001, "control is stopping");

        await receive(ctx, connection, text(helloMessage()));

        expect(connection.greeted).toBe(false);
        expect(socket.sent).toEqual([]);
    });

    it("tells the SDK when control could not handle a message", async () => {
        const db = brokenDb();
        const ctx = testContext(db);
        const { connection, socket } = newConnection(ctx, { keyId: "k", projectId: "p" });
        connection.ready = true;
        const count = countMessage();
        const lookup = lookupMessage({ kind: "memory", print: "b".repeat(64) });
        const runCount = runCountMessage();
        const failed = "Control could not handle the message";

        await receive(ctx, connection, text(count));
        await receive(ctx, connection, text({ type: "beat", askIds: [] }));
        await receive(ctx, connection, text(lookup));
        await receive(ctx, connection, text(runCount));

        expect(socket.sent).toEqual([
            { type: "error", code: "server_error", message: failed, id: count.id },
            { type: "error", code: "server_error", message: failed },
            { type: "error", code: "server_error", message: failed, id: lookup.id },
            { type: "error", code: "server_error", message: failed, id: runCount.id },
        ]);
        expect(ctx.logs).toEqual([
            expect.stringContaining("control: a count message failed: "),
            expect.stringContaining("control: a beat message failed: "),
            expect.stringContaining("control: a lookup message failed: "),
            expect.stringContaining("control: a run_count message failed: "),
        ]);
        await db.destroy();
    });
});
