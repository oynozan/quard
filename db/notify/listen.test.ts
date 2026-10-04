import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { settle } from "../test/notify.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { KEEPALIVE_MS, openListener, type Notice } from "./listen.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("openListener", () => {
    it("hears every Quard channel and nothing else", async () => {
        const heard: Notice[] = [];
        const lost = vi.fn();
        const listener = await openListener(test.url, (notice) => heard.push(notice), lost);

        // PGlite delivers only to the connection that sent it, so send on the same one
        await listener.client.query("SELECT pg_notify('quard_approvals', 'apr_0123456789abcdef')");
        await listener.client.query("SELECT pg_notify('quard_fleet', 'project-1')");
        await listener.client.query("SELECT pg_notify('quard_keys', 'key-1')");
        listener.client.emit("notification", { channel: "someone_else", payload: "x" });
        listener.client.emit("notification", { channel: "quard_fleet" });
        await settle();

        expect(heard).toEqual([
            { channel: "quard_approvals", payload: "apr_0123456789abcdef" },
            { channel: "quard_fleet", payload: "project-1" },
            { channel: "quard_keys", payload: "key-1" },
            { channel: "quard_fleet", payload: "" },
        ]);
        await listener.close();
        await settle();
        expect(lost).not.toHaveBeenCalled();
    });

    it("probes an idle connection soon, so a silent drop is noticed", async () => {
        const listener = await openListener(test.url, () => undefined, vi.fn());
        const connection = (listener.client as unknown as { connection: Record<string, unknown> }).connection;

        expect(connection._keepAlive).toBe(true);
        expect(connection._keepAliveInitialDelayMillis).toBe(KEEPALIVE_MS);
        await listener.close();
    });

    it("reports a lost connection once", async () => {
        const lost = vi.fn();
        const listener = await openListener(test.url, () => undefined, lost);

        listener.client.emit("error", new Error("terminated"));
        listener.client.emit("end");

        expect(lost).toHaveBeenCalledTimes(1);
        expect(lost).toHaveBeenCalledWith(new Error("terminated"));
        await listener.close();
    });

    it("reports a connection that ends without an error", async () => {
        const lost = vi.fn();
        const listener = await openListener(test.url, () => undefined, lost);

        listener.client.emit("end");

        expect(lost).toHaveBeenCalledWith(new Error("The listen connection closed"));
        await listener.close();
    });

    it("fails to open when the database is unreachable", async () => {
        const lost = vi.fn();

        await expect(openListener("postgres://nobody@127.0.0.1:1/none", () => undefined, lost)).rejects.toThrow();
        await settle();
        expect(lost).not.toHaveBeenCalled();
    });

    it("closes the connection when LISTEN fails", async () => {
        const end = vi.spyOn(pg.Client.prototype, "end");
        vi.spyOn(pg.Client.prototype, "query").mockRejectedValueOnce(new Error("no listen"));
        const lost = vi.fn();

        await expect(openListener(test.url, () => undefined, lost)).rejects.toThrow("no listen");
        expect(end).toHaveBeenCalledTimes(1);
        await settle();
        expect(lost).not.toHaveBeenCalled();
    });
});
