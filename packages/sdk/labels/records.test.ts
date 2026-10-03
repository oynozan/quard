import { afterEach, describe, expect, it } from "vitest";
import { newRun } from "../context/run.ts";
import { clearRecords, findRecord, forgetRuns, keptRun, saveRecord, type LabelRecord } from "./records.ts";

const label = { trust: "trusted" as const, sensitivity: "internal" as const, origins: [], flagged: false };

function makeRecord(ref: string, runId: string): LabelRecord {
    return { ref, runId, stepId: undefined, sender: "orchestrator", depth: 0, print: "p", label, values: [] };
}

afterEach(() => {
    clearRecords();
});

describe("label records", () => {
    it("finds a saved record and keeps the sender's run", () => {
        const run = newRun();
        saveRecord(makeRecord("r1", run.runId), run);

        expect(findRecord("r1")?.sender).toBe("orchestrator");
        expect(findRecord("r2")).toBeUndefined();
        expect(keptRun(run.runId)).toBe(run);
    });

    it("forgets the kept runs but not the records", () => {
        const run = newRun();
        saveRecord(makeRecord("r1", run.runId), run);

        forgetRuns();

        expect(keptRun(run.runId)).toBeUndefined();
        expect(findRecord("r1")).toBeDefined();
    });

    it("keeps at most 10,000 records and drops the oldest", () => {
        const run = newRun();
        for (let i = 0; i <= 10_000; i += 1) {
            saveRecord(makeRecord(`r${i}`, run.runId), run);
        }

        expect(findRecord("r0")).toBeUndefined();
        expect(findRecord("r1")).toBeDefined();
        expect(findRecord("r10000")).toBeDefined();
    });

    it("keeps at most 10,000 runs, and a run that sends again counts as new", () => {
        const first = newRun();
        saveRecord(makeRecord("a", first.runId), first);
        const second = newRun();
        saveRecord(makeRecord("b", second.runId), second);
        saveRecord(makeRecord("c", first.runId), first);
        for (let i = 0; i < 9_999; i += 1) {
            const run = newRun();
            saveRecord(makeRecord(`r${i}`, run.runId), run);
        }

        expect(keptRun(second.runId)).toBeUndefined();
        expect(keptRun(first.runId)).toBe(first);
    });

    it("clears records and runs", () => {
        const run = newRun();
        saveRecord(makeRecord("r1", run.runId), run);

        clearRecords();

        expect(findRecord("r1")).toBeUndefined();
        expect(keptRun(run.runId)).toBeUndefined();
    });
});
