import { CHANNELS, createAgentKey, decideApproval, revokeAgentKey } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openClient } from "../test/client.ts";
import { newProject } from "../test/context.ts";
import { askMessage, countMessage, fleetMessage, IBAN_VALUE } from "../test/messages.ts";
import { NEVER, startTestControl } from "../test/server.ts";

const DANA = "dana@acme.com";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("the protocol over a real WebSocket", () => {
    it("gets the dashboard's answer to a waiting call within the one-second check", async () => {
        const project = await newProject(test.db);
        const control = await startTestControl(test, { timing: { decisionMs: 1_000 } });
        const client = await openClient(control.port, project.key);
        const ready = await client.hello();
        const ask = askMessage();

        client.send(ask);
        const asked = await client.next("asked");
        const decidedAt = Date.now();
        await decideApproval(test.db, project.projectId, asked.requestId, "once", DANA);
        const decided = await client.next("decided");

        expect(ready).toMatchObject({ type: "ready", quarantine: [], fleetObserveUntil: null, counters: [] });
        expect(decided).toEqual({ type: "decided", askId: ask.askId, answer: "once", requestId: asked.requestId });
        expect(Date.now() - decidedAt).toBeLessThan(1_500);
        await client.close();
        await control.close();
    });

    it("hears a decision at once through a notification", async () => {
        const project = await newProject(test.db);
        const control = await startTestControl(test, { timing: { decisionMs: NEVER } });
        const client = await openClient(control.port, project.key);
        await client.hello();
        const ask = askMessage();
        client.send(ask);
        const asked = await client.next("asked");

        await decideApproval(test.db, project.projectId, asked.requestId, "deny", DANA);
        control.listeners[0]?.client.emit("notification", { channel: CHANNELS.approvals, payload: asked.requestId });

        expect(await client.next("decided")).toEqual({
            type: "decided",
            askId: ask.askId,
            answer: "deny",
            requestId: asked.requestId,
        });
        await client.close();
        await control.close();
    });

    it("counts per day and runs the fleet check for every SDK in the project", async () => {
        const project = await newProject(test.db);
        const control = await startTestControl(test);
        const caller = await openClient(control.port, project.key);
        const peer = await openClient(control.port, project.key);
        await caller.hello();
        await peer.hello();
        const count = countMessage({ counts: [{ counter: "calls", add: 1, max: 10 }] });

        caller.send(count);
        for (let n = 1; n <= 5; n += 1) {
            caller.send(fleetMessage(n, [IBAN_VALUE]));
        }

        expect(await caller.next("counted")).toEqual({ type: "counted", id: count.id, ok: true, used: [1] });
        const results = [];
        for (let n = 1; n <= 5; n += 1) {
            results.push(await caller.next("fleet_result"));
        }
        const entry = { key: IBAN_VALUE.key, observe: true };
        expect(results.at(-1)?.quarantined).toEqual([entry]);
        expect(await peer.next("quarantine")).toEqual({ type: "quarantine", add: [entry], remove: [] });
        await caller.close();
        await peer.close();
        await control.close();
    });

    it("closes the connections of a revoked key", async () => {
        const project = await newProject(test.db);
        const key = await createAgentKey(test.db, project.projectId, "short-lived");
        const control = await startTestControl(test);
        const client = await openClient(control.port, key.key);
        await client.hello();

        await revokeAgentKey(test.db, project.projectId, key.id);

        expect(await client.closed).toEqual({ code: 4401, reason: "agent key revoked" });
        await control.close();
    });
});
