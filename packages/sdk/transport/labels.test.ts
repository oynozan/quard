import { describe, expect, it } from "vitest";
import { lookupLabels, storeLabels } from "./labels.ts";

describe("label transport placeholders", () => {
    it("stores nothing and finds nothing without a backend", async () => {
        expect(await storeLabels([])).toBe(true);
        expect(
            await storeLabels([
                {
                    kind: "memory",
                    store: "notes",
                    print: "a".repeat(64),
                    runId: "b".repeat(32),
                    agent: "a",
                    label: { trust: "trusted", sensitivity: "internal", origins: [], flagged: false },
                    values: [],
                },
            ]),
        ).toBe(false);
        expect(await lookupLabels({ kind: "message", ref: "c".repeat(16) })).toBeUndefined();
    });
});
