import type { ContextLabelRecord, ValueRecord } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { mergeLabels, type MemoryLabels } from "./merge.ts";

const STEP = "00f067aa0ba902b7";

function label(fields: Partial<ContextLabelRecord> = {}): ContextLabelRecord {
    return { trust: "trusted", sensitivity: "public", origins: [], flagged: false, ...fields };
}

function value(hash: string, fields: Partial<ValueRecord> = {}): ValueRecord {
    return { hash, origin: "tool:crm", trust: "trusted", sensitivity: "public", flags: [], stepId: STEP, ...fields };
}

function labels(fields: Partial<ContextLabelRecord> = {}, values: ValueRecord[] = []): MemoryLabels {
    return { label: label(fields), values };
}

describe("mergeLabels", () => {
    it("keeps the least trusted and most sensitive label, from either side", () => {
        const loose = labels({ origins: ["tool:crm"] });
        const strict = labels({ trust: "untrusted", sensitivity: "internal", origins: ["web:a.com", "tool:crm"] });

        expect(mergeLabels(loose, strict).label).toEqual({
            trust: "untrusted",
            sensitivity: "internal",
            origins: ["tool:crm", "web:a.com"],
            flagged: false,
        });
        expect(mergeLabels(strict, loose).label).toMatchObject({ trust: "untrusted", sensitivity: "internal" });
        expect(mergeLabels(loose, loose).label).toMatchObject({ trust: "trusted", sensitivity: "public" });
    });

    it("stays flagged when either side was", () => {
        expect(mergeLabels(labels({ flagged: true }), labels()).label.flagged).toBe(true);
        expect(mergeLabels(labels(), labels({ flagged: true })).label.flagged).toBe(true);
    });

    it("lists at most 200 origins", () => {
        const many = (from: number) => Array.from({ length: 150 }, (_, i) => `web:site${from + i}.com`);
        const merged = mergeLabels(labels({ origins: many(0) }), labels({ origins: many(150) }));

        expect(merged.label.origins).toHaveLength(200);
        expect(merged.label.origins[199]).toBe("web:site199.com");
    });

    it("keeps values of both sides and merges the same value to its least trusted label", () => {
        const a = "a".repeat(32);
        const b = "b".repeat(32);
        const c = "c".repeat(32);
        const web = value(a, { origin: "web:evil.com", trust: "untrusted", flags: ["instructions"] });
        const crm = value(a, { sensitivity: "internal", flags: ["instructions", "signature:x"] });

        const merged = mergeLabels(labels({}, [crm, value(b)]), labels({}, [web, value(c)]));

        expect(merged.values).toEqual([
            {
                ...web,
                sensitivity: "internal",
                flags: ["instructions", "signature:x"],
            },
            value(b),
            value(c),
        ]);
        // The order of the two sides does not change the outcome
        expect(mergeLabels(labels({}, [web]), labels({}, [crm])).values[0]).toMatchObject({
            origin: "web:evil.com",
            trust: "untrusted",
            sensitivity: "internal",
        });
    });

    it("ranks an internal value above a public one when both are trusted", () => {
        const a = "a".repeat(32);
        const pub = value(a, { origin: "tool:public" });
        const internal = value(a, { origin: "tool:crm", sensitivity: "internal" });

        expect(mergeLabels(labels({}, [pub]), labels({}, [internal])).values[0]?.origin).toBe("tool:crm");
        expect(mergeLabels(labels({}, [internal]), labels({}, [pub])).values[0]?.origin).toBe("tool:crm");
    });
});
