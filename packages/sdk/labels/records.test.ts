import { keyedHash, parseHashKey, type LabelRecord, type MessageRecord } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const lookups = vi.hoisted(() => ({ answer: undefined as LabelRecord[] | undefined, calls: [] as unknown[] }));

vi.mock("../transport/labels.ts", () => ({
    lookupLabels: async (target: unknown) => {
        lookups.calls.push(target);
        return lookups.answer;
    },
}));

const { configure, resetConfig } = await import("../core/config.ts");
const { newRun } = await import("../context/run.ts");
const { clearRecords, findRecord, forgetRuns, isLabelRef, keptRun, recordValues, saveRecord } =
    await import("./records.ts");

const KEY = "ab".repeat(32);
const IBAN = "DE89370400440532013000";
const label = { trust: "trusted" as const, sensitivity: "internal" as const, origins: [], flagged: false };
const value = {
    type: "iban" as const,
    value: IBAN,
    key: `iban:${IBAN}`,
    origin: "web:evil.com",
    trust: "untrusted" as const,
    sensitivity: "public" as const,
    flags: [],
    stepId: "1".repeat(16),
};

function ref(n: number): string {
    return n.toString(16).padStart(16, "0");
}

function sent(id: string, runId: string, values = [value]) {
    return {
        ref: id,
        runId,
        stepId: undefined,
        sender: "orchestrator",
        depth: 0,
        print: "p".repeat(64),
        label,
        values,
        tools: undefined,
    };
}

function stored(id: string): MessageRecord {
    return {
        kind: "message",
        ref: id,
        runId: "b".repeat(32),
        sender: "far",
        depth: 2,
        print: "c".repeat(64),
        label,
        values: [],
    };
}

afterEach(() => {
    clearRecords();
    resetConfig();
    lookups.answer = undefined;
    lookups.calls = [];
});

describe("label records", () => {
    it("finds a saved record with its raw values and keeps the sender's run", async () => {
        const run = newRun();
        saveRecord(sent(ref(1), run.runId), run);

        expect(await findRecord(ref(1))).toMatchObject({ record: { sender: "orchestrator" }, values: [value] });
        expect(keptRun(run.runId)).toBe(run);
    });

    it("returns the record as it is stored elsewhere, its values hashed", () => {
        const run = newRun();
        expect(saveRecord(sent(ref(1), run.runId), run).values).toEqual([]);

        configure({ hashKey: KEY });

        expect(saveRecord(sent(ref(2), run.runId), run).values).toEqual([
            {
                hash: keyedHash(parseHashKey(KEY), "iban", IBAN),
                origin: "web:evil.com",
                trust: "untrusted",
                sensitivity: "public",
                flags: [],
                stepId: "1".repeat(16),
            },
        ]);
    });

    it("forgets the kept runs but not the records", async () => {
        const run = newRun();
        saveRecord(sent(ref(1), run.runId), run);

        forgetRuns();

        expect(keptRun(run.runId)).toBeUndefined();
        expect(await findRecord(ref(1))).toBeDefined();
    });

    it("keeps at most 10,000 records and drops the oldest", async () => {
        const run = newRun();
        for (let i = 0; i <= 10_000; i += 1) {
            saveRecord(sent(ref(i), run.runId, []), run);
        }

        expect(await findRecord(ref(0))).toBeUndefined();
        expect(await findRecord(ref(1))).toBeDefined();
        expect(await findRecord(ref(10_000))).toBeDefined();
    });

    it("keeps at most 10,000 runs, and a run that sends again counts as new", () => {
        const first = newRun();
        saveRecord(sent(ref(1), first.runId, []), first);
        const second = newRun();
        saveRecord(sent(ref(2), second.runId, []), second);
        saveRecord(sent(ref(3), first.runId, []), first);
        for (let i = 0; i < 9_999; i += 1) {
            const run = newRun();
            saveRecord(sent(ref(10 + i), run.runId, []), run);
        }

        expect(keptRun(second.runId)).toBeUndefined();
        expect(keptRun(first.runId)).toBe(first);
    });

    it("clears records and runs", async () => {
        const run = newRun();
        saveRecord(sent(ref(1), run.runId), run);

        clearRecords();

        expect(await findRecord(ref(1))).toBeUndefined();
        expect(keptRun(run.runId)).toBeUndefined();
    });
});

describe("findRecord", () => {
    it("asks control for a record made in another process", async () => {
        lookups.answer = [{ ...stored(ref(9)), kind: "message" }, stored(ref(5))];

        expect(await findRecord(ref(5))).toEqual({ record: stored(ref(5)), values: undefined });
        expect(lookups.calls).toEqual([{ kind: "message", ref: ref(5) }]);
    });

    it("finds nothing when control has no such record or can't answer", async () => {
        lookups.answer = [{ ...stored(ref(9)) }];
        expect(await findRecord(ref(5))).toBeUndefined();

        lookups.answer = undefined;
        expect(await findRecord(ref(5))).toBeUndefined();
    });

    it("asks nothing for a reference that can't be one", async () => {
        expect(await findRecord("not-a-ref")).toBeUndefined();
        expect(lookups.calls).toEqual([]);
        expect(isLabelRef(ref(1))).toBe(true);
        expect(isLabelRef("ABCDEF0123456789")).toBe(false);
    });
});

describe("recordValues", () => {
    it("uses the raw values of a record made here", () => {
        expect(recordValues({ record: stored(ref(1)), values: [value] }, "no values here")).toEqual([value]);
    });

    it("matches the hashed values of a record from control against the message", () => {
        configure({ hashKey: KEY });
        const hash = keyedHash(parseHashKey(KEY), "iban", IBAN);
        const { origin, trust, sensitivity, flags, stepId } = value;
        const record = { ...stored(ref(1)), values: [{ hash, origin, trust, sensitivity, flags, stepId }] };

        expect(recordValues({ record, values: undefined }, `Pay ${IBAN}`)).toEqual([value]);
    });
});
