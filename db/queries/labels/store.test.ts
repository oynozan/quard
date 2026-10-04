import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryRecord, messageRecord, PRINT, REF, UNTRUSTED, valueRecord } from "../../test/labels.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { storeLabelRecords } from "./store.ts";

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

    it("keeps one merged memory row per item and moves its last write", async () => {
        const projectId = await createProject(test.db, "Acme");
        const trusted = memoryRecord();
        const untrusted = memoryRecord({ label: UNTRUSTED, values: [valueRecord()] });

        expect(await storeLabelRecords(test.db, projectId, [trusted, untrusted, trusted])).toBe(1);
        const [first] = await memoryRows(projectId);
        const later = { ...trusted, runId: "9".repeat(32), agent: "support" };
        expect(await storeLabelRecords(test.db, projectId, [later])).toBe(1);

        const rows = await memoryRows(projectId);
        expect(rows).toHaveLength(1);
        // Writing trusted content again never makes it more trusted
        expect(rows[0]).toMatchObject({
            store: "notes",
            run_id: "1".repeat(32),
            agent: "billing",
            label: { ...UNTRUSTED, sensitivity: "internal" },
            value_labels: [valueRecord()],
        });
        expect(rows[0]?.first_written_at).toEqual(first?.first_written_at);
        expect(rows[0]?.last_written_at.getTime()).toBeGreaterThan(Number(first?.last_written_at.getTime()));
    });

    it("merges new and known items in one upload", async () => {
        const projectId = await createProject(test.db, "Acme");
        const [a, b, c] = ["a", "b", "c"].map((digit) => digit.repeat(64));
        await storeLabelRecords(test.db, projectId, [memoryRecord({ print: b })]);

        const written = [c, a, b].map((print) => memoryRecord({ print, label: UNTRUSTED }));
        expect(await storeLabelRecords(test.db, projectId, written)).toBe(3);

        const rows = await test.db
            .selectFrom("memory_labels")
            .select(["print", "label"])
            .where("project_id", "=", projectId)
            .orderBy("print")
            .execute();
        expect(rows).toEqual([
            { print: a, label: UNTRUSTED },
            { print: b, label: { ...UNTRUSTED, sensitivity: "internal" } },
            { print: c, label: UNTRUSTED },
        ]);
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
