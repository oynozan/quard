import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../../../test/pglite.ts";
import { createAgentKey } from "../../keys.ts";
import { createProject } from "../../projects.ts";
import { openConnection, saveRules } from "../connections.ts";
import { connectedApps } from "./apps.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const since = new Date("2026-09-03T18:40:00.000Z");
const A = "a".repeat(16);
const B = "b".repeat(16);
const C = "c".repeat(16);
const D = "d".repeat(16);

type Session = { host: string; rules: string | null; connectedAt: string; closedAt?: string; sdk?: string };

// A connection as control stores it, moved to fixed times
async function session(projectId: string, keyId: string, fields: Session): Promise<void> {
    const sdk = fields.sdk ?? "0.4.2";
    const id = await openConnection(test.db, projectId, { keyId, sdk, host: fields.host, pid: 7 });
    if (fields.rules !== null) {
        await saveRules(test.db, projectId, id, { hash: fields.rules, list: [] });
    }
    await test.db
        .updateTable("sdk_connections")
        .set({ connected_at: fields.connectedAt, disconnected_at: fields.closedAt ?? null })
        .where("id", "=", id)
        .execute();
}

describe("connectedApps", () => {
    it("has no apps before an SDK connects", async () => {
        const projectId = await createProject(test.db, "Acme");
        await createAgentKey(test.db, projectId, "billing-service");

        expect(await connectedApps(test.db, projectId, { since })).toEqual([]);
    });

    it("shows an app by its newest open connection, with the rules every open connection runs", async () => {
        const projectId = await createProject(test.db, "Acme");
        const key = await createAgentKey(test.db, projectId, "billing-service");
        await session(projectId, key.id, {
            host: "old-1",
            rules: A,
            connectedAt: "2026-10-01T08:00:00.000Z",
            closedAt: "2026-10-02T08:00:00.000Z",
        });
        await session(projectId, key.id, { host: "web-1", rules: B, connectedAt: "2026-10-03T09:00:00.000Z" });
        await session(projectId, key.id, {
            host: "web-2",
            rules: C,
            connectedAt: "2026-10-03T10:00:00.000Z",
            sdk: "0.4.3",
        });
        // Connected last, but already gone
        await session(projectId, key.id, {
            host: "web-3",
            rules: D,
            connectedAt: "2026-10-03T11:00:00.000Z",
            closedAt: "2026-10-03T11:05:00.000Z",
        });

        expect(await connectedApps(test.db, projectId, { since })).toEqual([
            {
                keyId: key.id,
                name: "billing-service",
                prefix: key.prefix,
                sdk: "0.4.3",
                host: "web-2",
                rulesHash: C,
                disconnectedAt: null,
                rulesHashes: [B, C],
            },
        ]);
    });

    it("shows an offline app by its newest connection and when that one closed", async () => {
        const projectId = await createProject(test.db, "Acme");
        const key = await createAgentKey(test.db, projectId, "deploy-bot");
        await session(projectId, key.id, {
            host: "ci-1",
            rules: A,
            connectedAt: "2026-10-01T08:00:00.000Z",
            closedAt: "2026-10-01T09:00:00.000Z",
        });
        await session(projectId, key.id, {
            host: "ci-2",
            rules: B,
            connectedAt: "2026-10-03T12:00:00.000Z",
            closedAt: "2026-10-03T16:40:00.000Z",
        });

        expect(await connectedApps(test.db, projectId, { since })).toEqual([
            {
                keyId: key.id,
                name: "deploy-bot",
                prefix: key.prefix,
                sdk: "0.4.2",
                host: "ci-2",
                rulesHash: B,
                disconnectedAt: new Date("2026-10-03T16:40:00.000Z"),
                rulesHashes: [B],
            },
        ]);
    });

    it("ignores connections that closed before then, even one that connected later", async () => {
        const projectId = await createProject(test.db, "Acme");
        const key = await createAgentKey(test.db, projectId, "nightly-batch");
        await session(projectId, key.id, {
            host: "batch-1",
            rules: A,
            connectedAt: "2026-08-01T00:00:00.000Z",
            closedAt: "2026-09-10T00:00:00.000Z",
        });
        await session(projectId, key.id, {
            host: "batch-2",
            rules: B,
            connectedAt: "2026-08-20T00:00:00.000Z",
            closedAt: "2026-08-21T00:00:00.000Z",
        });

        expect(await connectedApps(test.db, projectId, { since })).toEqual([
            {
                keyId: key.id,
                name: "nightly-batch",
                prefix: key.prefix,
                sdk: "0.4.2",
                host: "batch-1",
                rulesHash: A,
                disconnectedAt: new Date("2026-09-10T00:00:00.000Z"),
                rulesHashes: [A],
            },
        ]);
    });

    it("keeps open apps however old, and offline ones that closed since then, by name", async () => {
        const projectId = await createProject(test.db, "Acme");
        const gone = await createAgentKey(test.db, projectId, "archive");
        const steady = await createAgentKey(test.db, projectId, "zeta-worker");
        const recent = await createAgentKey(test.db, projectId, "alpha");
        await session(projectId, gone.id, {
            host: "h-1",
            rules: A,
            connectedAt: "2026-08-01T00:00:00.000Z",
            closedAt: "2026-09-03T18:39:00.000Z",
        });
        await session(projectId, steady.id, { host: "h-2", rules: A, connectedAt: "2026-08-01T00:00:00.000Z" });
        await session(projectId, recent.id, {
            host: "h-3",
            rules: A,
            connectedAt: "2026-09-03T18:00:00.000Z",
            closedAt: "2026-09-03T18:40:00.000Z",
        });

        const apps = await connectedApps(test.db, projectId, { since });
        expect(apps.map((app) => app.name)).toEqual(["alpha", "zeta-worker"]);
    });

    it("leaves out connections that never reported rules, and other projects' apps", async () => {
        const projectId = await createProject(test.db, "Acme");
        const key = await createAgentKey(test.db, projectId, "billing-service");
        const silent = await createAgentKey(test.db, projectId, "silent");
        // Open, but hello stopped before the rules were stored
        await session(projectId, key.id, { host: "web-1", rules: null, connectedAt: "2026-10-03T10:00:00.000Z" });
        await session(projectId, silent.id, { host: "web-9", rules: null, connectedAt: "2026-10-03T10:00:00.000Z" });
        await session(projectId, key.id, {
            host: "web-2",
            rules: A,
            connectedAt: "2026-10-03T09:00:00.000Z",
            closedAt: "2026-10-03T09:30:00.000Z",
        });
        const other = await createProject(test.db, "Other");
        const elsewhere = await createAgentKey(test.db, other, "billing-service");
        await session(other, elsewhere.id, { host: "web-1", rules: B, connectedAt: "2026-10-03T10:00:00.000Z" });

        expect(await connectedApps(test.db, projectId, { since })).toEqual([
            {
                keyId: key.id,
                name: "billing-service",
                prefix: key.prefix,
                sdk: "0.4.2",
                host: "web-2",
                rulesHash: A,
                disconnectedAt: new Date("2026-10-03T09:30:00.000Z"),
                rulesHashes: [A],
            },
        ]);
    });
});
