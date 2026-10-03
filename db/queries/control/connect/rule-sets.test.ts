import type { RuleEntry } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../../../test/pglite.ts";
import { createAgentKey } from "../../keys.ts";
import { createProject } from "../../projects.ts";
import { openConnection, saveRules } from "../connections.ts";
import { ruleSets } from "./rule-sets.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const A = "a".repeat(16);
const B = "b".repeat(16);
const C = "c".repeat(16);
const D = "d".repeat(16);
const approval: RuleEntry = { tool: "payInvoice", guard: "approval", rule: "approval", mode: "block" };
const source: RuleEntry = { tool: "fetchPage", guard: "source", rule: "source", mode: "observe" };

// A project whose SDK reported these rule sets, one after another
async function reported(sets: { hash: string; list: RuleEntry[] }[]): Promise<string> {
    const projectId = await createProject(test.db, "Acme");
    const key = await createAgentKey(test.db, projectId, "billing-service");
    const id = await openConnection(test.db, projectId, { keyId: key.id, sdk: "0.4.2", host: "web-1", pid: 7 });
    for (const set of sets) {
        await saveRules(test.db, projectId, id, set);
    }
    return projectId;
}

describe("ruleSets", () => {
    it("reads the project's rule sets with these hashes, by hash", async () => {
        const projectId = await reported([
            { hash: B, list: [approval, source] },
            { hash: A, list: [approval] },
            { hash: C, list: [] },
        ]);
        // The same hash in another project stays there
        await reported([{ hash: D, list: [source] }]);

        expect(await ruleSets(test.db, projectId, [B, D, A])).toEqual([
            { hash: A, rules: [approval] },
            { hash: B, rules: [approval, source] },
        ]);
    });

    it("reads nothing when no hash is asked for", async () => {
        const projectId = await reported([{ hash: A, list: [approval] }]);

        expect(await ruleSets(test.db, projectId, [])).toEqual([]);
    });
});
