import { createRedactor, keyedHash, type Redactor, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bufferedEvents, record, takeDropped, takeEvents } from "../core/recorder.ts";
import { PROJECT_KEY } from "../test/hash-key.ts";
import { createUploader, type Send } from "./uploader.ts";

// Uploads before the project's hash key is known: no raw value may leave

const IBAN = "DE89370400440532013000";

function toolCall(): RunEvent {
    return {
        type: "tool_call",
        runId: "1".repeat(32),
        stepId: "2".repeat(16),
        agent: "billing",
        at: new Date().toISOString(),
        tool: "payInvoice",
        arguments: { iban: IBAN },
        keys: [`iban:${IBAN}`],
        status: "ok",
        influenced: false,
        flagged: false,
        durationMs: 1,
    };
}

// A redactor that is there only once the test hands out the key
function keySource() {
    const state: { redactor: Redactor | undefined } = { redactor: undefined };
    const redactor = vi.fn(async () => state.redactor);
    return { redactor, give: () => (state.redactor = createRedactor(PROJECT_KEY)) };
}

function webhook() {
    const bodies: string[] = [];
    const send = vi.fn<Send>(async (_url, init) => {
        bodies.push(String(init.body));
        return new Response("{}", { status: 202 });
    });
    return { bodies, send };
}

beforeEach(() => {
    takeEvents();
    takeDropped();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("uploads before the project's key is known", () => {
    it("keep events in the buffer, then send them redacted with the key", async () => {
        const keys = keySource();
        const hook = webhook();
        const up = createUploader({
            webhookUrl: "http://webhook.test",
            key: "k",
            redactor: keys.redactor,
            send: hook.send,
        });
        record(toolCall());

        expect(await up.flush()).toBe(false);
        expect(hook.send).not.toHaveBeenCalled();
        expect(bufferedEvents()).toBe(1);

        keys.give();
        expect(await up.flush()).toBe(true);

        expect(bufferedEvents()).toBe(0);
        expect(hook.bodies.join("")).not.toContain(IBAN);
        expect(hook.bodies.join("")).toContain(`iban:DE89…3000#${keyedHash(PROJECT_KEY, "iban", IBAN)}`);
    });

    it("ask for no key while nothing is buffered", async () => {
        const keys = keySource();
        const up = createUploader({ webhookUrl: "http://webhook.test", key: "k", redactor: keys.redactor });

        expect(await up.flush()).toBe(true);
        expect(keys.redactor).not.toHaveBeenCalled();
    });

    it("try again on the backoff of a webhook that is down", async () => {
        vi.useFakeTimers();
        const keys = keySource();
        const hook = webhook();
        const up = createUploader({
            webhookUrl: "http://webhook.test",
            key: "k",
            redactor: keys.redactor,
            send: hook.send,
        });
        record(toolCall());
        up.start();

        await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000);
        expect(keys.redactor).toHaveBeenCalledTimes(3);
        keys.give();
        await vi.advanceTimersByTimeAsync(8_000);

        expect(hook.send).toHaveBeenCalledTimes(1);
        up.stop();
    });
});
