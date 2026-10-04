import { costOf, priceOf, usageOf } from "@quard/shared";

export type OpenAiConfig = { apiKey: string; baseUrl: string };

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export type ModelAnswer = { output: unknown[]; text: string; costUsd: number };

// Node's fetch alone would wait about 5 minutes for an answer
export const TIMEOUT_MS = 2 * 60_000;
export const TIMED_OUT = "The model did not answer within 2 minutes";
// The waits before each new try after a 429 or 5xx answer
export const BACKOFF_MS = [1_000, 2_000];

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

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// One POST per try, each with its own time limit, which also covers reading the answer
async function post(config: OpenAiConfig, body: Record<string, unknown>, fetch: Fetch): Promise<Response> {
    for (let tries = 0; ; tries += 1) {
        const response = await fetch(`${config.baseUrl}/responses`, {
            method: "POST",
            headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const backoff = BACKOFF_MS[tries];
        if (backoff === undefined || (response.status !== 429 && response.status < 500)) {
            return response;
        }
        await response.body?.cancel();
        await wait(backoff);
    }
}

async function answerOf(model: string, response: Response): Promise<ModelAnswer> {
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
    try {
        return await answerOf(model, await post(config, body, fetch));
    } catch (error) {
        throw error instanceof DOMException && error.name === "TimeoutError" ? new Error(TIMED_OUT) : error;
    }
}
