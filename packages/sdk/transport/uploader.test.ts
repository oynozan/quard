import { createRedactor, MAX_BATCH, parseHashKey, uploadBatch, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { record, takeDropped, takeEvents } from "../core/recorder.ts";
import { createUploader, type Send } from "./uploader.ts";

const redactor = createRedactor(parseHashKey("ab".repeat(32)));
const IBAN = "DE89370400440532013000";

function toolCall(at = new Date().toISOString()): RunEvent {
    return {
        type: "tool_call",
        runId: "1".repeat(32),
        stepId: "2".repeat(16),
        agent: "billing",
        at,
        tool: "payInvoice",
        arguments: { iban: IBAN, amount: 10 },
        status: "ok",
        influenced: false,
        flagged: false,
        durationMs: 1,
    };
}

type Sent = {
    url: string;
    headers: Record<string, string>;
    body: { events: { id: string; degraded?: boolean; event: RunEvent }[]; dropped?: number };
};

// A webhook stand-in that answers with the given statuses in turn
function webhook(...statuses: Array<number | "down">) {
    const sent: Sent[] = [];
    const send: Send = async (url, init) => {
        sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
        const status = statuses.length > 1 ? statuses.shift() : statuses[0];
        if (status === "down") {
            throw new Error("connection refused");
        }
        return new Response("{}", { status: status ?? 202 });
    };
    return { sent, send };
}

function uploader(send: Send, warn = vi.fn()) {
    return createUploader({ webhookUrl: "http://webhook.test/", key: "qk_live_abc", redactor, send, warn });
}

beforeEach(() => {
    takeEvents();
    takeDropped();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("uploader", () => {
    it("sends redacted events in envelopes, with the agent key", async () => {
        const hook = webhook(202);
        record(toolCall());

        expect(await uploader(hook.send).flush()).toBe(true);

        const [batch] = hook.sent;
        expect(batch?.url).toBe("http://webhook.test/v1/events");
        expect(batch?.headers.authorization).toBe("Bearer qk_live_abc");
        expect(uploadBatch.safeParse(batch?.body).success).toBe(true);
        expect(JSON.stringify(batch?.body)).not.toContain(IBAN);
        expect(batch?.body.events[0]?.event).toMatchObject({ arguments: { iban: "DE89…3000" } });
        expect(batch?.body.events[0]?.degraded).toBeUndefined();
    });

    it("sends nothing when nothing is buffered", async () => {
        const hook = webhook(202);

        expect(await uploader(hook.send).flush()).toBe(true);
        expect(hook.sent).toHaveLength(0);
    });

    it("splits a big backlog into batches", async () => {
        const hook = webhook(202);
        for (let i = 0; i < MAX_BATCH + 1; i++) {
            record(toolCall());
        }

        await uploader(hook.send).flush();

        expect(hook.sent.map((batch) => batch.body.events.length)).toEqual([MAX_BATCH, 1]);
    });

    it.each([[500], [429], ["down" as const]])(
        "keeps a batch after %s and resends it marked degraded",
        async (status) => {
            const hook = webhook(status, 202);
            const up = uploader(hook.send);
            record(toolCall());

            expect(await up.flush()).toBe(false);
            expect(await up.flush()).toBe(true);

            expect(hook.sent).toHaveLength(2);
            expect(hook.sent[1]?.body.events[0]?.id).toBe(hook.sent[0]?.body.events[0]?.id);
            expect(hook.sent[1]?.body.events[0]?.degraded).toBe(true);
        },
    );

    it("drops a batch the webhook refuses for good, and warns once", async () => {
        const hook = webhook(401);
        const warn = vi.fn();
        const up = uploader(hook.send, warn);
        record(toolCall());
        await up.flush();
        record(toolCall());

        expect(await up.flush()).toBe(true);
        expect(hook.sent).toHaveLength(2);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("(401)"));
    });

    it("marks old events degraded and reports what the buffer dropped", async () => {
        const hook = webhook(202);
        for (let i = 0; i <= 10_000; i++) {
            record(toolCall(new Date(Date.now() - 60_000).toISOString()));
        }

        await uploader(hook.send).flush();

        expect(hook.sent[0]?.body.dropped).toBe(1);
        expect(hook.sent[0]?.body.events[0]?.degraded).toBe(true);
        expect(hook.sent[1]?.body.dropped).toBeUndefined();
    });

    it("shares one send between flushes that overlap", async () => {
        const hook = webhook(202);
        const up = uploader(hook.send);
        record(toolCall());

        await Promise.all([up.flush(), up.flush()]);

        expect(hook.sent).toHaveLength(1);
    });

    it("sends every second while started, backing off up to a minute when down", async () => {
        vi.useFakeTimers();
        const hook = webhook("down");
        const up = uploader(hook.send);
        record(toolCall());
        up.start();
        up.start();

        await vi.advanceTimersByTimeAsync(1_000);
        expect(hook.sent).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(hook.sent).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(4_000 + 8_000 + 16_000 + 32_000 + 60_000);
        expect(hook.sent).toHaveLength(7);

        up.stop();
        await vi.advanceTimersByTimeAsync(120_000);
        expect(hook.sent).toHaveLength(7);
    });

    it("goes back to every second once the backend answers", async () => {
        vi.useFakeTimers();
        const hook = webhook("down", 202);
        const up = uploader(hook.send);
        record(toolCall());
        up.start();

        await vi.advanceTimersByTimeAsync(1_000 + 2_000);
        record(toolCall());
        await vi.advanceTimersByTimeAsync(1_000);

        expect(hook.sent).toHaveLength(3);
        up.stop();
    });

    it("does not schedule again when stopped during a send", async () => {
        vi.useFakeTimers();
        let answer: (res: Response) => void = () => {};
        const send = vi.fn<Send>(() => new Promise((resolve) => (answer = resolve)));
        const up = uploader(send);
        record(toolCall());
        up.start();

        await vi.advanceTimersByTimeAsync(1_000);
        up.stop();
        answer(new Response("{}", { status: 202 }));
        await vi.advanceTimersByTimeAsync(10_000);

        expect(send).toHaveBeenCalledTimes(1);
    });

    it("uses fetch and console.warn by default", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        record(toolCall());

        await createUploader({ webhookUrl: "http://webhook.test", key: "k", redactor }).flush();

        expect(fetch).toHaveBeenCalledWith("http://webhook.test/v1/events", expect.any(Object));
        expect(warn).toHaveBeenCalled();
        fetch.mockRestore();
        warn.mockRestore();
    });
});
