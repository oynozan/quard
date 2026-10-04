import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { brokenDb, newConnection, newProject, readyConnection, testContext } from "../test/context.ts";
import { agent, closed, rules } from "./rules.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const VERSION = "a1".repeat(8);

function connectionRow(id: string) {
    return test.db.selectFrom("sdk_connections").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
}

describe("rules", () => {
    it("stores the new rules and notes them on the connection", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection } = await readyConnection(ctx, project);
        const next = {
            hash: "e".repeat(16),
            list: [{ tool: "sendEmail", guard: "egress", rule: "allow", mode: "observe" as const }],
        };

        await rules(ctx, connection, { type: "rules", rules: next });

        expect(await connectionRow(connection.id)).toMatchObject({ rules_hash: next.hash });
        const sets = await test.db
            .selectFrom("rule_sets")
            .select("hash")
            .where("project_id", "=", project.projectId)
            .orderBy("hash")
            .execute();
        expect(sets.map((set) => set.hash)).toEqual(["d".repeat(16), next.hash]);
    });
});

describe("agent", () => {
    it("stores an agent version with its instructions redacted by its project's redactor", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection } = await readyConnection(ctx, project);
        const redactor = vi.spyOn(ctx.keys, "redactor");
        const message = {
            type: "agent" as const,
            agent: "billing",
            version: VERSION,
            model: "gpt-5",
            tools: ["payInvoice"],
        };

        await agent(ctx, connection, { ...message, instructions: "Pay invoices. Ask jane@acme.com when unsure." });
        await agent(ctx, connection, { ...message, agent: "support" });

        const rows = await test.db
            .selectFrom("agent_versions")
            .select(["agent", "version", "model", "tools", "instructions"])
            .where("project_id", "=", project.projectId)
            .orderBy("agent")
            .execute();
        expect(rows).toEqual([
            {
                agent: "billing",
                version: VERSION,
                model: "gpt-5",
                tools: ["payInvoice"],
                instructions: "Pay invoices. Ask j…@acme.com when unsure.",
            },
            { agent: "support", version: VERSION, model: "gpt-5", tools: ["payInvoice"], instructions: null },
        ]);
        expect(redactor).toHaveBeenCalledWith(project.projectId);
    });
});

describe("closed", () => {
    it("records when a connection closed", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection } = await readyConnection(ctx, project);

        await closed(ctx, connection);

        expect(await connectionRow(connection.id)).toMatchObject({ disconnected_at: expect.any(Date) });
    });

    it("has nothing to record before hello", async () => {
        const db = brokenDb();
        const ctx = testContext(db);
        const { connection } = newConnection(ctx, { keyId: "k", projectId: "p" });

        await closed(ctx, connection);

        expect(ctx.logs).toEqual([]);
        await db.destroy();
    });

    it("logs a close it could not record", async () => {
        const db = brokenDb();
        const ctx = testContext(db);
        const { connection } = newConnection(ctx, { keyId: "k", projectId: "p" });
        connection.id = `con_${"1".repeat(16)}`;

        await closed(ctx, connection);

        expect(ctx.logs).toEqual([expect.stringContaining("control: could not record a closed connection: ")]);
        await db.destroy();
    });
});
