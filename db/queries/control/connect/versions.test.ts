import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../../../test/pglite.ts";
import { planOf } from "../../../test/plan.ts";
import { createProject } from "../../projects.ts";
import { saveAgentVersion, type AgentVersionInput } from "../connections.ts";
import { agentVersions } from "./versions.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const V1 = "1".repeat(16);
const V2 = "2".repeat(16);
const V3 = "3".repeat(16);

// A version control stored, first seen at a fixed time
async function seen(projectId: string, input: AgentVersionInput, firstSeenAt: string): Promise<void> {
    await saveAgentVersion(test.db, projectId, input);
    await test.db
        .updateTable("agent_versions")
        .set({ first_seen_at: firstSeenAt })
        .where("project_id", "=", projectId)
        .where("agent", "=", input.agent)
        .where("version", "=", input.version)
        .execute();
}

describe("agentVersions", () => {
    it("lists an agent's versions newest first, with a short hash of their stored instructions", async () => {
        const projectId = await createProject(test.db, "Acme");
        const first = {
            agent: "billing",
            version: V1,
            model: "gpt-5.4-mini",
            tools: ["payInvoice"],
            instructions: "Pay approved invoices.",
        };
        await seen(projectId, first, "2026-09-01T10:00:00.000Z");
        await seen(
            projectId,
            { agent: "billing", version: V2, model: "gpt-5.4", tools: ["payInvoice", "fetchPage"] },
            "2026-10-01T10:00:00.000Z",
        );
        // Another agent, and the same agent in another project
        await seen(projectId, { ...first, agent: "support", version: V3 }, "2026-10-02T10:00:00.000Z");
        await seen(await createProject(test.db, "Other"), { ...first, version: V3 }, "2026-10-02T10:00:00.000Z");

        expect(await agentVersions(test.db, projectId, "billing", { limit: 10 })).toEqual([
            {
                version: V2,
                model: "gpt-5.4",
                tools: ["payInvoice", "fetchPage"],
                instructionsHash: null,
                firstSeenAt: new Date("2026-10-01T10:00:00.000Z"),
            },
            {
                version: V1,
                model: "gpt-5.4-mini",
                tools: ["payInvoice"],
                // The first 16 hex characters of the SHA-256 of "Pay approved invoices."
                instructionsHash: "c452794b8ad8444b",
                firstSeenAt: new Date("2026-09-01T10:00:00.000Z"),
            },
        ]);
    });

    it("stops at the limit, keeping the newest versions", async () => {
        const projectId = await createProject(test.db, "Acme");
        const base = { agent: "billing", model: "gpt-5.4", tools: [] };
        await seen(projectId, { ...base, version: V2 }, "2026-10-02T10:00:00.000Z");
        await seen(projectId, { ...base, version: V1 }, "2026-10-01T10:00:00.000Z");
        await seen(projectId, { ...base, version: V3 }, "2026-10-03T10:00:00.000Z");

        const versions = await agentVersions(test.db, projectId, "billing", { limit: 2 });
        expect(versions.map((row) => row.version)).toEqual([V3, V2]);
    });

    it("hashes the instructions of only the versions it keeps", async () => {
        const projectId = await createProject(test.db, "Acme");

        const plan = await planOf(test, (db) => agentVersions(db, projectId, "billing", { limit: 2 }));
        // Below the limit, Postgres would hash every version the agent ever had
        const [above, below] = plan.split(/^\s*(?:->\s+)?Limit$/m);
        expect(above).toContain("sha256");
        expect(below).not.toContain("sha256");
    });

    it("has no versions for an agent control never heard about", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await agentVersions(test.db, projectId, "billing", { limit: 10 })).toEqual([]);
    });
});
