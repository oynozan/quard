import { textOf } from "../labels/text-of.ts";
import { asRecord, parseJson } from "./json.ts";

export type InputText = { role: "user" | "system"; text: string } | { role: "tool"; text: string; callId: string };

export type ResponsesRequest = {
    model: string;
    stream: boolean;
    previousResponseId: string | undefined;
    conversationId: string | undefined;
    texts: InputText[];
    // Tool call ids in the input, which tie it to an earlier run
    callIds: string[];
};

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

// Tool results are often JSON text, so read the text inside
function outputText(output: unknown): string {
    if (typeof output !== "string") {
        return contentText(output);
    }
    const parsed = parseJson(output);
    return parsed !== null && typeof parsed === "object" ? textOf(parsed) : output;
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

function conversationOf(value: unknown): string | undefined {
    const id = typeof value === "string" ? value : asRecord(value)?.id;
    return typeof id === "string" ? id : undefined;
}

export function parseRequest(body: Record<string, unknown>): ResponsesRequest {
    const request: ResponsesRequest = {
        model: typeof body.model === "string" ? body.model : "unknown",
        stream: body.stream === true,
        previousResponseId: typeof body.previous_response_id === "string" ? body.previous_response_id : undefined,
        conversationId: conversationOf(body.conversation),
        texts: [],
        callIds: [],
    };
    if (typeof body.instructions === "string") {
        request.texts.push({ role: "system", text: body.instructions });
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
