import { newRunId, type RunEvent } from "@quard/shared";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSharing } from "../context/shared-run.ts";
import { currentScope, type Scope } from "../context/scope.ts";
import { guard, isGuardRefusal, quard } from "../index.ts";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../test/control-server.ts";
import { fakeResponses } from "../test/fake-responses.ts";
import { resetAll } from "../test/reset.ts";
import { activeControl } from "../transport/link/active.ts";

// One run in two processes, here two run states with the same id, whose
// counters meet in a stand-in for control over a real WebSocket

let server: ControlServer;
let events: RunEvent[] = [];

beforeEach(async () => {
    server = await startControlServer();
    events = [];
    quard.configure({
        key: CONTROL_KEY,
        controlUrl: server.url,
        hashKey: "ab".repeat(32),
        onEvent: (event) => events.push(event),
    });
    await vi.waitFor(() => expect(activeControl()?.link.ready()).toBe(true));
});

afterEach(async () => {
    resetAll();
    await server.close();
});

function shareHere(): void {
    startSharing((currentScope() as Scope).run);
}

function blocked(): string[] {
    return events.flatMap((event) =>
        event.type === "decision" && event.decision === "block" && event.mode === "block" ? [event.rule] : [],
    );
}

describe("a run that spans processes", () => {
    it("caps a tool's calls across both processes", async () => {
        const runId = newRunId();
        const pay = vi.fn(async (input: { amount: number }) => `paid ${input.amount}`);
        const payInvoice = guard(pay, { type: "limit", name: "payInvoice", maxCallsPerRun: 3 });

        // The first process pays twice before the run crosses over
        await quard.run({ agent: "billing", runId }, async () => {
            await payInvoice({ amount: 1 });
            await payInvoice({ amount: 2 });
            shareHere();
        });
        // The second process starts with nothing counted
        const outs = await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            return [await payInvoice({ amount: 3 }), await payInvoice({ amount: 4 })];
        });

        expect(outs[0]).toBe("paid 3");
        expect(isGuardRefusal(outs[1])).toBe(true);
        expect(pay).toHaveBeenCalledTimes(3);
        expect(server.counters.get(`run/${runId}/calls:payInvoice`)).toBe(3);
        expect(blocked()).toEqual(["max-calls-per-run"]);
    });

    it("caps model calls across both processes", async () => {
        quard.configure({ runLimits: { mode: "block", steps: 2 } });
        const runId = newRunId();
        const fake = fakeResponses(() => ({ text: "ok" }));
        const client = quard.wrap(new OpenAI({ apiKey: "sk-test", fetch: fake.fetch, maxRetries: 0 }));
        const ask = () => client.responses.create({ model: "gpt-5.4-mini", input: "hi" });

        await quard.run({ agent: "planner", runId }, async () => {
            await ask();
            shareHere();
        });
        const refused = await quard.run({ agent: "writer", runId }, async () => {
            shareHere();
            await ask();
            return ask().catch((error: unknown) => error);
        });

        expect(refused).toBeInstanceOf(OpenAI.APIError);
        expect(fake.bodies).toHaveLength(2);
        expect(server.counters.get(`run/${runId}/steps`)).toBe(2);
        expect(blocked()).toEqual(["max-steps"]);
    });
});
