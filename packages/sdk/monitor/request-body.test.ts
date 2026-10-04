import type { ModelCallEvent } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../core/recorder.ts";
import { fakeResponses } from "../test/fake-responses.ts";
import { resetAll } from "../test/reset.ts";
import { configureQuard } from "../transport/configure.ts";
import { createMonitorFetch } from "./fetch.ts";

const URL_RESPONSES = "https://api.openai.com/v1/responses";
const UPLOADS = { key: "qk_test_abcdefghijklmnop", webhookUrl: "http://webhook.test", hashKey: "ab".repeat(32) };

afterEach(() => {
    resetAll();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// The recorded body of one model call whose input is `size` characters long
async function recordedBody(size: number): Promise<Record<string, unknown> | undefined> {
    const fake = fakeResponses(() => ({ text: "ok" }));
    const body = { model: "gpt", input: "x".repeat(size), stream: false };
    await createMonitorFetch(fake.fetch)(URL_RESPONSES, { method: "POST", body: JSON.stringify(body) });
    const call = takeEvents().find((event): event is ModelCallEvent => event.type === "model_call");
    return call?.requestBody;
}

describe("the recorded request body", () => {
    it("is kept up to 512 KiB of JSON while uploads are on", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 202 })),
        );
        configureQuard(UPLOADS);
        // The JSON around the input: {"model":"gpt","input":""}
        const room = 512 * 1024 - 26;

        expect(await recordedBody(room)).toEqual({ model: "gpt", input: "x".repeat(room) });
        expect(await recordedBody(room + 1)).toBeUndefined();
    });

    it("is not kept without uploads", async () => {
        expect(await recordedBody(10)).toBeUndefined();
    });
});

describe("the model call time", () => {
    it("puts the start at at minus durationMs", async () => {
        const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
        const fake = fakeResponses(() => ({ text: "ok" }));
        const inner: typeof fake.fetch = async (input, init) => {
            clock.mockReturnValue(1250);
            return fake.fetch(input, init);
        };
        const body = JSON.stringify({ model: "gpt", input: "hi", stream: false });
        await createMonitorFetch(inner)(URL_RESPONSES, { method: "POST", body });
        const call = takeEvents().find((event): event is ModelCallEvent => event.type === "model_call");

        expect(call?.durationMs).toBe(250);
        expect(Date.parse(String(call?.at)) - Number(call?.durationMs)).toBe(1000);
    });
});
