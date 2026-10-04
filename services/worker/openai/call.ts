import { costOf, priceOf, usageOf } from "@quard/shared";

export type OpenAiConfig = { apiKey: string; baseUrl: string };

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export type ModelAnswer = { output: unknown[]; text: string; costUsd: number };

type Part = { type?: unknown; text?: unknown; content?: unknown } | null;

// The text of the assistant messages in a response's output
function textIn(output: unknown[]): string {
    return output
        .flatMap((item) => {
            const content = (item as Part)?.content;
            return Array.isArray(content) ? (content as Part[]) : [];
        })
        .flatMap((part) => (part?.type === "output_text" && typeof part.text === "string" ? [part.text] : []))
        .join("");
}

// One Responses API call, priced. Throws when it fails, or when it can't be
// priced: every call must count toward the incident's cap.
export async function callModel(
    config: OpenAiConfig,
    body: Record<string, unknown>,
    fetch: Fetch = globalThis.fetch,
): Promise<ModelAnswer> {
    const model = String(body.model);
    if (priceOf(model) === undefined) {
        throw new Error(`No price is known for the model ${model}, so the cost cap could not hold`);
    }
    const response = await fetch(`${config.baseUrl}/responses`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`The model call failed with status ${response.status}`);
    }
    const answer = (await response.json()) as { output?: unknown };
    const usage = usageOf(answer);
    if (usage === undefined) {
        throw new Error("The model call reported no token usage, so the cost cap could not hold");
    }
    const output = Array.isArray(answer.output) ? (answer.output as unknown[]) : [];
    return { output, text: textIn(output), costUsd: Number(costOf(model, usage)) };
}
