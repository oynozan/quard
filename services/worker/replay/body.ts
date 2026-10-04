import { CUT } from "@quard/shared";

type Body = Record<string, unknown>;

// The redactor cut the schemas of secret-named fields to "…", in tools
// and in text.format. Strict schemas need a type, and secrets are strings.
function repaired(value: unknown, parent = ""): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => repaired(item));
    }
    if (value === null || typeof value !== "object") {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [
            name,
            parent === "properties" && item === CUT ? { type: "string" } : repaired(item, name),
        ]),
    );
}

function typeOf(tool: unknown): string {
    return String((tool as { type?: unknown } | null)?.type);
}

// Hosted web search is left out. Hosted MCP tools must ask first, and are
// never approved: the approval request counts as the model's action.
function toolsOf(tools: unknown[]): unknown[] {
    return tools
        .filter((tool) => !typeOf(tool).startsWith("web_search"))
        .map((tool) => (typeOf(tool) === "mcp" ? { ...(tool as object), require_approval: "always" } : tool));
}

// A recorded request made safe to resend: nothing stored, no earlier
// response or conversation that would bring the suspect content back
export function replayBody(body: Body): Body {
    const { previous_response_id: _previous, conversation: _conversation, stream: _stream, ...rest } = body;
    const tools = Array.isArray(body.tools) ? { tools: toolsOf(body.tools) } : {};
    return repaired({ ...rest, ...tools, store: false }) as Body;
}
