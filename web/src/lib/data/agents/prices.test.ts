// @vitest-environment node
import { describe, expect, it } from "vitest";
import { costOf, MODEL_PRICES, REVIEWER_MODEL } from "./prices";

describe("costOf", () => {
    it("prices a million fresh input tokens at the model's input rate", () => {
        expect(costOf("gpt-6.1", 1_000_000, 0, 0)).toBe(2);
    });

    it("charges cached tokens at the cached rate and output at the output rate", () => {
        // 600 fresh x 2.0 + 400 cached x 0.2 + 200 output x 8.0, per million.
        expect(costOf("gpt-6.1", 1000, 400, 200)).toBe(0.00288);
    });

    it("never counts fresh input below zero when more tokens are cached than sent", () => {
        expect(costOf("gpt-6.1", 100, 300, 0)).toBe(0.00006);
    });

    it("rounds to a millionth of a dollar", () => {
        expect(costOf("gpt-6.1-mini", 1, 0, 0)).toBe(0);
        expect(costOf("gpt-6.1-sol", 3, 0, 0)).toBe(0.000015);
    });

    it("costs nothing for a model with no price", () => {
        expect(costOf("unknown-model", 1_000_000, 0, 1_000_000)).toBe(0);
    });
});

describe("REVIEWER_MODEL", () => {
    it("has a price, so reviewer cost can be estimated", () => {
        expect(MODEL_PRICES[REVIEWER_MODEL]).toEqual({ input: 5, cachedInput: 0.5, output: 20 });
    });
});
