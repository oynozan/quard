import { asRecord } from "../json.ts";
import { allowedDomains } from "./domains.ts";
import { webSearchRules } from "./rules.ts";

type Body = Record<string, unknown>;
type Input = string | URL | Request;

const SOURCES = "web_search_call.action.sources";

function isWebSearch(type: unknown): boolean {
    return typeof type === "string" && type.startsWith("web_search");
}

// Allowlists from source rules that enforce; observe rules change nothing
function allowlists(): string[][] {
    return webSearchRules()
        .filter((options) => (options.mode ?? "block") === "block")
        .flatMap((options) => (options.allowDomains === undefined ? [] : [options.allowDomains]));
}

// Hosted MCP keeps approval on, so Quard can answer each call. Web search
// gets the allowed domains, where the API has filters (not the preview).
function shapeTool(tool: unknown, lists: string[][]): unknown {
    const item = asRecord(tool);
    if (item?.type === "mcp") {
        return item.require_approval === "always" ? tool : { ...item, require_approval: "always" };
    }
    if (item === undefined || !isWebSearch(item.type) || String(item.type).includes("preview")) {
        return tool;
    }
    const filters = asRecord(item.filters);
    const domains = allowedDomains(filters?.allowed_domains, lists);
    return domains === undefined ? tool : { ...item, filters: { ...filters, allowed_domains: domains } };
}

// The body with hosted tools shaped, or undefined when nothing changes
export function shapeBody(body: Body): Body | undefined {
    if (!Array.isArray(body.tools)) {
        return undefined;
    }
    const before = body.tools as unknown[];
    const lists = allowlists();
    const tools = before.map((tool) => shapeTool(tool, lists));
    const include = Array.isArray(body.include) ? (body.include as unknown[]) : [];
    // Adds only the source list to the response, keeping what is there
    const addSources = tools.some((tool) => isWebSearch(asRecord(tool)?.type)) && !include.includes(SOURCES);
    if (!addSources && tools.every((tool, i) => tool === before[i])) {
        return undefined;
    }
    return { ...body, tools, ...(addSources ? { include: [...include, SOURCES] } : {}) };
}

// The request to send: the same one, or one with the shaped body. The
// old content-length would no longer match, so it is dropped.
export function shapedRequest(input: Input, init: RequestInit | undefined, body: Body): [Input, RequestInit?] {
    const shaped = shapeBody(body);
    if (shaped === undefined) {
        return [input, init];
    }
    const fromRequest = init?.body === undefined && input instanceof Request;
    const headers = new Headers(init?.headers ?? (fromRequest ? input.headers : undefined));
    headers.delete("content-length");
    const next = { ...init, body: JSON.stringify(shaped), headers };
    return fromRequest ? [new Request(input, next)] : [input, next];
}
