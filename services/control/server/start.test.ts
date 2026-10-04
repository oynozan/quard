import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { createAgentKey, revokeAgentKey } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openClient, refusedWith } from "../test/client.ts";
import { brokenDb, newProject, type TestProject } from "../test/context.ts";
import { KEYS } from "../test/messages.ts";
import { silentClient } from "../test/raw.ts";
import { startTestControl } from "../test/server.ts";
import { startControl } from "./start.ts";

let test: TestDb;
let project: TestProject;

beforeAll(async () => {
    test = await startTestDb();
    project = await newProject(test.db);
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

describe("startControl", () => {
    it("serves the health route next to the WebSocket", async () => {
        const control = await startTestControl(test);

        const res = await fetch(`http://127.0.0.1:${control.port}/health`);

        expect(await res.json()).toEqual({ status: "ok", service: "control" });
        await control.close();
    });

    it("refuses an upgrade without a working agent key, or on another path", async () => {
        const control = await startTestControl(test);
        const revoked = await createAgentKey(test.db, project.projectId, "old");
        await revokeAgentKey(test.db, project.projectId, revoked.id);

        expect(await refusedWith(control.port, {})).toBe(401);
        expect(await refusedWith(control.port, { authorization: `Basic ${project.key}` })).toBe(401);
        expect(await refusedWith(control.port, bearer("qk_live_nope"))).toBe(401);
        expect(await refusedWith(control.port, bearer(revoked.key))).toBe(401);
        expect(await refusedWith(control.port, bearer(project.key), "/v1/other")).toBe(404);
        await control.close();
    });

    it("drops a refused socket even when the client keeps its side open, so shutdown never waits on it", async () => {
        const control = await startTestControl(test);
        const socket = connect({ port: control.port, host: "127.0.0.1", allowHalfOpen: true });
        await new Promise((resolve) => socket.once("connect", resolve));
        const request = [
            "GET /v1/connect HTTP/1.1",
            "Host: 127.0.0.1",
            "Upgrade: websocket",
            "Connection: Upgrade",
            `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
            "Sec-WebSocket-Version: 13",
            "Authorization: Bearer qk_live_nope",
        ];
        socket.write(`${request.join("\r\n")}\r\n\r\n`);

        const response = await new Promise<string>((resolve) => socket.once("data", (data) => resolve(String(data))));

        expect(response).toMatch(/^HTTP\/1.1 401/);
        // Before the fix this waited for the client to leave
        await control.close();
        socket.destroy();
    });

    it("answers 503 when it can't check the key", async () => {
        const db = brokenDb();
        const control = await startTestControl(test, { db });

        expect(await refusedWith(control.port, bearer(project.key))).toBe(503);

        expect(control.logs).toContainEqual(expect.stringContaining("control: could not check an agent key: "));
        await control.close();
        await db.destroy();
    });

    it("fails to start on a port that is taken", async () => {
        const control = await startTestControl(test);

        await expect(startTestControl(test, { port: control.port })).rejects.toThrow(/EADDRINUSE/);

        await control.close();
    });

    it("works with its own listener, clock and log", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const control = await startControl({ db: test.db, databaseUrl: test.url, keys: KEYS, port: 0 });
        const client = await openClient(control.port, project.key);

        const ready = await client.hello();

        expect(Date.now() - Date.parse(ready.at)).toBeLessThan(5_000);
        await client.close();
        await control.close();
        error.mockRestore();
    });
});

describe("close", () => {
    it("closes every SDK connection and records it", async () => {
        const control = await startTestControl(test);
        const client = await openClient(control.port, project.key);
        await client.hello();
        const unready = await openClient(control.port, project.key);

        await control.close();

        expect(await client.closed).toEqual({ code: 1001, reason: "control is shutting down" });
        expect((await unready.closed).code).toBe(1001);
        const open = await test.db
            .selectFrom("sdk_connections")
            .select("id")
            .where("project_id", "=", project.projectId)
            .where("disconnected_at", "is", null)
            .execute();
        expect(open).toEqual([]);
    });

    it("drops a connection that does not answer the close", async () => {
        const control = await startTestControl(test, { timing: { closeMs: 50 } });
        const silent = await silentClient(control.port, project.key);
        const started = Date.now();

        await control.close();

        expect(Date.now() - started).toBeGreaterThanOrEqual(45);
        silent.destroy();
    });
});
