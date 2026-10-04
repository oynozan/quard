import { createAgentKey, createProject, getRun, revokeAgentKey } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { createRedactor, keyedHash, parseHashKey } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.ts";

const HASH_KEY = parseHashKey("ab".repeat(32));
const IBAN = "DE89370400440532013000";
const RUN = "1".repeat(32);
const AT = "2026-10-03T12:00:00.000Z";

let test: TestDb;
let app: ReturnType<typeof createApp>;
let projectId: string;
let key: string;

beforeAll(async () => {
    test = await startTestDb();
    app = createApp({ db: test.db, redactor: createRedactor(HASH_KEY) });
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
        expect(run?.labels[0]?.keys).toEqual([`iban:DE89…3000#${keyedHash(HASH_KEY, "iban", IBAN)}`]);
        expect(run).toMatchObject({ blocked: 1, degraded: true });
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

    it("notes events the SDK had to drop", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        await post({ ...rawBatch("5".repeat(32)), dropped: 3 });

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("dropped 3 events (a full buffer, or values that could not be sent as JSON)"),
        );
        warn.mockRestore();
    });

    it("logs a config error and stores nothing for it", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const event = { type: "config_error", at: AT, source: "signatures", message: "feed unreachable" };

        const res = await post({ events: [{ id: id(), event }] });

        expect(await res.json()).toEqual({ received: 1, stored: 0 });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("the signatures file failed to load"));
        warn.mockRestore();
    });

    it("stores a resent batch once", async () => {
        const batch = rawBatch("4".repeat(32));
        await post(batch);

        expect(await (await post(batch)).json()).toEqual({ received: 3, stored: 0 });
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
