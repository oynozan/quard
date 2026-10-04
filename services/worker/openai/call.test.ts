import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeResponses } from "../../../packages/sdk/test/fake-responses.ts";
import { callModel } from "./call.ts";

const CONFIG = { apiKey: "sk-test", baseUrl: "http://openai.test/v1" };
const USAGE = { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 0 } };

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("callModel", () => {
    it("posts the body with the key and returns the output, its text and its cost", async () => {
        const fake = fakeResponses(() => ({ text: "Plain words.", usage: USAGE }));
        const fetch = vi.fn(fake.fetch);

        const answer = await callModel(CONFIG, { model: "gpt-5.4-mini", input: "hi" }, fetch);

        expect(answer).toEqual({
            output: [expect.objectContaining({ type: "message" })],
            text: "Plain words.",
            costUsd: 0.0012,
        });
        expect(fake.bodies).toEqual([{ model: "gpt-5.4-mini", input: "hi" }]);
        expect(fetch).toHaveBeenCalledWith(
            "http://openai.test/v1/responses",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({ authorization: "Bearer sk-test" }),
            }),
        );
    });

    it("finds no text in function calls or odd output", async () => {
        const fake = fakeResponses(() => ({ calls: [{ name: "payInvoice", args: {} }], usage: USAGE }));

        expect(await callModel(CONFIG, { model: "gpt-5.4-mini" }, fake.fetch)).toMatchObject({ text: "" });

        const odd = { output: [null, { content: [null, { type: "refusal", text: "no" }] }], usage: USAGE };
        const fetch = async () => Response.json(odd);
        expect(await callModel(CONFIG, { model: "gpt-5.4-mini" }, fetch)).toMatchObject({ text: "" });
    });

    it("reads no output when the response has none", async () => {
        const fetch = async () => Response.json({ usage: USAGE });

        expect(await callModel(CONFIG, { model: "gpt-5.4-mini" }, fetch)).toMatchObject({ output: [], text: "" });
    });

    it("never calls a model it can't price", async () => {
        const fetch = vi.fn();

        await expect(callModel(CONFIG, { model: "test-model" }, fetch)).rejects.toThrow(
            "No price is known for the model test-model",
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it("throws on a failed status without the key in the message", async () => {
        const fetch = async () => new Response("bad key sk-test", { status: 401 });

        const failed = callModel(CONFIG, { model: "gpt-5.4-mini" }, fetch);

        await expect(failed).rejects.toThrow("The model call failed with status 401");
        await expect(failed).rejects.not.toThrow("sk-test");
    });

    it("throws when the response has no token usage", async () => {
        const fake = fakeResponses(() => ({ text: "hi" }));

        await expect(callModel(CONFIG, { model: "gpt-5.4-mini" }, fake.fetch)).rejects.toThrow("no token usage");
    });

    it("uses the global fetch by default", async () => {
        vi.stubGlobal("fetch", fakeResponses(() => ({ text: "ok", usage: USAGE })).fetch);

        expect(await callModel(CONFIG, { model: "gpt-5.4-mini" })).toMatchObject({ text: "ok" });
    });
});
