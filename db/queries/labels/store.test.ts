import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryRecord, messageRecord, PRINT, REF, TRUSTED, UNTRUSTED, valueRecord } from "../../test/labels.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { labelHash, storeLabelRecords } from "./store.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

function memoryRows(projectId: string) {
    return test.db
        .selectFrom("memory_labels")
        .selectAll()
        .where("project_id", "=", projectId)
        .orderBy("first_written_at")
        .execute();
}

describe("labelHash", () => {
    it("is the same for the same label and values, whatever their key order", () => {
        const one = memoryRecord({ label: UNTRUSTED, values: [valueRecord()] });
        const reordered = { label: { ...UNTRUSTED }, values: [{ ...valueRecord(), hash: "c".repeat(32) }] };

        expect(labelHash(one)).toMatch(/^[0-9a-f]{32}$/);
        expect(labelHash(reordered)).toBe(labelHash(one));
        expect(labelHash(memoryRecord())).not.toBe(labelHash(one));
    });
});

describe("storeLabelRecords", () => {
    it("stores a message record with its labels and tools", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await storeLabelRecords(test.db, projectId, [messageRecord()])).toBe(1);

        const row = await test.db
            .selectFrom("message_records")
            .selectAll()
            .where("project_id", "=", projectId)
            .executeTakeFirstOrThrow();
        expect(row).toMatchObject({
            ref: REF,
            sender: "orchestrator",
            depth: 0,
            print: PRINT,
            label: UNTRUSTED,
            value_labels: [valueRecord()],
            tools: ["payInvoice"],
        });
    });

    it("stores a message without a step or tools as nulls", async () => {
        const projectId = await createProject(test.db, "Acme");

        await storeLabelRecords(test.db, projectId, [messageRecord({ stepId: undefined, tools: undefined })]);

        const row = await test.db
            .selectFrom("message_records")
            .select(["step_id", "tools"])
            .where("project_id", "=", projectId)
            .executeTakeFirstOrThrow();
        expect(row).toEqual({ step_id: null, tools: null });
    });

    it("keeps the first record when the same reference is sent again", async () => {
        const projectId = await createProject(test.db, "Acme");
        await storeLabelRecords(test.db, projectId, [messageRecord()]);

        const again = messageRecord({ sender: "someone-else" });
        expect(await storeLabelRecords(test.db, projectId, [again, again])).toBe(0);

        const rows = await test.db
            .selectFrom("message_records")
            .select("sender")
            .where("project_id", "=", projectId)
            .execute();
        expect(rows).toEqual([{ sender: "orchestrator" }]);
    });

    it("keeps one memory row per distinct label and moves its last write", async () => {
        const projectId = await createProject(test.db, "Acme");
        const trusted = memoryRecord();
        const untrusted = memoryRecord({ label: UNTRUSTED, values: [valueRecord()] });

        expect(await storeLabelRecords(test.db, projectId, [trusted, untrusted, trusted])).toBe(2);
        const [first] = await memoryRows(projectId);
        expect(await storeLabelRecords(test.db, projectId, [{ ...trusted, runId: "9".repeat(32) }])).toBe(1);

        const rows = await memoryRows(projectId);
        expect(rows).toHaveLength(2);
        const again = rows.find((row) => row.label_hash === labelHash(trusted));
        expect(again).toMatchObject({ store: "notes", agent: "billing", trust: "trusted", label: TRUSTED });
        // The first writer's run stays; only the time of the last write moves
        expect(again?.run_id).toBe("1".repeat(32));
        expect(again?.first_written_at).toEqual(first?.first_written_at);
        expect(again?.last_written_at.getTime()).toBeGreaterThan(Number(first?.last_written_at.getTime()));
    });

    it("marks a memory label untrusted when its label or any value is", async () => {
        const projectId = await createProject(test.db, "Acme");
        const fromValue = memoryRecord({ values: [valueRecord()] });

        await storeLabelRecords(test.db, projectId, [memoryRecord(), fromValue, memoryRecord({ label: UNTRUSTED })]);

        const trust = (await memoryRows(projectId)).map((row) => row.trust).sort();
        expect(trust).toEqual(["trusted", "untrusted", "untrusted"]);
    });

    it("stores messages and memory together, and keeps projects apart", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");

        expect(await storeLabelRecords(test.db, one, [messageRecord(), memoryRecord()])).toBe(2);
        expect(await storeLabelRecords(test.db, two, [messageRecord(), memoryRecord()])).toBe(2);
        expect(await memoryRows(two)).toHaveLength(1);
    });

    it("writes nothing when one record fails", async () => {
        const projectId = await createProject(test.db, "Acme");
        // Messages go in first, so the failing memory row undoes the message
        const broken = memoryRecord({ print: "not a print" });

        await expect(storeLabelRecords(test.db, projectId, [messageRecord(), broken])).rejects.toThrow();
        const messages = await test.db
            .selectFrom("message_records")
            .select("ref")
            .where("project_id", "=", projectId)
            .execute();
        expect(messages).toEqual([]);
    });
});
