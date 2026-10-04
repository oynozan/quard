import { describe, expect, it } from "vitest";
import { costOf, priceOf, usageOf } from "./models.ts";

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

    it("keeps a small call to the micro-dollar, so a cheap model call is never free", () => {
        expect(costOf("gpt-5.4-mini", { inputTokens: 1234, cachedTokens: 0, outputTokens: 56 })).toBe(0.001178);
        // 138 input and 61 output tokens of gpt-5-nano cost $0.0000313
        expect(costOf("gpt-5-nano", { inputTokens: 138, cachedTokens: 0, outputTokens: 61 })).toBe(0.000031);
    });

    it("never bills fresh input below zero when more tokens were cached than sent", () => {
        expect(costOf("gpt-5", { inputTokens: 10, cachedTokens: 50, outputTokens: 0 })).toBe(0.000006);
    });

    it("returns null for a model without a known price", () => {
        expect(costOf("my-local-model", { inputTokens: 1, cachedTokens: 0, outputTokens: 1 })).toBeNull();
    });
});

describe("usageOf", () => {
    it("reads token usage, with cached tokens when sent", () => {
        const usage = { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 100 } };

        expect(usageOf({ usage })).toEqual({ inputTokens: 120, cachedTokens: 100, outputTokens: 30 });
        expect(usageOf({ usage: { input_tokens: 5, output_tokens: 1 } })).toEqual({
            inputTokens: 5,
            cachedTokens: 0,
            outputTokens: 1,
        });
    });

    it("finds no usage when the counts are missing or not numbers", () => {
        expect(usageOf({})).toBeUndefined();
        expect(usageOf(null)).toBeUndefined();
        expect(usageOf({ usage: { input_tokens: "5", output_tokens: 1 } })).toBeUndefined();
        expect(usageOf({ usage: { input_tokens: 5 } })).toBeUndefined();
    });
});
