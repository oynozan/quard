import type { OriginOverrides, RunStartedEvent } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { item, modelCall } from "../test/events.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { ingestBatch } from "./ingest/store.ts";
import { originOverrides } from "./origins.ts";
import { createProject } from "./projects.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const run = (n: number) => n.toString(16).padStart(32, "0");

const started = (n: number, agent: string, at: string, origins: OriginOverrides): RunStartedEvent => ({
    type: "run_started",
    runId: run(n),
    agent,
    at,
    origins,
});

describe("originOverrides", () => {
    it("has no rows in a new project", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await originOverrides(test.db, projectId, { limit: 50 })).toEqual([]);
    });

    it("keeps the newest override per origin, with every agent that set it", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(
                started(1, "billing", "2026-10-03T10:00:00.000Z", {
                    "mcp:crm": { trust: "trusted" },
                    "web:docs.acme.com": { trust: "trusted", sensitivity: "internal" },
                }),
            ),
            item(started(2, "support", "2026-10-03T11:00:00.000Z", { "mcp:crm": { trust: "untrusted" } })),
            item(started(3, "billing", "2026-10-03T12:00:00.000Z", { "mcp:crm": { sensitivity: "public" } })),
            // A run without run_started has no overrides
            item({ ...modelCall("2026-10-03T13:00:00.000Z"), runId: run(4) }),
        ]);

        expect(await originOverrides(test.db, projectId, { limit: 50 })).toEqual([
            {
                origin: "mcp:crm",
                trust: null,
                sensitivity: "public",
                agents: ["billing", "support"],
                seenAt: new Date("2026-10-03T12:00:00.000Z"),
            },
            {
                origin: "web:docs.acme.com",
                trust: "trusted",
                sensitivity: "internal",
                agents: ["billing"],
                seenAt: new Date("2026-10-03T10:00:00.000Z"),
            },
        ]);
    });

    it("reads only the newest runs, by start time", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(started(1, "billing", "2026-10-03T10:00:00.000Z", { "web:old.com": { trust: "trusted" } })),
            item(started(2, "support", "2026-10-03T12:00:00.000Z", { "mcp:crm": { trust: "untrusted" } })),
            item(started(3, "billing", "2026-10-03T11:00:00.000Z", { "mcp:crm": { trust: "trusted" } })),
        ]);

        const rows = await originOverrides(test.db, projectId, { limit: 2 });

        expect(rows).toEqual([
            {
                origin: "mcp:crm",
                trust: "untrusted",
                sensitivity: null,
                agents: ["billing", "support"],
                seenAt: new Date("2026-10-03T12:00:00.000Z"),
            },
        ]);
        expect(await originOverrides(test.db, projectId, { limit: 1 })).toMatchObject([{ agents: ["support"] }]);
    });

    it("picks the larger run id when two runs start at the same time", async () => {
        const projectId = await createProject(test.db, "Acme");
        const at = "2026-10-03T23:30:00.000Z";
        await ingestBatch(test.db, projectId, [
            item(started(1, "billing", at, { "mcp:crm": { trust: "trusted" } })),
            item(started(2, "billing", at, { "mcp:crm": { trust: "untrusted" } })),
        ]);

        expect(await originOverrides(test.db, projectId, { limit: 1 })).toMatchObject([{ trust: "untrusted" }]);
        expect(await originOverrides(test.db, projectId, { limit: 2 })).toMatchObject([{ trust: "untrusted" }]);
    });

    it("leaves out other projects' runs", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, other, [
            item(started(1, "billing", "2026-10-03T10:00:00.000Z", { "mcp:crm": { trust: "trusted" } })),
        ]);
        await ingestBatch(test.db, projectId, [item(started(1, "billing", "2026-10-03T10:00:00.000Z", {}))]);

        expect(await originOverrides(test.db, projectId, { limit: 50 })).toEqual([]);
        expect(await originOverrides(test.db, other, { limit: 50 })).toHaveLength(1);
    });

    it("skips stored origins that are not an object", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(started(1, "billing", "2026-10-03T10:00:00.000Z", { "mcp:crm": { trust: "trusted" } })),
            item(started(2, "billing", "2026-10-03T11:00:00.000Z", {})),
        ]);
        await test.db.updateTable("runs").set({ origins: "[]" }).where("run_id", "=", run(2)).execute();

        expect(await originOverrides(test.db, projectId, { limit: 50 })).toMatchObject([{ origin: "mcp:crm" }]);
    });
});
