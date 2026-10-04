import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blockedRun, verdict } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { incidentCounts } from "./counts.ts";
import { saveVerdict } from "./save.ts";
import type { StoredVerdict } from "./types.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const SINCE = new Date("2026-10-03T00:00:00.000Z");

let runs = 0;

// An incident opened at `at`, with this verdict when given
async function opened(projectId: string, at: string, found?: StoredVerdict): Promise<void> {
    runs += 1;
    const id = await blockedRun(test.db, projectId, runs.toString(16).padStart(32, "0"), at);
    if (found !== undefined) {
        await saveVerdict(test.db, projectId, id, found);
    }
}

const fromCrm = verdict({
    entry: { ...verdict().entry, agent: "planner", origin: "mcp:crm", trust: "trusted" },
    damage: { ...verdict().damage, tool: "sendEmail" },
});

describe("incidentCounts", () => {
    it("counts incidents with a verdict since the window start, most first", async () => {
        const projectId = await createProject(test.db, "Acme");
        await opened(projectId, "2026-10-03T12:00:00.000Z", verdict());
        await opened(projectId, "2026-10-03T13:00:00.000Z", verdict());
        await opened(projectId, "2026-10-03T14:00:00.000Z", fromCrm);
        // Before the window, or still without a verdict
        await opened(projectId, "2026-10-02T12:00:00.000Z", fromCrm);
        await opened(projectId, "2026-10-03T15:00:00.000Z");

        expect(await incidentCounts(test.db, projectId, SINCE)).toEqual({
            bySource: [
                { origin: "web:acme-billing.net", trust: "untrusted", count: 2 },
                { origin: "mcp:crm", trust: "trusted", count: 1 },
            ],
            byTool: [
                { tool: "payInvoice", count: 2 },
                { tool: "sendEmail", count: 1 },
            ],
            agentPoints: [
                { agent: "planner", entry: 1, turning: 3 },
                { agent: "researcher", entry: 2, turning: 0 },
            ],
        });
    });

    it("counts nothing for a quiet project", async () => {
        const projectId = await createProject(test.db, "Quiet");

        expect(await incidentCounts(test.db, projectId, SINCE)).toEqual({ bySource: [], byTool: [], agentPoints: [] });
    });
});
