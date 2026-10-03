import type { TokenUsage } from "@quard/shared";
import { asRecord } from "./json.ts";

export type FunctionCall = {
    callId: string;
    name: string;
    arguments: string;
};

export function functionCallOf(item: unknown): FunctionCall | undefined {
    const record = asRecord(item);
    if (record?.type !== "function_call") {
        return undefined;
    }
    return {
        callId: String(record.call_id),
        name: String(record.name),
        arguments: typeof record.arguments === "string" ? record.arguments : "{}",
    };
}

export function functionCallsOf(response: unknown): FunctionCall[] {
    const output = asRecord(response)?.output;
    if (!Array.isArray(output)) {
        return [];
    }
    return output.map(functionCallOf).filter((call): call is FunctionCall => call !== undefined);
}

export function responseIdOf(response: unknown): string | undefined {
    const id = asRecord(response)?.id;
    return typeof id === "string" ? id : undefined;
}

// Token counts from a finished response, when the API sent them
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
