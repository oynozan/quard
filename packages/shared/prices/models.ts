// Standard OpenAI prices in USD per 1M tokens, from
// https://developers.openai.com/api/docs/pricing on 2026-10-03.
// Where no cached price is listed, cached input costs the input price.
export type ModelPrice = { input: number; cachedInput: number; output: number };

export type TokenUsage = { inputTokens: number; cachedTokens: number; outputTokens: number };

const price = (input: number, cachedInput: number, output: number): ModelPrice => ({ input, cachedInput, output });

const PRICES = new Map<string, ModelPrice>([
    ["gpt-6-astra", price(10, 1, 50)],
    ["gpt-6.1-sol", price(2, 0.1, 10)],
    ["gpt-6-luna", price(0.1, 0.01, 0.5)],
    ["gpt-6-sol", price(2, 0.2, 10)],
    ["gpt-5.6-sol", price(4, 0.4, 20)],
    ["gpt-5.6-terra", price(2, 0.2, 12)],
    ["gpt-5.6-luna", price(0.2, 0.02, 1.2)],
    ["gpt-5.5", price(5, 0.5, 30)],
    ["gpt-5.5-pro", price(30, 30, 180)],
    ["gpt-5.4", price(2.5, 0.25, 15)],
    ["gpt-5.4-mini", price(0.75, 0.075, 4.5)],
    ["gpt-5.4-nano", price(0.2, 0.02, 1.25)],
    ["gpt-5.4-pro", price(30, 30, 180)],
    ["gpt-5.2", price(1.75, 0.175, 14)],
    ["gpt-5.2-pro", price(21, 21, 168)],
    ["gpt-5.1", price(1.25, 0.125, 10)],
    ["gpt-5", price(1.25, 0.125, 10)],
    ["gpt-5-mini", price(0.25, 0.025, 2)],
    ["gpt-5-nano", price(0.05, 0.005, 0.4)],
    ["gpt-5-pro", price(15, 15, 120)],
]);

// The price of a model, also for dated names such as "gpt-5.4-mini-2026-03-17"
export function priceOf(model: string): ModelPrice | undefined {
    const name = model.trim().toLowerCase();
    return PRICES.get(name) ?? PRICES.get(name.replace(/-\d{4}-\d{2}-\d{2}$/, ""));
}

// What one model call cost in USD, to the micro-dollar, or null when the model's price
// is unknown. Cached tokens are part of the input count, billed at the cached price.
export function costOf(model: string, usage: TokenUsage): number | null {
    const known = priceOf(model);
    if (known === undefined) {
        return null;
    }
    const fresh = Math.max(0, usage.inputTokens - usage.cachedTokens);
    // Prices are per 1M tokens, so this sum is in micro-dollars
    const micro = fresh * known.input + usage.cachedTokens * known.cachedInput + usage.outputTokens * known.output;
    return Math.round(micro) / 1_000_000;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

// Token counts from a finished Responses API response, when the API sent them
export function usageOf(response: unknown): TokenUsage | undefined {
    const usage = asRecord(asRecord(response)?.usage);
    const input = usage?.input_tokens;
    const output = usage?.output_tokens;
    if (typeof input !== "number" || typeof output !== "number") {
        return undefined;
    }
    const cached = asRecord(usage?.input_tokens_details)?.cached_tokens;
    return { inputTokens: input, cachedTokens: typeof cached === "number" ? cached : 0, outputTokens: output };
}
