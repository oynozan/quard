import { describe, expect, it } from "vitest";
import { costOf, priceOf } from "./models.ts";

describe("priceOf", () => {
    it("finds a model by name, also with a date suffix or other case", () => {
        expect(priceOf("gpt-5.4-mini")).toEqual({ input: 0.75, cachedInput: 0.075, output: 4.5 });
        expect(priceOf(" GPT-5.4-mini-2026-03-17 ")).toEqual(priceOf("gpt-5.4-mini"));
    });

    it("knows nothing about other models, or names that only look like keys", () => {
        expect(priceOf("my-local-model")).toBeUndefined();
        expect(priceOf("constructor")).toBeUndefined();
    });
});

describe("costOf", () => {
    it("bills fresh input, cached input and output at their own prices", () => {
        // 1M fresh input at $0.75, 1M cached at $0.075 and 1M output at $4.50
        expect(
            costOf("gpt-5.4-mini", { inputTokens: 2_000_000, cachedTokens: 1_000_000, outputTokens: 1_000_000 }),
        ).toBe(5.325);
    });

    it("rounds a small call to a hundredth of a cent", () => {
        expect(costOf("gpt-5.4-mini", { inputTokens: 1234, cachedTokens: 0, outputTokens: 56 })).toBe(0.0012);
    });

    it("never counts more cached tokens than input tokens", () => {
        expect(costOf("gpt-5", { inputTokens: 10, cachedTokens: 50, outputTokens: 0 })).toBe(0);
    });

    it("returns null for a model without a known price", () => {
        expect(costOf("my-local-model", { inputTokens: 1, cachedTokens: 0, outputTokens: 1 })).toBeNull();
    });
});
