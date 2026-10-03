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
