import { labelFor } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../core/recorder.ts";
import { findCall, findConversation, findResponse, registerCall, registerResponse } from "../context/registry.ts";
import { currentScope, newScope, runScope } from "../context/scope.ts";
import { withoutRunStarts } from "../test/call.ts";
import { fakeResponses } from "../test/fake-responses.ts";
import { resetAll } from "../test/reset.ts";
import { createMonitorFetch } from "./fetch.ts";

afterEach(() => {
    resetAll();
});

const URL_RESPONSES = "https://api.openai.com/v1/responses";
const IBAN = "DE89370400440532013000";
const post = (body: object): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const ok = () => fakeResponses(() => ({ text: "ok" }));

function events() {
    return withoutRunStarts(takeEvents());
}

describe("createMonitorFetch", () => {
    it("passes other requests through untouched", async () => {
        const inner = vi.fn(async () => new Response("models"));

        const response = await createMonitorFetch(inner)("https://api.openai.com/v1/models");

        expect(await response.text()).toBe("models");
        expect(takeEvents()).toEqual([]);
    });

    it("reports a Responses call it can't read and passes it on", async () => {
        const inner = vi.fn(async () => new Response("{}"));

        await createMonitorFetch(inner)(URL_RESPONSES, { method: "POST", body: "not json" });
        await runScope({ agent: "scoped" }, () =>
            createMonitorFetch(inner)(URL_RESPONSES, { method: "POST", body: "nope" }),
        );

        expect(inner).toHaveBeenCalledTimes(2);
        expect(events().map((event) => [event.type, event.agent])).toEqual([
            ["warning", "default"],
            ["warning", "scoped"],
        ]);
    });

    it("labels the input, checks requested calls and records the model call", async () => {
        const fake = fakeResponses(() => ({ calls: [{ name: "fetchPage", args: { url: "https://a.com" } }] }));

        const response = await createMonitorFetch(fake.fetch)(
            URL_RESPONSES,
            post({ model: "gpt", input: "read https://a.com" }),
        );
        const body = (await response.json()) as { id: string; output: Array<{ call_id: string }> };

        expect(findCall(body.output[0]?.call_id as string)).toBeDefined();
        expect(findResponse(body.id)).toBeDefined();
        expect(events().map((event) => event.type)).toEqual(["content", "decision", "warning", "model_call"]);
    });

    it("joins the run of the previous response, the conversation or a known tool call", async () => {
        const monitored = createMonitorFetch(ok().fetch);
        const byResponse = newScope({ agent: "a" });
        const byCall = newScope({ agent: "b" });
        registerResponse("resp_prev", byResponse);
        registerCall({ callId: "call_known", tool: "t", args: {}, scope: byCall, stepId: "s" });

        await monitored(URL_RESPONSES, post({ input: "x", previous_response_id: "resp_prev" }));
        await monitored(
            URL_RESPONSES,
            post({ input: [{ type: "function_call_output", call_id: "call_known", output: "y" }] }),
        );
        await monitored(URL_RESPONSES, post({ input: "first", conversation: "conv_1" }));
        await monitored(URL_RESPONSES, post({ input: "second", conversation: "conv_1" }));

        const calls = events().filter((event) => event.type === "model_call");
        expect(calls.map((event) => event.agent)).toEqual(["a", "b", "default", "default"]);
        // Both turns of conv_1 share one run
        expect(calls[2]?.runId).toBe(calls[3]?.runId);
        expect(findConversation("conv_1")?.run.runId).toBe(calls[2]?.runId);
    });

    it("counts history it never saw as untrusted", async () => {
        const monitored = createMonitorFetch(ok().fetch);

        await runScope({}, async () => {
            await monitored(URL_RESPONSES, post({ input: "x", previous_response_id: "resp_missing" }));

            expect(currentScope()?.run.index.context().trust).toBe("untrusted");
        });
        await runScope({}, async () => {
            await monitored(URL_RESPONSES, post({ input: "y", conversation: { id: "conv_new" } }));

            expect(currentScope()?.run.index.context().origins).toContain("unknown");
        });
    });

    it("brings the labels of a chained run into a new scope", async () => {
        const monitored = createMonitorFetch(ok().fetch);
        const earlier = newScope();
        earlier.run.index.add(`page with ${IBAN}`, labelFor("web:evil.com"), "s1");
        registerResponse("resp_old", earlier);

        await runScope({}, async () => {
            await monitored(URL_RESPONSES, post({ input: "go on", previous_response_id: "resp_old" }));

            expect(currentScope()?.run.index.lookup([`iban:${IBAN}`])[0]?.origin).toBe("web:evil.com");
        });
    });

    it("uses the current scope first", async () => {
        await runScope({ agent: "scoped" }, async () => {
            await createMonitorFetch(ok().fetch)(URL_RESPONSES, post({ input: "x" }));

            expect(currentScope()?.lastStepId).toBeDefined();
        });

        expect(takeEvents().at(-1)).toMatchObject({ agent: "scoped" });
    });

    it("labels tool results with their guard's label, without values echoed from the arguments", async () => {
        const scope = newScope();
        const known = registerCall({ callId: "call_a", tool: "lookup", args: { q: IBAN }, scope, stepId: "s" });
        known.outputLabel = labelFor("tool:lookup");

        await createMonitorFetch(ok().fetch)(
            URL_RESPONSES,
            post({
                input: [
                    { type: "function_call_output", call_id: "call_a", output: `No record matches ${IBAN} or x@a.com` },
                ],
            }),
        );

        const content = events().find((event) => event.type === "content");
        expect(content).toMatchObject({ origin: "tool:lookup", keys: ["email:x@a.com", "host:a.com", "domain:a.com"] });
    });

    it("labels unknown tool results as unknown and keeps earlier labels for repeated values", async () => {
        await runScope({}, async () => {
            currentScope()?.run.index.add(`page with ${IBAN}`, labelFor("web:evil.com"), "s1");

            await createMonitorFetch(ok().fetch)(
                URL_RESPONSES,
                post({
                    input: [
                        { role: "user", content: `Here is the page: ${IBAN}` },
                        { type: "function_call_output", call_id: "call_b", output: "from nowhere" },
                        { type: "function_call_output", call_id: "call_b", output: "from nowhere" },
                    ],
                }),
            );

            const lookup = currentScope()?.run.index.lookup([`iban:${IBAN}`]) ?? [];
            expect(lookup.map((o) => o.origin)).toEqual(["web:evil.com"]);
        });

        const origins = events()
            .filter((event) => event.type === "content")
            .map((event) => event.origin);
        expect(origins).toEqual(["user", "unknown"]);
    });

    it("records failed model calls and returns the response as is", async () => {
        const failing = createMonitorFetch(async () => new Response("bad", { status: 500 }));
        const empty = createMonitorFetch(async () => new Response(null, { status: 200 }));

        expect((await failing(URL_RESPONSES, post({ input: "x" }))).status).toBe(500);
        expect((await empty(URL_RESPONSES, post({ input: "y" }))).status).toBe(200);
        expect(
            events()
                .filter((event) => event.type === "model_call")
                .map((event) => event.status),
        ).toEqual(["error", "error"]);
    });

    it("records a response that has no id", async () => {
        await createMonitorFetch(async () => new Response("{}"))(URL_RESPONSES, post({ input: "x" }));

        expect(takeEvents().at(-1)).toMatchObject({ type: "model_call", status: "ok", responseId: undefined });
    });

    it("records a model call that throws and re-throws", async () => {
        const broken = createMonitorFetch(async () => {
            throw new Error("network down");
        });

        await expect(broken(URL_RESPONSES, post({ input: "x" }))).rejects.toThrow("network down");
        expect(takeEvents().at(-1)).toMatchObject({ type: "model_call", status: "error" });
    });

    it("checks each tool call in a stream once and passes every byte through", async () => {
        const fake = fakeResponses(() => ({ calls: [{ name: "fetchPage", args: { url: "https://a.com" } }] }));

        const response = await createMonitorFetch(fake.fetch)(URL_RESPONSES, post({ input: "x", stream: true }));

        expect(await response.text()).toContain("response.completed");
        expect(events().filter((event) => event.type === "decision")).toHaveLength(1);
    });

    it("finishes a stream that ends incomplete or failed", async () => {
        const stream = (type: string) =>
            createMonitorFetch(
                async () => new Response(`data: {"type":"${type}","response":{"id":"resp_${type}","output":[]}}\n\n`),
            );

        await (await stream("response.incomplete")(URL_RESPONSES, post({ input: "a", stream: true }))).text();
        await (await stream("response.failed")(URL_RESPONSES, post({ input: "b", stream: true }))).text();

        const calls = events().filter((event) => event.type === "model_call");
        expect(calls.map((event) => event.status)).toEqual(["ok", "error"]);
        expect(findResponse("resp_response.failed")).toBeDefined();
    });

    it("ignores stream events it does not know or cannot read", async () => {
        const raw = [
            'data: {"type":"response.output_item.added","item":{"type":"message","id":"m1"}}',
            'data: {"type":"response.function_call_arguments.done","item_id":"unknown","arguments":"{}"}',
            'data: {"type":"response.output_item.done","item":{"type":"message"}}',
            "data: [DONE]",
            "",
        ].join("\n\n");

        const response = await createMonitorFetch(async () => new Response(raw))(
            URL_RESPONSES,
            post({ input: "x", stream: true }),
        );

        expect(await response.text()).toBe(raw);
        expect(events().filter((event) => event.type !== "content")).toEqual([]);
    });
});
