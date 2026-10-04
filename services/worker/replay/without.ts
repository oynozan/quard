export const NOT_A_TOOL_RESULT =
    "Replay limited: the suspect content is not a tool result in the turning-point request";

export const REMOVED = "[Removed for replay]";

type Item = { type?: unknown; call_id?: unknown } | null;

// The input with the suspect tool result's output removed. The function call
// that asked for it stays. Undefined when the input holds no such result.
export function withoutContent(input: unknown[], callId: string | null): unknown[] | undefined {
    const suspect = (item: unknown) =>
        callId !== null && (item as Item)?.type === "function_call_output" && (item as Item)?.call_id === callId;
    if (!input.some(suspect)) {
        return undefined;
    }
    return input.map((item) => (suspect(item) ? { ...(item as object), output: REMOVED } : item));
}
