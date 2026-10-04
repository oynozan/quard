import { createAgentKey, createProject, findMemoryRecords, findMessageRecord, revokeAgentKey } from "@quard/db";
import { projectKeys } from "@quard/db/server";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { parseHashKey, type MemoryRecord, type MessageRecord, type ValueRecord } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.ts";

const KEYS = projectKeys(parseHashKey("ab".repeat(32)));
const SECRET = "sk-proj-abcdefghijklmnopqrstuvwx";
const PRINT = "b".repeat(64);
const VALUE: ValueRecord = {
    hash: "c".repeat(32),
    origin: "web:acme.com",
    trust: "untrusted",
    sensitivity: "public",
    flags: [],
    stepId: "2".repeat(16),
};

let test: TestDb;
let app: ReturnType<typeof createApp>;
let projectId: string;
let key: string;

beforeAll(async () => {
    test = await startTestDb();
    app = createApp({ db: test.db, keys: KEYS });
    projectId = await createProject(test.db, "Acme");
    key = (await createAgentKey(test.db, projectId, "orchestrator")).key;
}, 60_000);

afterAll(async () => {
    await test.stop();
});

let next = 0;
const ref = () => (++next).toString(16).padStart(16, "a");

function message(fields: Partial<MessageRecord> = {}): MessageRecord {
    return {
        kind: "message",
        ref: ref(),
        runId: "1".repeat(32),
        stepId: "2".repeat(16),
        sender: "orchestrator",
        depth: 0,
        print: PRINT,
        label: { trust: "untrusted", sensitivity: "public", origins: ["user", "web:acme.com"], flagged: false },
        values: [VALUE],
        ...fields,
    };
}

const memory = (fields: Partial<MemoryRecord> = {}): MemoryRecord => ({
    kind: "memory",
    store: "notes",
    print: PRINT,
    runId: "1".repeat(32),
    agent: "billing",
    label: { trust: "trusted", sensitivity: "internal", origins: ["user"], flagged: false },
    values: [],
    ...fields,
});

function post(body: unknown, auth = `Bearer ${key}`, raw = false) {
    return app.request("/v1/labels", {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: raw ? String(body) : JSON.stringify(body),
    });
}

describe("POST /v1/labels", () => {
    it("stores records before it answers, so a lookup finds them at once", async () => {
        const sent = message();
        const written = memory();

        const res = await post({ records: [sent, written] });

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ stored: 2 });
        expect(await findMessageRecord(test.db, projectId, sent.ref)).toEqual(sent);
        expect(await findMemoryRecords(test.db, projectId, PRINT)).toContainEqual(written);
    });

    it("stores records with secrets removed from their origins", async () => {
        const leaky = message({ label: { ...message().label, origins: [`web:acme.com/?key=${SECRET}`] } });

        await post({ records: [leaky] });

        const found = await findMessageRecord(test.db, projectId, leaky.ref);
        expect(found?.label.origins).toEqual(["web:acme.com/?key=sk-proj-…"]);
    });

    it("stores records with emails, IBANs and cards masked and secrets removed from every name", async () => {
        const print = "d".repeat(64);
        const origins = [
            "email:jane.doe@acme.com",
            "web:https://x.io/?iban=DE89370400440532013000",
            "web:https://x.io/?card=4111111111111111",
        ];
        const values = [
            { ...VALUE, origin: `mcp:crm?token=${SECRET}`, flags: [`token=${SECRET}`, "jane.doe@acme.com"] },
        ];
        const leaky = message({
            sender: `agent-${SECRET}`,
            label: { ...message().label, origins },
            values,
            tools: [`pay-${SECRET}`],
        });
        const written = memory({
            print,
            store: `notes-${SECRET}`,
            agent: "billing jane.doe@acme.com",
            label: { ...memory().label, origins },
            values,
        });

        expect((await post({ records: [leaky, written] })).status).toBe(201);

        const found = [
            await findMessageRecord(test.db, projectId, leaky.ref),
            ...(await findMemoryRecords(test.db, projectId, print)),
        ];
        const text = JSON.stringify(found);
        for (const raw of [SECRET, "jane.doe", "DE89370400440532013000", "4111111111111111"]) {
            expect(text).not.toContain(raw);
        }
        const masked = ["email:j…@acme.com", "web:https://x.io/?iban=DE89…3000", "web:https://x.io/?card=4111…1111"];
        expect(found.map((record) => record?.label.origins)).toEqual([masked, masked]);
        expect(found[0]).toMatchObject({ sender: "agent-sk-proj-…", tools: ["pay-sk-proj-…"] });
        expect(found[1]).toMatchObject({ store: "notes-sk-proj-…", agent: "billing j…@acme.com" });
        expect(found[1]?.values[0]).toMatchObject({ origin: "mcp:crm?token=…", flags: ["token=…", "j…@acme.com"] });
    });

    it("redacts with the redactor of the key's project", async () => {
        const redactor = vi.spyOn(KEYS, "redactor");

        expect((await post({ records: [message()] })).status).toBe(201);

        expect(redactor).toHaveBeenCalledWith(projectId);
        redactor.mockRestore();
    });

    it("stores a resent message once", async () => {
        const sent = message();
        await post({ records: [sent] });

        expect(await (await post({ records: [sent] })).json()).toEqual({ stored: 0 });
    });

    it.each([
        ["no key", ""],
        ["an unknown key", "Bearer qk_live_nope"],
        ["another scheme", `Basic ${key}`],
    ])("refuses a request with %s", async (_, auth) => {
        const res = await post({ records: [message()] }, auth);

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "invalid_agent_key" });
    });

    it("refuses a revoked key", async () => {
        const revoked = await createAgentKey(test.db, projectId, "old");
        await revokeAgentKey(test.db, projectId, revoked.id);

        expect((await post({ records: [message()] }, `Bearer ${revoked.key}`)).status).toBe(401);
    });

    it("refuses an upload that is not valid, and says why", async () => {
        const res = await post({ records: [message({ ref: "nope" })] });

        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({
            error: "invalid_labels",
            issues: [expect.stringContaining("records.0.ref")],
        });
        expect((await post({ records: [] })).status).toBe(400);
        expect((await post("not json", `Bearer ${key}`, true)).status).toBe(400);
    });

    it("refuses a body over 1 MB", async () => {
        const res = await post("x".repeat(1024 * 1024 + 1), `Bearer ${key}`, true);

        expect(res.status).toBe(413);
        expect(await res.json()).toEqual({ error: "labels_too_large" });
    });
});
