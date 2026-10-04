import type { ContextLabelRecord } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryRecord, messageRecord, PRINT, REF, UNTRUSTED, valueRecord } from "../../test/labels.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { findMemoryRecords, findMessageRecord } from "./find.ts";
import { storeLabelRecords } from "./store.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

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
    it("returns the one record every write of an item merged into", async () => {
        const projectId = await createProject(test.db, "Acme");
        const crm = memoryRecord({ agent: "support", label: { ...memoryRecord().label, origins: ["tool:crm"] } });
        const untrusted = memoryRecord({ label: UNTRUSTED, values: [valueRecord()] });
        await storeLabelRecords(test.db, projectId, [memoryRecord(), crm]);
        await storeLabelRecords(test.db, projectId, [untrusted]);

        expect(await findMemoryRecords(test.db, projectId, PRINT)).toEqual([
            memoryRecord({
                label: {
                    trust: "untrusted",
                    sensitivity: "internal",
                    origins: ["user", "tool:crm", "web:acme-billing.net"],
                    flagged: true,
                },
                values: [valueRecord()],
            }),
        ]);
    });

    it("keeps a flagged internal label written before 20 newer untrusted public ones", async () => {
        const projectId = await createProject(test.db, "Acme");
        const flagged: ContextLabelRecord = {
            trust: "untrusted",
            sensitivity: "internal",
            origins: ["tool:crm"],
            flagged: true,
        };
        await storeLabelRecords(test.db, projectId, [memoryRecord({ label: flagged })]);
        for (let n = 0; n < 20; n++) {
            const label: ContextLabelRecord = { ...UNTRUSTED, origins: [`web:site-${n}.com`], flagged: false };
            await storeLabelRecords(test.db, projectId, [memoryRecord({ label })]);
        }

        const labels = (await findMemoryRecords(test.db, projectId, PRINT)).map((record) => record.label);

        expect(labels).toHaveLength(1);
        expect(labels[0]).toMatchObject({ trust: "untrusted", sensitivity: "internal", flagged: true });
        expect(labels[0]?.origins).toHaveLength(21);
    });

    it("finds nothing for unknown content or another project", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await storeLabelRecords(test.db, one, [memoryRecord()]);

        expect(await findMemoryRecords(test.db, one, "f".repeat(64))).toEqual([]);
        expect(await findMemoryRecords(test.db, two, PRINT)).toEqual([]);
    });
});
