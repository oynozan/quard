import { newRunId, type RunEvent } from "@quard/shared";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSharing } from "../context/shared-run.ts";
import { currentScope, type Scope } from "../context/scope.ts";
import { guard, isGuardRefusal, quard } from "../index.ts";
import { forgetRuns } from "../labels/records.ts";
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
    it("shares its counters once a message carries it to another process", async () => {
        const pay = vi.fn(async (input: { amount: number }) => `paid ${input.amount}`);
        const payInvoice = guard(pay, { type: "limit", name: "payInvoice", maxCallsPerRun: 3 });

        const carrier = await quard.run({ agent: "orchestrator" }, async () => {
            await payInvoice({ amount: 1 });
            await payInvoice({ amount: 2 });
            return quard.inject({ content: "Pay the last invoice" });
        });
        // As if the receiver ran in another process
        forgetRuns();
        const outs = await quard.resume(
            carrier,
            async () => [await payInvoice({ amount: 3 }), await payInvoice({ amount: 4 })],
            {
                agent: "billing",
            },
        );

        expect(outs[0]).toBe("paid 3");
        expect(isGuardRefusal(outs[1])).toBe(true);
        expect(pay).toHaveBeenCalledTimes(3);
    });

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

// Control can only add to a run's counters, so per-run counts come first
describe("a refused call in a run that spans processes", () => {
    const today = () => new Date().toISOString().slice(0, 10);

    function payTool(options: object) {
        const pay = vi.fn(async (input: { url?: string; amount?: number }) => `paid ${input.url ?? input.amount}`);
        return { pay, payInvoice: guard(pay, { type: "limit", name: "payInvoice", ...options }) };
    }

    it("uses no per-day slot when a per-run limit refuses it", async () => {
        const runId = newRunId();
        const { pay, payInvoice } = payTool({ maxCallsPerRun: 2, maxCallsPerDay: 100 });

        const outs = await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            return Promise.all(Array.from({ length: 6 }, (_, n) => payInvoice({ amount: n })));
        });

        expect(outs.filter((out) => isGuardRefusal(out))).toHaveLength(4);
        expect(pay).toHaveBeenCalledTimes(2);
        expect(server.counters.get(`run/${runId}/calls:payInvoice`)).toBe(2);
        expect(server.counters.get(`${today()}/payInvoice/calls`)).toBe(2);
    });

    it("reports its watched values once, as blocked, when a per-run limit refuses it", async () => {
        const runId = newRunId();
        const { payInvoice } = payTool({ maxCallsPerRun: 1, fleetCheck: ["url"] });

        await quard.run({ agent: "billing", runId }, async () => {
            await payInvoice({ url: "https://acme.com/a" });
            shareHere();
        });
        // The second process has not seen the first call yet
        await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            await payInvoice({ url: "https://acme.com/b" });
        });
        await server.waitFor("fleet", (message) => message.blocked);

        const fleet = server.received.flatMap((message) => (message.type === "fleet" ? [message.blocked] : []));
        expect(fleet).toEqual([false, true]);
        expect(blocked()).toEqual(["max-calls-per-run"]);
    });

    it("keeps its per-run count in control, but not its per-day count, when the fleet check refuses it", async () => {
        server.state.quarantined = [{ key: "domain:evil.com", observe: false }];
        const runId = newRunId();
        const { pay, payInvoice } = payTool({ maxCallsPerRun: 5, maxCallsPerDay: 5, fleetCheck: ["url"] });

        const outs = await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            return [
                await payInvoice({ url: "https://evil.com/inv" }),
                await payInvoice({ url: "https://acme.com/inv" }),
            ];
        });

        expect(blocked()).toEqual(["fleet-check"]);
        expect(outs[1]).toBe("paid https://acme.com/inv");
        expect(pay).toHaveBeenCalledTimes(1);
        expect(server.counters.get(`run/${runId}/calls:payInvoice`)).toBe(2);
        expect(server.counters.get(`${today()}/payInvoice/calls`)).toBe(1);
    });

    it("keeps its per-run count in control when a per-day limit refuses it", async () => {
        server.counters.set(`${today()}/payInvoice/calls`, 1);
        const runId = newRunId();
        const { pay, payInvoice } = payTool({ maxCallsPerRun: 5, maxCallsPerDay: 1 });

        const out = await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            return payInvoice({ amount: 1 });
        });

        expect(isGuardRefusal(out)).toBe(true);
        expect(blocked()).toEqual(["max-calls-per-day"]);
        expect(pay).not.toHaveBeenCalled();
        expect(server.counters.get(`run/${runId}/calls:payInvoice`)).toBe(1);
    });

    it("keeps its call count out when its amount is over the run's cap", async () => {
        const runId = newRunId();
        const { pay, payInvoice } = payTool({ maxCallsPerRun: 5, maxAmountPerRun: { field: "amount", max: 1000 } });

        await quard.run({ agent: "billing", runId }, async () => {
            await payInvoice({ amount: 900 });
            shareHere();
        });
        // The second process has not seen the 900 yet
        const out = await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            return payInvoice({ amount: 200 });
        });

        expect(isGuardRefusal(out)).toBe(true);
        expect(blocked()).toEqual(["max-amount-per-run"]);
        expect(pay).toHaveBeenCalledTimes(1);
        expect(server.counters.get(`run/${runId}/calls:payInvoice`)).toBe(1);
        expect(server.counters.get(`run/${runId}/amount:payInvoice:amount`)).toBe(900);
    });
});
