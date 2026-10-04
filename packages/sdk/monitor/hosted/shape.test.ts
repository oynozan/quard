import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../../core/config.ts";
import { resetAll } from "../../test/reset.ts";
import { shapeBody, shapedRequest } from "./shape.ts";

afterEach(() => {
    resetAll();
});

const SOURCES = "web_search_call.action.sources";
const URL_RESPONSES = "https://api.openai.com/v1/responses";

function allowAcme(mode?: "block" | "observe"): void {
    configure({ hostedTools: { web_search: [{ type: "source", origin: "web", allowDomains: ["*.acme.com"], mode }] } });
}

describe("shapeBody", () => {
    it("changes nothing without hosted tools", () => {
        expect(shapeBody({ input: "hi" })).toBeUndefined();
        expect(shapeBody({ tools: [{ type: "function", name: "fetchPage" }, null] })).toBeUndefined();
    });

    it("keeps approval on for every hosted MCP tool", () => {
        const kept = { type: "mcp", server_label: "a", require_approval: "always" };
        const shaped = shapeBody({
            tools: [kept, { type: "mcp", server_label: "b", require_approval: "never" }, { type: "mcp" }],
        });

        expect(shaped?.tools).toEqual([
            kept,
            { type: "mcp", server_label: "b", require_approval: "always" },
            { type: "mcp", require_approval: "always" },
        ]);
        expect(shapeBody({ tools: [kept] })).toBeUndefined();
    });

    it("asks for web search sources and keeps the include list", () => {
        expect(
            shapeBody({ tools: [{ type: "web_search_preview" }], include: ["reasoning.encrypted_content"] }),
        ).toEqual({
            tools: [{ type: "web_search_preview" }],
            include: ["reasoning.encrypted_content", SOURCES],
        });
        expect(shapeBody({ tools: [{ type: "web_search" }], include: [SOURCES] })).toBeUndefined();
    });

    it("limits web search to the domains the source rules allow", () => {
        allowAcme();

        const shaped = shapeBody({
            tools: [
                { type: "web_search", filters: { allowed_domains: ["docs.acme.com", "evil.com"] } },
                { type: "web_search_preview" },
            ],
        });

        expect(shaped).toEqual({
            tools: [
                { type: "web_search", filters: { allowed_domains: ["docs.acme.com"] } },
                { type: "web_search_preview" },
            ],
            include: [SOURCES],
        });
    });

    it("leaves the domains alone for rules in observe mode or with no allowlist", () => {
        allowAcme("observe");
        expect(shapeBody({ tools: [{ type: "web_search" }] })?.tools).toEqual([{ type: "web_search" }]);

        configure({ hostedTools: { web_search: [{ type: "source", origin: "web", blockDomains: ["evil.com"] }] } });
        expect(shapeBody({ tools: [{ type: "web_search" }] })?.tools).toEqual([{ type: "web_search" }]);
    });
});

describe("shapedRequest", () => {
    const mcp = { tools: [{ type: "mcp" }] };

    it("sends the request as it is when nothing changes", () => {
        const init = { method: "POST", body: "{}" };

        expect(shapedRequest(URL_RESPONSES, init, {})).toEqual([URL_RESPONSES, init]);
    });

    it("sends the shaped body without the old content-length", () => {
        const init = { method: "POST", body: JSON.stringify(mcp), headers: { "content-length": "24", "x-a": "1" } };

        const [input, sent] = shapedRequest(URL_RESPONSES, init, mcp);

        expect(input).toBe(URL_RESPONSES);
        expect(JSON.parse(String(sent?.body))).toEqual({ tools: [{ type: "mcp", require_approval: "always" }] });
        expect([...new Headers(sent?.headers)]).toEqual([["x-a", "1"]]);
        expect(shapedRequest(URL_RESPONSES, undefined, mcp)[1]?.method).toBeUndefined();
    });

    it("rebuilds a Request that carries its own body", async () => {
        const request = new Request(URL_RESPONSES, {
            method: "POST",
            body: JSON.stringify(mcp),
            headers: { "x-a": "1" },
        });

        const [input, sent] = shapedRequest(request, undefined, mcp);

        expect(sent).toBeUndefined();
        expect(input).toBeInstanceOf(Request);
        const rebuilt = input as Request;
        expect(rebuilt.method).toBe("POST");
        expect(rebuilt.headers.get("x-a")).toBe("1");
        expect(await rebuilt.json()).toEqual({ tools: [{ type: "mcp", require_approval: "always" }] });
    });
});
