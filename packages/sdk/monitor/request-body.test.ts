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

function uploadsOn(): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 202 })),
    );
    configureQuard(UPLOADS);
}

// The one model call recorded for a request with this input and answer
async function recordedCall(input: string, text: string, stream = false): Promise<ModelCallEvent | undefined> {
    const fake = fakeResponses(() => ({ text }));
    const body = { model: "gpt", input, stream };
    const response = await createMonitorFetch(fake.fetch)(URL_RESPONSES, {
        method: "POST",
        body: JSON.stringify(body),
    });
    await response.text();
    return takeEvents().find((event): event is ModelCallEvent => event.type === "model_call");
}

describe("the recorded request body and output text", () => {
    it("are kept up to 512 KiB of JSON together while uploads are on", async () => {
        uploadsOn();
        // The JSON around the input, {"model":"gpt","input":""}, and the answer, ["ok"]
        const room = 512 * 1024 - 26 - 6;

        const kept = await recordedCall("x".repeat(room), "ok");
        expect(kept?.requestBody).toEqual({ model: "gpt", input: "x".repeat(room) });
        expect(kept?.outputText).toEqual(["ok"]);
        const over = await recordedCall("x".repeat(room + 1), "ok");
        expect(over).not.toHaveProperty("requestBody");
        expect(over).not.toHaveProperty("outputText");
    });

    it("drop both when a long answer passes the cap", async () => {
        uploadsOn();

        const call = await recordedCall("hi", "y".repeat(512 * 1024));

        expect(call).not.toHaveProperty("requestBody");
        expect(call).not.toHaveProperty("outputText");
    });

    it("keep the answer of plain and streamed responses", async () => {
        uploadsOn();

        expect((await recordedCall("hi", "Paid the invoice."))?.outputText).toEqual(["Paid the invoice."]);
        expect((await recordedCall("hi", "Streamed answer.", true))?.outputText).toEqual(["Streamed answer."]);
    });

    it("are not kept without uploads", async () => {
        const call = await recordedCall("hi", "ok");

        expect(call?.status).toBe("ok");
        expect(call).not.toHaveProperty("requestBody");
        expect(call).not.toHaveProperty("outputText");
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
