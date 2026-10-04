import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import {
    decideApproval,
    getApprovalRequest,
    listDecidedRequests,
    listGrants,
    listOpenRequests,
    revokeGrant,
    type OpenApprovalItem,
} from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, isGuardRefusal, quard, type RunEvent } from "../../../packages/sdk/index.ts";
import { resetAll } from "../../../packages/sdk/test/reset.ts";
import { CONTROL_TIMING } from "../server/timing.ts";
import { newProject, type TestProject } from "../test/context.ts";
import { only, startTestControl, type TestControl } from "../test/server.ts";

// The M3 acceptance test with the real SDK, control on a free port and PGlite

const DANA = "dana@acme.com";
const INVOICE = { iban: "DE89370400440532013000", amount: 4950 };
const APP = join(import.meta.dirname, "..", "test", "waiting-app.ts");
const WAIT = { timeout: 10_000, interval: 20 };
// Far older than the stale limit
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");

type Invoice = typeof INVOICE;

let test: TestDb;
let control: TestControl;
let project: TestProject;
let events: RunEvent[] = [];
let app: ChildProcess | undefined;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

// Control with its shipped timings, so answers come through the one-second check
beforeEach(async () => {
    project = await newProject(test.db);
    control = await startTestControl(test, { timing: CONTROL_TIMING });
    events = [];
});

afterEach(async () => {
    app?.kill("SIGKILL");
    app = undefined;
    resetAll();
    await control.close();
});

afterAll(async () => {
    await test.stop();
});

function controlUrl(): string {
    return `http://127.0.0.1:${control.port}`;
}

// This process's SDK, set up the way an app with an agent key sets it up
function linkSdk(): void {
    quard.configure({
        key: project.key,
        controlUrl: controlUrl(),
        onEvent: (event) => events.push(event),
    });
}

// Another app process that asks about the same payInvoice call
function startApp(): ChildProcess {
    const env = {
        ...process.env,
        QUARD_TEST_KEY: project.key,
        QUARD_TEST_CONTROL_URL: controlUrl(),
        QUARD_TEST_INVOICE: JSON.stringify(INVOICE),
    };
    return spawn(process.execPath, [APP], { env, stdio: ["ignore", "ignore", "inherit"] });
}

// The open request as the approvals page lists it, once a call waits on it
function waitingRequest(): Promise<OpenApprovalItem> {
    return vi.waitFor(async () => {
        const [request] = await listOpenRequests(test.db, project.projectId);
        if (request === undefined || request.waiters.length === 0) {
            throw new Error("no call waits yet");
        }
        return request;
    }, WAIT);
}

// The process ids of the SDKs connected to control now
async function connectedPids(): Promise<number[]> {
    const rows = await test.db
        .selectFrom("sdk_connections")
        .select("pid")
        .where("project_id", "=", project.projectId)
        .where("disconnected_at", "is", null)
        .execute();
    return rows.map((row) => row.pid);
}

// The rules control stored for each SDK connected now
function connectedRules() {
    return test.db
        .selectFrom("sdk_connections as c")
        .innerJoin("rule_sets as r", (join) =>
            join.onRef("r.project_id", "=", "c.project_id").onRef("r.hash", "=", "c.rules_hash"),
        )
        .select(["r.hash", "r.rules"])
        .where("c.project_id", "=", project.projectId)
        .where("c.disconnected_at", "is", null)
        .execute();
}

function approvalDecisions(): RunEvent[] {
    return events.filter((event) => event.type === "decision" && event.guard === "approval");
}

function payTool() {
    const rawPay = vi.fn(async (input: Invoice) => `paid ${input.amount} to ${input.iban}`);
    const payInvoice = guard(rawPay, { type: "approval", name: "payInvoice" });
    return { rawPay, pay: () => quard.run({ agent: "billing" }, () => payInvoice({ ...INVOICE })) };
}

