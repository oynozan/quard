import {
    CHANNELS,
    createAgentKey,
    decideApproval,
    openListener,
    recordFleetUse,
    revokeAgentKey,
    type Db,
    type Listener,
} from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ask } from "../approvals/ask.ts";
import type { ControlTiming } from "../server/timing.ts";
import {
    brokenDb,
    newConnection,
    newProject,
    readyConnection,
    testContext,
    type TestProject,
} from "../test/context.ts";
import { askMessage, DOMAIN_VALUE, fleetMessage } from "../test/messages.ts";
import { NEVER, until } from "../test/server.ts";
import type { OpenListener } from "./listen.ts";
import { startWatcher } from "./watcher.ts";

const DANA = "dana@acme.com";
const QUIET: Partial<ControlTiming> = { decisionMs: NEVER, fleetMs: NEVER, keyMs: NEVER, relistenMs: 10 };
const QUICK: Partial<ControlTiming> = { decisionMs: 20, fleetMs: 20, keyMs: 20, relistenMs: 10 };

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// Opens real LISTEN connections and keeps them, so a test can send fake notifications
function capture(listeners: Listener[]): OpenListener {
    return async (url, heard, lost) => {
        const listener = await openListener(url, heard, lost);
        listeners.push(listener);
        return listener;
    };
}

function notify(listener: Listener | undefined, channel: string, payload: string): void {
    listener?.client.emit("notification", { channel, payload });
}

async function quarantine(db: Db, projectId: string): Promise<void> {
    for (let n = 1; n <= 5; n += 1) {
        const { runId, agent, tool, blocked, values } = fleetMessage(n, [DOMAIN_VALUE]);
        await recordFleetUse(db, projectId, { runId, agent, tool, blocked, values });
    }
}

// A ready connection with one call waiting, and the request it waits on
async function waitingCall(timing: Partial<ControlTiming>) {
    const project: TestProject = await newProject(test.db);
    const ctx = testContext(test.db, { timing });
    const made = await readyConnection(ctx, project);
    await ask(ctx, made.connection, askMessage());
    return { project, ctx, ...made, requestId: String(made.socket.of("asked")[0]?.requestId) };
}

describe("notifications", () => {
    it("deliver decisions, reload quarantine lists and close revoked keys", async () => {
        const { project, ctx, socket, requestId } = await waitingCall(QUIET);
        const listeners: Listener[] = [];
        const watcher = startWatcher(ctx, test.url, capture(listeners));
        await until(() => listeners.length === 1);
        await decideApproval(test.db, project.projectId, requestId, "deny", DANA);
        await quarantine(test.db, project.projectId);
        await revokeAgentKey(test.db, project.projectId, project.keyId);

        notify(listeners[0], CHANNELS.approvals, requestId);
        await until(() => socket.of("decided").length === 1);
        notify(listeners[0], CHANNELS.fleet, project.projectId);
        await until(() => socket.of("quarantine").length === 1);
        notify(listeners[0], CHANNELS.keys, "00000000-0000-0000-0000-000000000000");
        notify(listeners[0], CHANNELS.keys, project.keyId);
        await until(() => socket.closedWith !== undefined);

        expect(socket.closedWith).toEqual({ code: 4401, reason: "agent key revoked" });
        await watcher.stop();
    });
});

describe("timers", () => {
    it("find decisions, quarantine changes and revoked keys without a notification", async () => {
        const { project, ctx, socket, requestId } = await waitingCall(QUICK);
        const watcher = startWatcher(ctx, test.url, () => new Promise<Listener>(() => {}));

        await decideApproval(test.db, project.projectId, requestId, "always", DANA);
        await until(() => socket.of("decided").length === 1);
        await quarantine(test.db, project.projectId);
        await until(() => socket.of("quarantine").length === 1);
        await revokeAgentKey(test.db, project.projectId, project.keyId);
        await until(() => socket.closedWith !== undefined);

        await watcher.stop();
    });
});

describe("after the listen connection comes back", () => {
    it("catches up on what it missed", async () => {
        const { project, ctx, socket, requestId } = await waitingCall(QUIET);
        const other = await createAgentKey(test.db, project.projectId, "other");
        const revoked = newConnection(ctx, { projectId: project.projectId, keyId: other.id });
        const listeners: Listener[] = [];
        const watcher = startWatcher(ctx, test.url, capture(listeners));
        await until(() => listeners.length === 1);
        await decideApproval(test.db, project.projectId, requestId, "deny", DANA);
        await quarantine(test.db, project.projectId);
        await revokeAgentKey(test.db, project.projectId, other.id);

        listeners[0]?.client.emit("error", new Error("terminated"));

        await until(() => socket.of("decided").length === 1 && socket.of("quarantine").length === 1);
        await until(() => revoked.socket.closedWith !== undefined);
        expect(socket.closedWith).toBeUndefined();
        expect(ctx.logs).toEqual(["control: lost the Postgres listen connection: terminated"]);
        await watcher.stop();
    });
});

describe("failures", () => {
    it("are logged", async () => {
        const db = brokenDb();
        const ctx = testContext(db, { timing: QUIET });
        const { connection } = newConnection(ctx, { keyId: "k", projectId: "p" });
        ctx.registry.ready(connection);
        ctx.registry.wait(connection, askMessage(), "apr_1");
        const listeners: Listener[] = [];
        const watcher = startWatcher(ctx, test.url, capture(listeners));
        await until(() => ctx.logs.length === 3);

        notify(listeners[0], CHANNELS.approvals, "apr_1");
        notify(listeners[0], CHANNELS.fleet, "p");
        notify(listeners[0], CHANNELS.keys, "k");
        await until(() => ctx.logs.length === 6);

        for (const name of ["the decision check", "the quarantine refresh", "the key check"]) {
            expect(ctx.logs.filter((line) => line.startsWith(`control: ${name} failed: `))).toHaveLength(2);
        }
        await watcher.stop();
        await db.destroy();
    });
});

describe("dashboard notices", () => {
    it("are ignored by control", async () => {
        const db = brokenDb();
        const ctx = testContext(db, { timing: QUIET });
        const { connection } = newConnection(ctx, { keyId: "k", projectId: "p" });
        ctx.registry.ready(connection);
        const listeners: Listener[] = [];
        const keyChecks = () => ctx.logs.filter((line) => line.startsWith("control: the key check failed: ")).length;
        const watcher = startWatcher(ctx, test.url, capture(listeners));
        await until(() => keyChecks() === 1);

        // A key check would fail on the broken database and log
        notify(listeners[0], CHANNELS.live, "k");
        notify(listeners[0], CHANNELS.keys, "k");
        await until(() => keyChecks() === 2);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(keyChecks()).toBe(2);
        await watcher.stop();
        await db.destroy();
    });
});
