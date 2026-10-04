export const NOT_A_TOOL_RESULT =
    "Replay limited: the suspect content is not a tool result in the turning-point request";

export const REMOVED = "[Removed for replay]";

type Item = { type?: unknown; call_id?: unknown } | null;

function resultOf(callId: string): (item: unknown) => boolean {
    return (item) => (item as Item)?.type === "function_call_output" && (item as Item)?.call_id === callId;
}

// The input with the first suspect tool result it holds left out, and that result's call id
export function withoutContent(input: unknown[], callIds: string[]): { input: unknown[]; callId: string } | undefined {
    const callId = callIds.find((id) => input.some(resultOf(id)));
    if (callId === undefined) {
        return undefined;
    }
    // The function call that asked for the result stays
    const suspect = resultOf(callId);
    return { callId, input: input.map((item) => (suspect(item) ? { ...(item as object), output: REMOVED } : item)) };
}