describe("approvals from the dashboard", { timeout: 30_000 }, () => {
    it("pauses payInvoice until an approver approves it, then runs it with exactly the approved arguments", async () => {
        linkSdk();
        const { rawPay, pay } = payTool();

        const out = pay();
        const request = await waitingRequest();
        expect(rawPay).not.toHaveBeenCalled();
        expect(request).toMatchObject({ agent: "billing", tool: "payInvoice", args: INVOICE });
        expect(await decideApproval(test.db, project.projectId, request.id, "once", DANA)).toBe("decided");

        expect(await out).toBe(`paid 4950 to ${INVOICE.iban}`);
        expect(rawPay.mock.calls).toEqual([[request.args]]);
        expect(await getApprovalRequest(test.db, project.projectId, request.id)).toMatchObject({
            answer: "once",
            decidedBy: DANA,
            args: null,
            usedBy: only(request.waiters).askId,
        });
        expect(approvalDecisions().at(-1)).toMatchObject({
            rule: "human",
            decision: "allow",
            request: request.id,
            rules: request.rulesHash,
        });
        // The run limits come first, for the whole run, in observe mode
        const runLimits = ["max-depth", "max-fan-out", "max-loops", "max-steps", "max-cost"].map((name) => ({
            tool: "*",
            guard: "limit",
            rule: name,
            mode: "observe",
        }));
        const rule = { tool: "payInvoice", guard: "approval", rule: "approval", mode: "block" };
        expect(await connectedRules()).toEqual([{ hash: request.rulesHash, rules: [...runLimits, rule] }]);
    });

    it("passes identical calls on an always approve, and asks again once it is revoked", async () => {
        linkSdk();
        const { rawPay, pay } = payTool();

        const first = pay();
        const request = await waitingRequest();
        await decideApproval(test.db, project.projectId, request.id, "always", DANA);
        expect(await first).toBe(`paid 4950 to ${INVOICE.iban}`);

        expect(await pay()).toBe(`paid 4950 to ${INVOICE.iban}`);
        const grant = only(await listGrants(test.db, project.projectId));
        expect(grant).toMatchObject({ requestId: request.id, approvedBy: DANA, timesUsed: 1, revokedAt: null });
        expect(await listOpenRequests(test.db, project.projectId)).toEqual([]);
        expect(approvalDecisions().at(-1)).toMatchObject({ rule: "always-approved", decision: "allow" });

        expect(await revokeGrant(test.db, project.projectId, grant.id, DANA)).toBe(true);
        const third = pay();
        const again = await waitingRequest();
        expect(again.id).not.toBe(request.id);
        await decideApproval(test.db, project.projectId, again.id, "once", DANA);

        expect(await third).toBe(`paid 4950 to ${INVOICE.iban}`);
        expect(rawPay.mock.calls).toEqual([[INVOICE], [INVOICE], [INVOICE]]);
        expect(await listDecidedRequests(test.db, project.projectId)).toHaveLength(2);
    });

    it("refuses a denied call, and the tool never runs", async () => {
        linkSdk();
        const { rawPay, pay } = payTool();

        const out = pay();
        const request = await waitingRequest();
        await decideApproval(test.db, project.projectId, request.id, "deny", DANA);
        const refused = await out;

        expect(isGuardRefusal(refused) && refused.reason).toBe("approval_denied");
        expect(rawPay).not.toHaveBeenCalled();
        expect(approvalDecisions().at(-1)).toMatchObject({
            decision: "block",
            reason: "approval_denied",
            request: request.id,
        });
    });

    it("runs the next identical call on an approve once given after the waiting process died", async () => {
        app = startApp();
        const request = await waitingRequest();
        expect(await connectedPids()).toEqual([app.pid]);
        app.kill("SIGKILL");
        // Control lets go of the dead process's call once its connection is closed
        await vi.waitFor(async () => expect(await connectedPids()).toEqual([]), WAIT);
        // Its beats stopped long ago, so the dashboard shows it as no longer waiting
        await test.db
            .updateTable("approval_waiters")
            .set({ last_beat_at: LONG_AGO })
            .where("request_id", "=", request.id)
            .execute();
        expect(await decideApproval(test.db, project.projectId, request.id, "once", DANA)).toBe("decided");

        linkSdk();
        const { rawPay, pay } = payTool();

        expect(await pay()).toBe(`paid 4950 to ${INVOICE.iban}`);
        expect(rawPay.mock.calls).toEqual([[INVOICE]]);
        expect(await listOpenRequests(test.db, project.projectId)).toEqual([]);
        const used = only(await listDecidedRequests(test.db, project.projectId));
        expect(used).toMatchObject({ id: request.id, answer: "once", usedBy: expect.any(String) });
        expect(used.usedBy).not.toBe(only(request.waiters).askId);
        expect(approvalDecisions().at(-1)).toMatchObject({ rule: "human", decision: "allow", request: request.id });
    });

    it("keeps a call waiting through a control restart, then runs it once approved", async () => {
        linkSdk();
        const { rawPay, pay } = payTool();

        const out = pay();
        const request = await waitingRequest();
        const { port } = control;
        await control.close();
        // On the same port, since the SDK reconnects to the address it knows
        control = await startTestControl(test, { port, timing: CONTROL_TIMING });
        await vi.waitFor(async () => expect(await connectedPids()).toEqual([process.pid]), WAIT);
        await decideApproval(test.db, project.projectId, request.id, "once", DANA);

        expect(await out).toBe(`paid 4950 to ${INVOICE.iban}`);
        expect(rawPay.mock.calls).toEqual([[INVOICE]]);
        expect(only(await listDecidedRequests(test.db, project.projectId))).toMatchObject({
            id: request.id,
            usedBy: only(request.waiters).askId,
        });
    });
});
