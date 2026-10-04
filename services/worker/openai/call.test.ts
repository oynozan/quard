import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeResponses } from "../../../packages/sdk/test/fake-responses.ts";
import { BACKOFF_MS, callModel, TIMED_OUT, TIMEOUT_MS } from "./call.ts";

const CONFIG = { apiKey: "sk-test", baseUrl: "http://openai.test/v1" };
const USAGE = { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 0 } };

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const BODY = { model: "gpt-5.4-mini", input: "hi" };
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

// A fetch that answers with each status in turn, then with a priced answer
function answers(...statuses: number[]) {
    const fake = fakeResponses(() => ({ text: "ok", usage: USAGE }));
    return vi.fn(async (input: string, init: RequestInit) => {
        const status = statuses.shift();
        return status === undefined ? fake.fetch(input, init) : new Response("busy", { status });
    });
}

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

    it("does not try again after other failed statuses", async () => {
        const fetch = answers(400);

        await expect(callModel(CONFIG, BODY, fetch)).rejects.toThrow("The model call failed with status 400");
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("tries again after a short wait when the API is busy", async () => {
        vi.useFakeTimers();
        const fetch = answers(429);

        const answer = callModel(CONFIG, BODY, fetch);
        await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] as number);

        expect(await answer).toMatchObject({ text: "ok" });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("tries a failing API twice more, waiting longer each time, then fails", async () => {
        vi.useFakeTimers();
        const fetch = answers(500, 502, 503);

        const answer = callModel(CONFIG, BODY, fetch);
        const failed = expect(answer).rejects.toThrow("The model call failed with status 503");
        await vi.advanceTimersByTimeAsync(999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1 + 1_999);
        expect(fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);

        await failed;
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("gives each try its own two-minute limit", async () => {
        const limit = vi.spyOn(AbortSignal, "timeout");
        const fetch = answers(503);
        vi.useFakeTimers();

        const answer = callModel(CONFIG, BODY, fetch);
        await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] as number);
        await answer;

        expect(limit.mock.calls).toEqual([[TIMEOUT_MS], [TIMEOUT_MS]]);
        const made = limit.mock.results.map((item) => item.value);
        expect(fetch.mock.calls.map(([, init]) => made.indexOf(init.signal))).toEqual([0, 1]);
    });

    it("says so when the model did not answer in time, or stopped while sending its answer", async () => {
        await expect(callModel(CONFIG, BODY, async () => Promise.reject(timeout()))).rejects.toThrow(TIMED_OUT);

        const stalled = new ReadableStream({ pull: (controller) => controller.error(timeout()) });
        await expect(callModel(CONFIG, BODY, async () => new Response(stalled))).rejects.toThrow(TIMED_OUT);
    });

    it("passes other fetch errors on as they are", async () => {
        const fetch = async () => Promise.reject(new TypeError("fetch failed"));

        await expect(callModel(CONFIG, BODY, fetch)).rejects.toThrow(new TypeError("fetch failed"));
    });

    it("uses the global fetch by default", async () => {
        vi.stubGlobal("fetch", fakeResponses(() => ({ text: "ok", usage: USAGE })).fetch);

        expect(await callModel(CONFIG, { model: "gpt-5.4-mini" })).toMatchObject({ text: "ok" });
    });
});
