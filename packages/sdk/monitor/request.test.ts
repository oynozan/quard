import { describe, expect, it } from "vitest";
import { parseRequest, readResponsesRequest } from "./request.ts";

const URL_RESPONSES = "https://api.openai.com/v1/responses";

describe("parseRequest", () => {
    it("reads a plain text input and the settings", () => {
        expect(
            parseRequest({
                model: "gpt",
                input: "hi",
                stream: true,
                previous_response_id: "resp_1",
                instructions: "Be brief",
            }),
        ).toEqual({
            model: "gpt",
            stream: true,
            previousResponseId: "resp_1",
            conversationId: undefined,
            texts: [
                { role: "system", text: "Be brief" },
                { role: "user", text: "hi" },
            ],
            callIds: [],
        });
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
                {
                    type: "function_call_output",
                    call_id: "call_4",
                    output: [{ type: "input_text", text: "from parts" }],
                },
            ],
        });

        expect(request.model).toBe("unknown");
        expect(request.stream).toBe(false);
        expect(request.callIds).toEqual(["call_1", "call_1", "call_2", "call_3", "call_4"]);
        expect(request.texts).toEqual([
            { role: "user", text: "pay the invoice" },
            { role: "user", text: "part one\npart two" },
            { role: "system", text: "rules" },
            { role: "system", text: "" },
            { role: "tool", text: "body\nline one\nIBAN DE89", callId: "call_1" },
            { role: "tool", text: "42", callId: "call_2" },
            { role: "tool", text: "plain text", callId: "call_3" },
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
