import { createAgentKey, createProject, droppedEvents, getRun, listConfigErrors, revokeAgentKey } from "@quard/db";
import { projectKeys } from "@quard/db/server";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { keyedHash, parseHashKey, projectHashKey } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.ts";

const INSTALL_KEY = parseHashKey("ab".repeat(32));
const IBAN = "DE89370400440532013000";
const RUN = "1".repeat(32);
const AT = "2026-10-03T12:00:00.000Z";

let test: TestDb;
let app: ReturnType<typeof createApp>;
let projectId: string;
let key: string;

beforeAll(async () => {
    test = await startTestDb();
    app = createApp({ db: test.db, keys: projectKeys(INSTALL_KEY) });
    projectId = await createProject(test.db, "Acme");
    key = (await createAgentKey(test.db, projectId, "billing")).key;
}, 60_000);

afterAll(async () => {
    await test.stop();
});

let next = 0;
const id = () => (++next).toString(16).padStart(16, "a");

// Events as an old or broken SDK might send them: raw values, no redaction
function rawBatch(runId = RUN) {
    const base = { runId, agent: "billing", at: AT };
    return {
        events: [
            { id: id(), event: { type: "run_started", runId, agent: "billing", at: AT, origins: {} } },
            {
                id: id(),
                event: {
                    type: "content",
                    ...base,
                    stepId: "2".repeat(16),
                    contentId: "c1",
                    origin: "web:acme-billing.net",
                    trust: "untrusted",
                    sensitivity: "public",
                    flags: [],
                    keys: [`iban:${IBAN}`],
                },
            },
            {
                id: id(),
                degraded: true,
                event: {
                    type: "tool_call",
                    ...base,
                    stepId: "3".repeat(16),
                    tool: "payInvoice",
                    arguments: { iban: IBAN, notify: "jane@acme.com", token: "secret-value" },
                    status: "blocked",
                    influenced: true,
                    flagged: false,
                    durationMs: 1,
                },
            },
        ],
    };
}

// The IBAN's key as the project stores it, hashed with the project's key
function ibanKey(project: string): string {
    return `iban:DE89…3000#${keyedHash(projectHashKey(INSTALL_KEY, project), "iban", IBAN)}`;
}

function post(body: unknown, auth = `Bearer ${key}`, raw = false) {
    return app.request("/v1/events", {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: raw ? String(body) : JSON.stringify(body),
    });
}

