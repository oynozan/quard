// @vitest-environment node
import { createProject, recordFleetUse, type QuarantinedFleetItem } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MINUTE } from "../../../../test/time";

vi.mock("@/lib/auth/session", () => ({ requireSession: async () => ({ sub: "did:privy:1" }) }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getQuarantine, quarantinedOf } = await import("./quarantine");
const { database } = await import("../runs/live/client");

const IBAN = { field: "iban", kind: "iban", key: `iban:GB33…5555#${"e".repeat(32)}` } as const;
const EMAIL = { field: "to", kind: "email", key: `email:j…@evil.com#${"f".repeat(32)}` } as const;
const runId = (n: number) => n.toString(16).padStart(32, "0");
let test: TestDb;
let projectId = "";

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
}, 60_000);

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

describe("getQuarantine", () => {
    it("shows an empty quarantine and the check's settings before a project exists", async () => {
        const before = Date.now();
        const data = await getQuarantine();
        expect(data).toMatchObject({
            quarantine: [],
            watching: [],
            check: { fields: [], newForDays: 7, runsToBlock: 5, withinHours: 24, observeUntil: null },
        });
        expect(data.now).toBeGreaterThanOrEqual(before);
    });

    it("has no observe window before the check first counts a value", async () => {
        projectId = await createProject(test.db, "Acme");
        expect((await getQuarantine()).check.observeUntil).toBeNull();
    });

    it("reads the quarantined and watched values, the fields seen and the observe window", async () => {
        const start = Date.now() - 10 * MINUTE;
        // Five runs used the IBAN within minutes, while the check only observes
        for (let n = 1; n <= 5; n += 1) {
            const use = { runId: runId(n), agent: "billing", tool: "payInvoice", blocked: false, values: [IBAN] };
            await recordFleetUse(test.db, projectId, use, new Date(start + n * MINUTE));
        }
        const mail = { runId: runId(6), agent: "support", tool: "sendEmail", blocked: false, values: [EMAIL] };
        await recordFleetUse(test.db, projectId, mail, new Date(start + 6 * MINUTE));

        const data = await getQuarantine();
        expect(data.quarantine).toEqual([
            {
                kind: "iban",
                field: "iban",
                key: IBAN.key,
                value: "GB33…5555",
                hash: "e".repeat(32),
                firstSeenAt: start + MINUTE,
                quarantinedAt: start + 5 * MINUTE,
                observe: true,
                runs: 5,
                blockedAttempts: 0,
                agents: ["billing"],
                lastAttemptAt: start + 5 * MINUTE,
            },
        ]);
        expect(data.watching).toEqual([
            {
                kind: "email",
                field: "to",
                key: EMAIL.key,
                value: "j…@evil.com",
                hash: "f".repeat(32),
                firstSeenAt: start + 6 * MINUTE,
                runs: 1,
                agents: ["support"],
            },
        ]);
        expect(data.check).toEqual({
            fields: ["iban", "to"],
            newForDays: 7,
            runsToBlock: 5,
            withinHours: 24,
            observeUntil: start + MINUTE + 7 * 24 * 60 * MINUTE,
        });
    });
});

describe("quarantinedOf", () => {
    it("keeps a missing last attempt as null", () => {
        const item: QuarantinedFleetItem = {
            kind: "domain",
            field: "url",
            key: "domain:evil.com",
            value: "evil.com",
            hash: null,
            firstSeenAt: new Date(0),
            quarantinedAt: new Date(1000),
            observe: false,
            runs: 5,
            blockedAttempts: 0,
            agents: [],
            lastAttemptAt: null,
        };
        expect(quarantinedOf(item)).toMatchObject({ hash: null, quarantinedAt: 1000, lastAttemptAt: null });
    });
});
