import { BLOCKED_ERROR_TYPE } from "../core/refusal.ts";

// What a signed payment no x402 guard checked gets instead of being sent
export const UNGUARDED_TEXT =
    "Blocked by Quard: no x402 guard checked this payment. The x402 payment did NOT happen. Do not retry it.";

export const UNGUARDED_REASON = "unguarded";

// A 403, not a 402: a 402 would invite the caller to pay again
export function unguardedResponse(): Response {
    const error = { message: UNGUARDED_TEXT, type: BLOCKED_ERROR_TYPE, code: "unguarded_x402", param: null };
    return new Response(JSON.stringify({ error }), {
        status: 403,
        headers: { "content-type": "application/json", "x-should-retry": "false" },
    });
}

// An MCP tool's error result, which the model reads
export function unguardedResult(): { content: { type: "text"; text: string }[]; isError: true } {
    return { content: [{ type: "text", text: UNGUARDED_TEXT }], isError: true };
}