describe("POST /v1/events", () => {
    it("stores a batch with every raw value masked or hashed", async () => {
        const res = await post(rawBatch());

        expect(res.status).toBe(202);
        expect(await res.json()).toEqual({ received: 3, stored: 3 });
        const stored = await test.db.selectFrom("events").select("body").where("project_id", "=", projectId).execute();
        const text = JSON.stringify(stored);
        expect(text).not.toContain(IBAN);
        expect(text).not.toContain("jane@acme.com");
        expect(text).not.toContain("secret-value");
        const run = await getRun(test.db, projectId, RUN);
        expect(run?.labels[0]?.keys).toEqual([ibanKey(projectId)]);
        expect(run).toMatchObject({ blocked: 1, degraded: true });
    });

    it("hashes each project's values with that project's own key", async () => {
        const other = await createProject(test.db, "Other");
        const otherKey = (await createAgentKey(test.db, other, "billing")).key;

        expect((await post(rawBatch(), `Bearer ${otherKey}`)).status).toBe(202);

        const stored = (await getRun(test.db, other, RUN))?.labels[0]?.keys;
        expect(stored).toEqual([ibanKey(other)]);
        expect(stored).not.toEqual([ibanKey(projectId)]);
        expect(JSON.stringify(stored)).not.toContain(keyedHash(INSTALL_KEY, "iban", IBAN));
    });

    it("stores a card number sent as a number masked", async () => {
        const runId = "6".repeat(32);
        const event = {
            type: "tool_call",
            runId,
            stepId: "7".repeat(16),
            agent: "billing",
            at: AT,
            tool: "payByCard",
            arguments: { card: 4111111111111111, amount: 50 },
            status: "blocked",
            influenced: false,
            flagged: false,
            durationMs: 1,
        };

        expect((await post({ events: [{ id: id(), event }] })).status).toBe(202);

        const masked = { arguments: { card: "4111…1111", amount: 50 } };
        const stored = await test.db
            .selectFrom("events")
            .select("body")
            .where("project_id", "=", projectId)
            .where("run_id", "=", runId)
            .executeTakeFirstOrThrow();
        expect(stored.body).toMatchObject(masked);
        const step = await test.db
            .selectFrom("steps")
            .select("detail")
            .where("project_id", "=", projectId)
            .where("run_id", "=", runId)
            .executeTakeFirstOrThrow();
        expect(step.detail).toMatchObject(masked);
    });

    it("logs and stores the number of events the SDK had to drop, once per batch", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const since = new Date();
        const batch = { ...rawBatch("5".repeat(32)), dropped: 3 };

        await post(batch);
        await post(batch);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("dropped 3 events (a full buffer, or values that could not be sent as JSON)"),
        );
        expect(await droppedEvents(test.db, projectId, since)).toEqual({ count: 3, lastAt: expect.any(Date) });
        warn.mockRestore();
    });

    it("logs a config error and stores it apart from runs, redacted", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const message = "feed unreachable, mail jane@acme.com";
        const event = { type: "config_error", at: AT, source: "signatures", message };

        const res = await post({
            events: [
                { id: id(), event },
                { id: id(), event },
            ],
        });

        expect(await res.json()).toEqual({ received: 2, stored: 0 });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("the signatures file failed to load"));
        const [stored] = await listConfigErrors(test.db, projectId, { limit: 10 });
        expect(stored).toMatchObject({ source: "signatures", count: 2 });
        expect(stored?.message).toContain("feed unreachable");
        expect(stored?.message).not.toContain("jane@acme.com");
        warn.mockRestore();
    });

    it("stores a resent batch once", async () => {
        const batch = rawBatch("4".repeat(32));
        await post(batch);

        expect(await (await post(batch)).json()).toEqual({ received: 3, stored: 0 });
    });

    it("stores an x402 payment, wallets in clear, and adds it to the run's spend", async () => {
        const runId = "7".repeat(32);
        const payTo = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
        const payment = {
            type: "payment",
            runId,
            stepId: "8".repeat(16),
            agent: "billing",
            at: AT,
            stage: "settled",
            host: "api.example.com",
            resource: "https://api.example.com/report?token=sk-live-1234567890abcdef",
            x402Version: 2,
            scheme: "exact",
            network: "eip155:8453",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: "50000",
            usd: 0.05,
            payTo,
            transaction: "0x" + "ab".repeat(32),
            delivered: true,
        };
        const batch = { events: [{ id: id(), event: payment }] };

        expect(await (await post(batch)).json()).toEqual({ received: 1, stored: 1 });
        expect(await (await post(batch)).json()).toEqual({ received: 1, stored: 0 });

        const row = await test.db
            .selectFrom("payments")
            .selectAll()
            .where("project_id", "=", projectId)
            .where("run_id", "=", runId)
            .executeTakeFirstOrThrow();
        expect(row).toMatchObject({ stage: "settled", amount: "50000", usd: 0.05, pay_to: payTo, delivered: true });
        expect(row.tx_hash).toBe(payment.transaction);
        expect(row.resource).not.toContain("sk-live-1234567890abcdef");
        const run = await test.db
            .selectFrom("runs")
            .select(["spend_usd", "spend_known"])
            .where("project_id", "=", projectId)
            .where("run_id", "=", runId)
            .executeTakeFirstOrThrow();
        expect(run).toEqual({ spend_usd: 0.05, spend_known: true });
    });

    it.each([
        ["no key", ""],
        ["an unknown key", "Bearer qk_live_nope"],
        ["another scheme", `Basic ${key}`],
    ])("refuses a request with %s", async (_, auth) => {
        const res = await post(rawBatch(), auth);

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "invalid_agent_key" });
    });

    it("refuses a request with no authorization header", async () => {
        const res = await app.request("/v1/events", { method: "POST", body: JSON.stringify(rawBatch()) });

        expect(res.status).toBe(401);
    });

    it("refuses a revoked key", async () => {
        const revoked = await createAgentKey(test.db, projectId, "old");
        await revokeAgentKey(test.db, projectId, revoked.id);

        expect((await post(rawBatch(), `Bearer ${revoked.key}`)).status).toBe(401);
    });

    it("refuses a batch that is not valid, and says why", async () => {
        const bad = {
            events: [{ id: id(), event: { type: "run_started", runId: "nope", agent: "a", at: AT, origins: {} } }],
        };
        const res = await post(bad);

        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: "invalid_batch", issues: [expect.stringContaining("runId")] });
        expect((await post("not json", `Bearer ${key}`, true)).status).toBe(400);
    });

    it("refuses a body that is too large", async () => {
        const res = await post("x".repeat(4 * 1024 * 1024 + 1), `Bearer ${key}`, true);

        expect(res.status).toBe(413);
        expect(await res.json()).toEqual({ error: "batch_too_large" });
    });
});
