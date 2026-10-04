import { describe, expect, it } from "vitest";
import { parseRequest, readResponsesRequest } from "./request.ts";

const URL_RESPONSES = "https://api.openai.com/v1/responses";

describe("parseRequest", () => {
    it("reads a plain text input and the settings", () => {
        const tools = [{ type: "function", name: "fetchPage" }, { type: "web_search" }, { name: 5 }, null];
        expect(
            parseRequest({
                model: "gpt",
                input: "hi",
                stream: true,
                previous_response_id: "resp_1",
                instructions: "Be brief",
                tools,
            }),
        ).toEqual({
            model: "gpt",
            instructions: "Be brief",
            tools: ["fetchPage", "web_search"],
            stream: true,
            previousResponseId: "resp_1",
            conversationId: undefined,
            texts: [
                { role: "system", text: "Be brief" },
                { role: "user", text: "hi" },
            ],
            callIds: [],
            replayBody: { model: "gpt", input: "hi", previous_response_id: "resp_1", instructions: "Be brief", tools },
        });
    });

    it("keeps only the fields a replay resends", () => {
        const kept = {
            model: "gpt",
            instructions: "i",
            input: [],
            tools: [],
            tool_choice: "auto",
            parallel_tool_calls: false,
            temperature: 0.2,
            top_p: 1,
            reasoning: { effort: "low" },
            text: { format: { type: "text" } },
            max_output_tokens: 500,
            max_tool_calls: 3,
            truncation: "auto",
            top_logprobs: 0,
            prompt: { id: "pmpt_1" },
            previous_response_id: "resp_1",
            conversation: "conv_1",
        };
        const dropped = { stream: true, store: true, metadata: { a: "b" }, user: "u1", include: [], background: true };

        expect(parseRequest({ ...kept, ...dropped }).replayBody).toEqual(kept);
    });

    it("reads no tools when the tools are not a list", () => {
        expect(parseRequest({ tools: "fetchPage" }).tools).toEqual([]);
        expect(parseRequest({}).instructions).toBeUndefined();
    });

    it("reads the conversation as an id or an object", () => {
        expect(parseRequest({ conversation: "conv_1" }).conversationId).toBe("conv_1");
        expect(parseRequest({ conversation: { id: "conv_2" } }).conversationId).toBe("conv_2");
        expect(parseRequest({ conversation: { id: 5 } }).conversationId).toBeUndefined();
    });

    it("reads input items by kind", () => {
        const request = parseRequest({
            input: [
                null,
                { role: "user", content: "pay the invoice" },
                {
                    role: "user",
                    content: [{ type: "input_text", text: "part one" }, { type: "input_image" }, { text: "part two" }],
                },
                { role: "developer", content: "rules" },
                { role: "system", content: 5 },
                { role: "assistant", content: "my own words" },
                { type: "function_call", call_id: "call_1", name: "fetchPage", arguments: "{}" },
                { type: "function_call_output", call_id: "call_1", output: '{"body":"line one\\nIBAN DE89"}' },
                { type: "function_call_output", call_id: "call_2", output: "42" },
                { type: "function_call_output", call_id: "call_3", output: "plain text" },
                { type: "function_call_output", call_id: "call_5", output: '{"token":"Xk9mP2qL7v","note":"hi"}' },
                {
                    type: "function_call_output",
                    call_id: "call_4",
                    output: [{ type: "input_text", text: "from parts" }],
                },
            ],
        });

        expect(request.model).toBe("unknown");
        expect(request.stream).toBe(false);
        expect(request.callIds).toEqual(["call_1", "call_1", "call_2", "call_3", "call_5", "call_4"]);
        expect(request.texts).toEqual([
            { role: "user", text: "pay the invoice" },
            { role: "user", text: "part one\npart two" },
            { role: "system", text: "rules" },
            { role: "system", text: "" },
            { role: "tool", text: "body\nline one\nIBAN DE89", callId: "call_1" },
            { role: "tool", text: "42", callId: "call_2" },
            { role: "tool", text: "plain text", callId: "call_3" },
            // Values under secret-named fields are left out of what gets indexed
            { role: "tool", text: "token\nnote\nhi", callId: "call_5" },
            { role: "tool", text: "from parts", callId: "call_4" },
        ]);
    });

    it("ignores an input that is neither text nor a list", () => {
        expect(parseRequest({ input: 5 }).texts).toEqual([]);
    });
});

describe("readResponsesRequest", () => {
    const body = JSON.stringify({ model: "gpt", input: "hi" });

    it("reads text, byte and blob bodies of a POST to the Responses API", async () => {
        const bytes = new TextEncoder().encode(body);

        expect(await readResponsesRequest(URL_RESPONSES, { method: "POST", body })).toMatchObject({ model: "gpt" });
        expect(await readResponsesRequest(new URL(URL_RESPONSES), { method: "post", body: bytes })).toMatchObject({
            model: "gpt",
        });
        expect(await readResponsesRequest(URL_RESPONSES, { method: "POST", body: bytes.buffer })).toMatchObject({
            model: "gpt",
        });
        expect(await readResponsesRequest(URL_RESPONSES, { method: "POST", body: new Blob([body]) })).toMatchObject({
            model: "gpt",
        });
    });

    it("reads a POST Request object without using up its body", async () => {
        const request = new Request(URL_RESPONSES, { method: "POST", body });

        expect(await readResponsesRequest(request, undefined)).toMatchObject({ model: "gpt" });
        expect(await request.text()).toBe(body);
    });

    it("reports a Responses POST it can't read", async () => {
        expect(await readResponsesRequest(URL_RESPONSES, { method: "POST", body: "not json" })).toBe("unreadable");
        expect(await readResponsesRequest(URL_RESPONSES, { method: "POST", body: "[1]" })).toBe("unreadable");
        expect(await readResponsesRequest(URL_RESPONSES, { method: "POST", body: new FormData() })).toBe("unreadable");
    });

    it("skips other requests", async () => {
        expect(await readResponsesRequest(URL_RESPONSES, { method: "GET" })).toBeUndefined();
        expect(await readResponsesRequest(URL_RESPONSES, undefined)).toBeUndefined();
        expect(await readResponsesRequest(new Request(URL_RESPONSES), undefined)).toBeUndefined();
        expect(
            await readResponsesRequest("https://api.openai.com/v1/models", { method: "POST", body }),
        ).toBeUndefined();
    });
});
