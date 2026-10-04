import { keyText } from "@quard/shared";
import { asRecord, parseJson } from "./json.ts";

export type InputText = { role: "user" | "system"; text: string } | { role: "tool"; text: string; callId: string };

export type ResponsesRequest = {
    model: string;
    instructions: string | undefined;
    // Function tools by name, hosted tools by type
    tools: string[];
    stream: boolean;
    previousResponseId: string | undefined;
    conversationId: string | undefined;
    texts: InputText[];
    // Tool call ids in the input, which tie it to an earlier run
    callIds: string[];
    // The body cut to what a replay resends
    replayBody: Record<string, unknown>;
    // The whole body, which hosted tool rules may reshape
    body: Record<string, unknown>;
};

// Never stream, store, metadata, user, include and the like
const REPLAY_FIELDS = new Set([
    "model",
    "instructions",
    "input",
    "tools",
    "tool_choice",
    "parallel_tool_calls",
    "temperature",
    "top_p",
    "reasoning",
    "text",
    "max_output_tokens",
    "max_tool_calls",
    "truncation",
    "top_logprobs",
    "prompt",
    "previous_response_id",
    "conversation",
]);

function contentText(content: unknown): string {
    if (typeof content === "string") {
        return content;
    }
    if (!Array.isArray(content)) {
        return "";
    }
    return content
        .map((part) => asRecord(part)?.text)
        .filter((text): text is string => typeof text === "string")
        .join("\n");
}

function outputText(output: unknown): string {
    return typeof output === "string" ? keyText(output) : contentText(output);
}

function readItem(item: unknown, request: ResponsesRequest): void {
    const record = asRecord(item);
    if (record === undefined) {
        return;
    }
    if (record.type === "function_call_output") {
        const callId = String(record.call_id);
        request.callIds.push(callId);
        request.texts.push({ role: "tool", text: outputText(record.output), callId });
    } else if (record.type === "function_call") {
        request.callIds.push(String(record.call_id));
    } else if (record.role === "user") {
        request.texts.push({ role: "user", text: contentText(record.content) });
    } else if (record.role === "system" || record.role === "developer") {
        request.texts.push({ role: "system", text: contentText(record.content) });
    }
    // Assistant messages are the model's own words, so they are not indexed
}

function toolNames(tools: unknown): string[] {
    if (!Array.isArray(tools)) {
        return [];
    }
    return tools.flatMap((tool) => {
        const item = asRecord(tool);
        const name = item?.name ?? item?.type;
        return typeof name === "string" ? [name] : [];
    });
}

function conversationOf(value: unknown): string | undefined {
    const id = typeof value === "string" ? value : asRecord(value)?.id;
    return typeof id === "string" ? id : undefined;
}

export function parseRequest(body: Record<string, unknown>): ResponsesRequest {
    const request: ResponsesRequest = {
        model: typeof body.model === "string" ? body.model : "unknown",
        instructions: typeof body.instructions === "string" ? body.instructions : undefined,
        tools: toolNames(body.tools),
        stream: body.stream === true,
        previousResponseId: typeof body.previous_response_id === "string" ? body.previous_response_id : undefined,
        conversationId: conversationOf(body.conversation),
        texts: [],
        callIds: [],
        replayBody: Object.fromEntries(Object.entries(body).filter(([name]) => REPLAY_FIELDS.has(name))),
        body,
    };
    if (request.instructions !== undefined) {
        request.texts.push({ role: "system", text: request.instructions });
    }
    if (typeof body.input === "string") {
        request.texts.push({ role: "user", text: body.input });
    } else if (Array.isArray(body.input)) {
        for (const item of body.input) {
            readItem(item, request);
        }
    }
    return request;
}

// The body as text, when it can be read without using it up
async function bodyText(input: string | URL | Request, init: RequestInit | undefined): Promise<string | undefined> {
    const body = init?.body;
    if (typeof body === "string") {
        return body;
    }
    if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
        return new TextDecoder().decode(body);
    }
    if (body instanceof Blob) {
        return body.text();
    }
    if (body === undefined && input instanceof Request) {
        return input.clone().text();
    }
    return undefined;
}

// A POST to the Responses API: its parsed body, "unreadable" when the
// body can't be read, or undefined for any other request
export async function readResponsesRequest(
    input: string | URL | Request,
    init: RequestInit | undefined,
): Promise<ResponsesRequest | "unreadable" | undefined> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method.toUpperCase() !== "POST" || !new URL(url).pathname.endsWith("/responses")) {
        return undefined;
    }
    const text = await bodyText(input, init);
    const body = asRecord(text === undefined ? undefined : parseJson(text));
    return body === undefined ? "unreadable" : parseRequest(body);
}
