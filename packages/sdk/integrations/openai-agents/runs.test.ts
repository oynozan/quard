import { Agent, OpenAIProvider, RunContext, Runner, tool } from "@openai/agents";
import { assistantMessage, functionCall, ScriptedModel } from "@openai/agents/testing";
import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { quard } from "../../index.ts";
import { currentScope } from "../../context/scope.ts";
import { modelCalls, scriptedClient, testAgent } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function types(): string[] {
    return events.map((event) => event.type).filter((type) => type.startsWith("run_") || type === "handoff");
}

// The orchestrator hands off to billing, which answers
function handoffAgents() {
    const billing = testAgent("billing");
    const orchestrator = testAgent("orchestrator", { handoffs: [billing] });
    const { client, bodies } = scriptedClient({
        orchestrator: [{ calls: [{ name: "transfer_to_billing", args: {} }] }],
        billing: [{ text: "Paid." }],
    });
    return { orchestrator, billing, client, bodies };
}

describe("a run() outside any quard scope", () => {
    it("starts a Quard run named after the first agent, and a handoff switches the agent", async () => {
        const { orchestrator, client } = handoffAgents();

        const result = await quardRunner({ client }).run(orchestrator, "Pay invoice 114.");

        expect(result.finalOutput).toBe("Paid.");
        expect(types()).toEqual(["run_started", "handoff", "run_finished"]);
        expect(events[0]).toMatchObject({ agent: "orchestrator" });
        expect(events.at(-1)).toMatchObject({ agent: "orchestrator", status: "completed" });
        expect(modelCalls(events).map((call) => call.agent)).toEqual(["orchestrator", "billing"]);
        expect(currentScope()).toBeUndefined();
    });

    it("records a run that fails, and passes the error on", async () => {
        const { orchestrator, client } = handoffAgents();
        const runner = quardRunner({ client });

        await runner.run(orchestrator, "Pay invoice 114.");
        await expect(runner.run(orchestrator, "Again.")).rejects.toThrow();

        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "failed" });
    });

    it("ends a streamed run when its stream completes", async () => {
        const { orchestrator, client } = handoffAgents();

        const result = await quardRunner({ client }).run(orchestrator, "Pay invoice 114.", { stream: true });
        expect(types()).not.toContain("run_finished");
        for await (const _event of result) {
            // Reads the stream to its end
        }
        await result.completed;
        await new Promise((resolve) => setImmediate(resolve));

        expect(types()).toEqual(["run_started", "handoff", "run_finished"]);
        expect(modelCalls(events).map((call) => call.agent)).toEqual(["orchestrator", "billing"]);
    });

    it("records a streamed run whose stream fails", async () => {
        const { orchestrator, client } = handoffAgents();
        const runner = quardRunner({ client });
        await runner.run(orchestrator, "Pay invoice 114.");

        const result = await runner.run(orchestrator, "Again.", { stream: true });
        await expect(result.completed).rejects.toThrow();
        await new Promise((resolve) => setImmediate(resolve));

        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "failed" });
    });
});

describe("a run() inside a quard scope", () => {
    it("joins the scope's run and leaves the scope's agent as it was", async () => {
        const { orchestrator, client } = handoffAgents();

        await quard.run({ agent: "app" }, async () => {
            const scope = currentScope();
            await quardRunner({ client }).run(orchestrator, "Pay invoice 114.");

            expect(currentScope()).toBe(scope);
            expect(scope?.agent).toBe("app");
        });

        const runIds = new Set(events.flatMap((event) => ("runId" in event ? [event.runId] : [])));
        expect(runIds.size).toBe(1);
        expect(types()).toEqual(["run_started", "handoff", "run_finished"]);
        expect(modelCalls(events).map((call) => call.agent)).toEqual(["orchestrator", "billing"]);
    });
});

describe("a streamed run() inside a quard scope", () => {
    it("passes a failed stream on to the app", async () => {
        const { orchestrator, client } = handoffAgents();
        const runner = quardRunner({ client });
        await runner.run(orchestrator, "Pay invoice 114.");

        const failed = quard.run({ agent: "app" }, async () => {
            const result = await runner.run(orchestrator, "Again.", { stream: true });
            await result.completed;
        });

        await expect(failed).rejects.toThrow();
    });
});

