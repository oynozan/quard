import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryRecord, messageRecord, PRINT, REF, UNTRUSTED, valueRecord } from "../../test/labels.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { findMemoryRecords, findMessageRecord } from "./find.ts";
import { labelHash, storeLabelRecords } from "./store.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// A memory label as if it were last written `minutes` after a fixed time
async function writtenAt(projectId: string, label: ReturnType<typeof memoryRecord>, minutes: number) {
    await test.db
        .updateTable("memory_labels")
        .set({ last_written_at: new Date(Date.UTC(2026, 9, 3, 12, minutes)) })
        .where("project_id", "=", projectId)
        .where("label_hash", "=", labelHash(label))
        .execute();
}

describe("findMessageRecord", () => {
    it("returns the record as it was stored", async () => {
        const projectId = await createProject(test.db, "Acme");
        await storeLabelRecords(test.db, projectId, [messageRecord()]);

        expect(await findMessageRecord(test.db, projectId, REF)).toEqual(messageRecord());
    });

    it("leaves out a missing step and missing tools", async () => {
        const projectId = await createProject(test.db, "Acme");
        await storeLabelRecords(test.db, projectId, [messageRecord({ stepId: undefined, tools: undefined })]);

        const found = await findMessageRecord(test.db, projectId, REF);

        expect(found).not.toHaveProperty("stepId");
        expect(found).not.toHaveProperty("tools");
    });

    it("finds nothing for an unknown reference or another project", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await storeLabelRecords(test.db, one, [messageRecord()]);

        expect(await findMessageRecord(test.db, one, "f".repeat(16))).toBeUndefined();
        expect(await findMessageRecord(test.db, two, REF)).toBeUndefined();
    });
});

describe("findMemoryRecords", () => {
    it("returns untrusted labels first, then the newest", async () => {
        const projectId = await createProject(test.db, "Acme");
        const old = memoryRecord();
        const recent = memoryRecord({ agent: "support", label: { ...memoryRecord().label, origins: ["tool:crm"] } });
        const untrusted = memoryRecord({ label: UNTRUSTED, values: [valueRecord()] });
        await storeLabelRecords(test.db, projectId, [old, recent, untrusted]);
        await writtenAt(projectId, old, 1);
        await writtenAt(projectId, recent, 2);
        await writtenAt(projectId, untrusted, 0);

        expect(await findMemoryRecords(test.db, projectId, PRINT)).toEqual([untrusted, recent, old]);
    });

    it("returns at most 20 records", async () => {
        const projectId = await createProject(test.db, "Acme");
        const labels = Array.from({ length: 25 }, (_, n) =>
            memoryRecord({ label: { ...UNTRUSTED, origins: [`web:site-${n}.com`] } }),
        );
        await storeLabelRecords(test.db, projectId, labels);

        expect(await findMemoryRecords(test.db, projectId, PRINT)).toHaveLength(20);
    });

    it("finds nothing for unknown content or another project", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await storeLabelRecords(test.db, one, [memoryRecord()]);

        expect(await findMemoryRecords(test.db, one, "f".repeat(64))).toEqual([]);
        expect(await findMemoryRecords(test.db, two, PRINT)).toEqual([]);
    });
});
