import { afterEach, describe, expect, it } from "vitest";
import { clearMemory, keepLabels, keptLabels } from "./kept.ts";
import type { MemoryLabels } from "./merge.ts";

const trusted: MemoryLabels = {
    label: { trust: "trusted", sensitivity: "internal", origins: ["tool:crm"], flagged: false },
    values: [],
};
const untrusted: MemoryLabels = {
    label: { trust: "untrusted", sensitivity: "public", origins: ["web:evil.com"], flagged: false },
    values: [],
};

afterEach(() => {
    clearMemory();
});

describe("kept memory labels", () => {
    it("finds the labels kept for a print", () => {
        keepLabels("p1", trusted);

        expect(keptLabels("p1")).toBe(trusted);
        expect(keptLabels("p2")).toBeUndefined();
    });

    it("merges a second write of the same content to the least trusted labels", () => {
        keepLabels("p1", trusted);
        keepLabels("p1", untrusted);

        expect(keptLabels("p1")?.label).toEqual({
            trust: "untrusted",
            sensitivity: "internal",
            origins: ["tool:crm", "web:evil.com"],
            flagged: false,
        });
    });

    it("keeps at most 10,000 prints and drops the oldest", () => {
        for (let i = 0; i <= 10_000; i += 1) {
            keepLabels(`p${i}`, trusted);
        }

        expect(keptLabels("p0")).toBeUndefined();
        expect(keptLabels("p1")).toBeDefined();
        expect(keptLabels("p10000")).toBeDefined();
    });

    it("forgets everything when cleared", () => {
        keepLabels("p1", trusted);
        clearMemory();

        expect(keptLabels("p1")).toBeUndefined();
    });
});
