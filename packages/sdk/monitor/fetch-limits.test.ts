import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { takeEvents } from "../core/recorder.ts";
import { GuardRefusal } from "../core/refusal.ts";
import { currentScope, runScope } from "../context/scope.ts";
import { withoutRunEdges } from "../test/call.ts";
import { fakeResponses } from "../test/fake-responses.ts";
import { resetAll } from "../test/reset.ts";
import { createMonitorFetch } from "./fetch.ts";

afterEach(() => {
    resetAll();
});

const URL_RESPONSES = "https://api.openai.com/v1/responses";
const post = (body: object): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
// 1M fresh input tokens of gpt-5.4-mini cost $0.75
const USAGE = { input_tokens: 1_000_000, output_tokens: 0 };

function limitDecisions() {
    return withoutRunEdges(takeEvents()).flatMap((event) =>
        event.type === "decision" ? [[event.rule, event.mode, event.enforced, event.tool]] : [],
    );
}

describe("run limits on model calls", () => {
    it("refuses a call over the step limit in block mode, before it is sent", async () => {
        configure({ runLimits: { mode: "block", steps: 1 } });
        const fake = fakeResponses(() => ({ text: "ok" }));
        const monitored = createMonitorFetch(fake.fetch);

        const refused = await runScope({ agent: "billing" }, async () => {
            await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "one" }));
            const sent = currentScope()?.lastStepId;
            const response = await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "two" }));
            // The refused call is not a step the run took
            expect(currentScope()?.lastStepId).toBe(sent);
            expect(currentScope()?.run.modelCalls).toBe(1);
            return response;
        });

        // A 403 that clients do not retry, with the refusal as its API error
        expect(refused.status).toBe(403);
        expect(refused.headers.get("x-should-retry")).toBe("false");
        expect(await refused.json()).toEqual({
            error: {
                message: new GuardRefusal({ guard: "limit", tool: "gpt-5.4-mini", reason: "limit_reached" }).text,
                type: "quard_blocked",
                code: "limit_reached",
                param: null,
            },
        });
        expect(fake.bodies).toHaveLength(1);
        expect(limitDecisions()).toEqual([["max-steps", "block", true, "gpt-5.4-mini"]]);
    });

    it("records a would-block decision in observe mode and sends the call", async () => {
        configure({ runLimits: { steps: 1 } });
        const fake = fakeResponses(() => ({ text: "ok" }));
        const monitored = createMonitorFetch(fake.fetch);

        await runScope({}, async () => {
            await monitored(URL_RESPONSES, post({ model: "m", input: "one" }));
            await monitored(URL_RESPONSES, post({ model: "m", input: "two" }));

            expect(currentScope()?.run.modelCalls).toBe(2);
        });

        expect(fake.bodies).toHaveLength(2);
        expect(limitDecisions()).toEqual([["max-steps", "observe", false, "m"]]);
    });

    it("adds the cost of plain and streamed responses, then stops at the cost limit", async () => {
        configure({ runLimits: { mode: "block", costUsd: 1.5 } });
        const fake = fakeResponses(() => ({ text: "ok", usage: USAGE }));
        const monitored = createMonitorFetch(fake.fetch);

        await runScope({}, async () => {
            await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "one" }));
            const stream = await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "two", stream: true }));
            await stream.text();

            expect(currentScope()?.run.costUsd).toBe(1.5);
            const refused = await monitored(URL_RESPONSES, post({ model: "gpt-5.4-mini", input: "three" }));
            expect(refused.status).toBe(403);
        });

        expect(fake.bodies).toHaveLength(2);
        expect(limitDecisions()).toEqual([["max-cost", "block", true, "gpt-5.4-mini"]]);
    });

    it("adds no cost for a model with no known price", async () => {
        const monitored = createMonitorFetch(fakeResponses(() => ({ text: "ok", usage: USAGE })).fetch);

        await runScope({}, async () => {
            await monitored(URL_RESPONSES, post({ model: "my-local-model", input: "one" }));

            expect(currentScope()?.run).toMatchObject({ modelCalls: 1, costUsd: 0 });
        });
    });

    it("counts a call that fails, but not other or unreadable requests", async () => {
        const inner = vi.fn(async () => new Response("bad", { status: 500 }));
        const monitored = createMonitorFetch(inner);

        await runScope({}, async () => {
            await monitored("https://api.openai.com/v1/models");
            await monitored(URL_RESPONSES, { method: "POST", body: "not json" });
            await monitored(URL_RESPONSES, post({ model: "m", input: "x" }));

            expect(currentScope()?.run.modelCalls).toBe(1);
        });
        expect(inner).toHaveBeenCalledTimes(3);
    });
});
