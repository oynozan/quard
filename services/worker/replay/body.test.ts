import { describe, expect, it } from "vitest";
import { replayBody } from "./body.ts";

describe("replayBody", () => {
    it("stores nothing and drops what would bring the suspect content back", () => {
        const body = {
            model: "gpt-5.4-mini",
            input: [],
            store: true,
            stream: true,
            previous_response_id: "resp_1",
            conversation: "conv_1",
        };

        expect(replayBody(body)).toEqual({ model: "gpt-5.4-mini", input: [], store: false });
    });

    it("leaves out hosted web search and makes hosted MCP tools ask first", () => {
        const tools = [
            { type: "web_search" },
            { type: "web_search_preview" },
            { type: "mcp", server_label: "crm", server_url: "https://crm.example/mcp", require_approval: "never" },
            null,
        ];

        expect(replayBody({ tools }).tools).toEqual([
            { type: "mcp", server_label: "crm", server_url: "https://crm.example/mcp", require_approval: "always" },
            null,
        ]);
    });

    it("gives the cut schemas of secret-named fields a string schema", () => {
        const parameters = {
            type: "object",
            properties: { user: { type: "string" }, password: "…", nested: { properties: { token: "…" } } },
            required: ["user", "password"],
            description: "…",
        };

        expect(replayBody({ tools: [{ type: "function", name: "login", parameters }] }).tools).toEqual([
            {
                type: "function",
                name: "login",
                parameters: {
                    type: "object",
                    properties: {
                        user: { type: "string" },
                        password: { type: "string" },
                        nested: { properties: { token: { type: "string" } } },
                    },
                    required: ["user", "password"],
                    description: "…",
                },
            },
        ]);
    });

    it("repairs a cut field in the structured output schema too", () => {
        const format = { type: "json_schema", name: "reply", schema: { properties: { api_key: "…" } } };

        expect(replayBody({ text: { format } }).text).toEqual({
            format: { ...format, schema: { properties: { api_key: { type: "string" } } } },
        });
    });
});
