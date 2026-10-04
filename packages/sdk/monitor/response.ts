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

function outputOf(response: unknown): unknown[] {
    const output = asRecord(response)?.output;
    return Array.isArray(output) ? output : [];
}

export function functionCallsOf(response: unknown): FunctionCall[] {
    return outputOf(response)
        .map(functionCallOf)
        .filter((call): call is FunctionCall => call !== undefined);
}

// The output_text parts of the assistant messages in a response
export function outputTextOf(response: unknown): string[] {
    return outputOf(response).flatMap((item) => {
        const message = asRecord(item);
        if (message?.type !== "message" || message.role !== "assistant" || !Array.isArray(message.content)) {
            return [];
        }
        return message.content.flatMap((part) => {
            const text = asRecord(part);
            return text?.type === "output_text" && typeof text.text === "string" ? [text.text] : [];
        });
    });
}

export function responseIdOf(response: unknown): string | undefined {
    const id = asRecord(response)?.id;
    return typeof id === "string" ? id : undefined;
}