describe("a resumed run", () => {
    it("goes on in the same Quard run with the agent it stopped at", async () => {
        const send = tool({
            name: "sendReceipt",
            description: "Send the receipt",
            parameters: z.object({}),
            needsApproval: true,
            execute: async () => "sent",
        });
        const billing = testAgent("billing", { tools: [send] });
        const orchestrator = testAgent("orchestrator", { handoffs: [billing] });
        const { client } = scriptedClient({
            orchestrator: [{ calls: [{ name: "transfer_to_billing", args: {} }] }],
            billing: [{ calls: [{ name: "sendReceipt", args: {} }] }, { text: "Sent." }],
        });
        const runner = quardRunner({ client });

        const first = await runner.run(orchestrator, "Pay and send the receipt.");
        const [approval] = first.interruptions;
        expect(approval).toBeDefined();
        first.state.approve(approval as NonNullable<typeof approval>);
        expect(types()).toEqual(["run_started", "handoff"]);
        const runId = events.find((event) => event.type === "run_started")?.runId;
        events = [];
        const second = await runner.run(orchestrator, first.state);

        expect(second.finalOutput).toBe("Sent.");
        expect(types()).toEqual(["run_finished"]);
        expect(events.at(-1)).toMatchObject({ runId, agent: "orchestrator", status: "completed" });
        expect(modelCalls(events).map((call) => [call.agent, call.runId])).toEqual([["billing", runId]]);
    });
});

describe("agents with a Model object of their own", () => {
    it("skip the wrapped client, while their guarded tools still carry the right agent", async () => {
        const noteDown = guardedTool({
            name: "noteDown",
            description: "Write a note",
            parameters: z.object({ text: z.string() }),
            execute: async () => "noted",
            guard: { type: "limit", maxCallsPerRun: 5 },
        });
        const billing = new Agent({
            name: "billing",
            model: new ScriptedModel([
                [functionCall("noteDown", { text: "Invoice 114" }, { callId: "call_2" })],
                [assistantMessage("Noted.")],
            ]),
            tools: [noteDown],
        });
        const orchestrator = new Agent({
            name: "orchestrator",
            model: new ScriptedModel([[functionCall("transfer_to_billing", {}, { callId: "call_1" })]]),
            handoffs: [billing],
        });

        await quardRunner({ client: scriptedClient({}).client }).run(orchestrator, "Note invoice 114.");

        expect(modelCalls(events)).toEqual([]);
        const [handoff] = events.filter((event) => event.type === "handoff");
        expect(handoff).toMatchObject({ agent: "orchestrator", to: "billing" });
        expect(events.find((event) => event.type === "tool_call")).toMatchObject({
            agent: "billing",
            tool: "noteDown",
            status: "ok",
        });
    });
});

describe("following runners", () => {
    it("leaves runners that quardRunner() did not make as they are", async () => {
        quardRunner({ client: scriptedClient({}).client });
        const { orchestrator, client } = handoffAgents();
        const plain = new Runner({ modelProvider: new OpenAIProvider({ openAIClient: quard.wrap(client) }) });

        await quard.run({ agent: "app" }, () => plain.run(orchestrator, "Pay invoice 114."));

        expect(types()).toEqual(["run_started", "run_finished"]);
        expect(modelCalls(events).map((call) => call.agent)).toEqual(["app", "app"]);
    });

    it("watches a runner once, however often it runs", async () => {
        const billing = testAgent("billing");
        const orchestrator = testAgent("orchestrator", { handoffs: [billing] });
        const turns = () => ({
            orchestrator: [{ calls: [{ name: "transfer_to_billing", args: {} }] }],
            billing: [{ text: "Paid." }],
        });
        const scripts = turns();
        const { client } = scriptedClient(scripts);
        const runner = quardRunner({ client });

        await runner.run(orchestrator, "One.");
        Object.assign(scripts, turns());
        await runner.run(orchestrator, "Two.");

        expect(types().filter((type) => type === "handoff")).toHaveLength(2);
    });

    it("ignores a handoff hook that fires outside a run", async () => {
        const runner = quardRunner({ client: scriptedClient({}).client });
        // The run fails at its first model call, after the runner is watched
        await expect(runner.run(testAgent("idle"), "Hello.")).rejects.toThrow();
        events = [];

        runner.emit("agent_handoff", new RunContext(), new Agent({ name: "a" }), new Agent({ name: "b" }));

        expect(events).toEqual([]);
    });
});
