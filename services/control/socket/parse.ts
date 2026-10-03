import { clientMessage, type ClientMessage } from "@quard/shared";

export type Parsed = { ok: true; message: ClientMessage } | { ok: false; error: string; id: string | undefined };

const MAX_ISSUES = 3;

function readJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

// The request a message is about, for the error that answers it
export function replyId(value: unknown): string | undefined {
    if (typeof value !== "object" || value === null) {
        return undefined;
    }
    const fields = value as { id?: unknown; askId?: unknown };
    const id = fields.id ?? fields.askId;
    return typeof id === "string" ? id : undefined;
}

export function parseMessage(text: string): Parsed {
    const value = readJson(text);
    if (value === undefined) {
        return { ok: false, error: "The message is not valid JSON", id: undefined };
    }
    const parsed = clientMessage.safeParse(value);
    if (parsed.success) {
        return { ok: true, message: parsed.data };
    }
    const issues = parsed.error.issues
        .slice(0, MAX_ISSUES)
        .map((issue) => [issue.path.map(String).join("."), issue.message].filter(Boolean).join(": "));
    return { ok: false, error: issues.join("; "), id: replyId(value) };
}
