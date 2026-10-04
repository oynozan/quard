import type { ModelCallRecord } from "@quard/db";

export const NOT_RECORDED = "Replay limited: the turning-point request was not recorded";
export const NO_HISTORY = "Replay limited: earlier conversation history was not recorded";

type Body = Record<string, unknown>;

function itemsOf(input: unknown): unknown[] {
    if (typeof input === "string") {
        return [{ role: "user", content: input }];
    }
    return Array.isArray(input) ? input : [];
}

// The input of the call at `index`, with the responses it continued spelled
// out first. Undefined when some of that history was not recorded.
// ponytail: an earlier response's text and reasoning were not recorded, only
// its tool calls; record output items if replays need them.
function fullInput(calls: ModelCallRecord[], index: number, body: Body): unknown[] | undefined {
    if (body.conversation !== undefined && body.conversation !== null) {
        return undefined;
    }
    const own = itemsOf(body.input);
    const previous = body.previous_response_id;
    if (typeof previous !== "string") {
        return own;
    }
    // Only earlier calls, so a chain always ends
    const at = calls.slice(0, index).findIndex((call) => call.responseId === previous);
    const earlier = calls[at];
    const history = earlier?.requestBody ? fullInput(calls, at, earlier.requestBody) : undefined;
    if (earlier === undefined || history === undefined) {
        return undefined;
    }
    const asked = earlier.toolCalls.map((call) => ({
        type: "function_call",
        call_id: call.callId,
        name: call.name,
        arguments: call.arguments,
    }));
    return [...history, ...asked, ...own];
}

// The turning point's recorded request with its whole input, or why it can't be rebuilt
export function rebuildRequest(calls: ModelCallRecord[], stepId: string): Body | string {
    const index = calls.findIndex((call) => call.stepId === stepId);
    const body = calls[index]?.requestBody;
    if (!body) {
        return NOT_RECORDED;
    }
    const input = fullInput(calls, index, body);
    return input === undefined ? NO_HISTORY : { ...body, input };
}
