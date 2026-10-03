// USD per million tokens. Cost is estimated from token usage and this table.
export type ModelPrice = { input: number; cachedInput: number; output: number };

export const MODEL_PRICES: Record<string, ModelPrice> = {
    "gpt-6.1": { input: 2.0, cachedInput: 0.2, output: 8.0 },
    "gpt-6.1-mini": { input: 0.4, cachedInput: 0.04, output: 1.6 },
    "gpt-6.1-sol": { input: 5.0, cachedInput: 0.5, output: 20.0 },
    "gpt-6": { input: 2.5, cachedInput: 0.25, output: 10.0 },
    "gpt-6-mini": { input: 0.5, cachedInput: 0.05, output: 2.0 },
};

// The model the AI reviewer uses by default, PROJECT.md "AI reviewer".
export const REVIEWER_MODEL = "gpt-6.1-sol";

export function costOf(model: string, inputTokens: number, cachedTokens: number, outputTokens: number): number {
    const price = MODEL_PRICES[model];
    if (!price) return 0;
    const fresh = Math.max(0, inputTokens - cachedTokens);
    const usd = (fresh * price.input + cachedTokens * price.cachedInput + outputTokens * price.output) / 1_000_000;
    return Math.round(usd * 1_000_000) / 1_000_000;
}
