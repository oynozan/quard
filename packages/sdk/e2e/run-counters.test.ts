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

// A refused call leaves the run's counters in control as they were
describe("a refused call in a run that spans processes", () => {
    function payTool(options: object) {
        const pay = vi.fn(async (input: { url?: string; amount?: number }) => `paid ${input.url ?? input.amount}`);
        return { pay, payInvoice: guard(pay, { type: "limit", name: "payInvoice", ...options }) };
    }

    it("is not counted when the fleet check refuses it", async () => {
        const evil = ["evil-1.com", "evil-2.com", "evil-3.com"];
        server.state.quarantined = evil.map((host) => ({ key: `domain:${host}`, observe: false }));
        const runId = newRunId();
        const { pay, payInvoice } = payTool({ maxCallsPerRun: 2, fleetCheck: ["url"] });

        const outs = await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            const tries = [];
            for (const host of evil) {
                tries.push(await payInvoice({ url: `https://${host}/inv` }));
            }
            return [...tries, await payInvoice({ url: "https://acme.com/inv" })];
        });

        expect(blocked()).toEqual(["fleet-check", "fleet-check", "fleet-check"]);
        expect(outs[3]).toBe("paid https://acme.com/inv");
        expect(pay).toHaveBeenCalledTimes(1);
        expect(server.counters.get(`run/${runId}/calls:payInvoice`)).toBe(1);
    });

    it("is not counted when a per-day limit refuses it", async () => {
        server.counters.set(`${new Date().toISOString().slice(0, 10)}/payInvoice/calls`, 1);
        const runId = newRunId();
        const { pay, payInvoice } = payTool({ maxCallsPerRun: 5, maxCallsPerDay: 1 });

        const out = await quard.run({ agent: "billing", runId }, async () => {
            shareHere();
            return payInvoice({ amount: 1 });
        });

        expect(isGuardRefusal(out)).toBe(true);
        expect(blocked()).toEqual(["max-calls-per-day"]);
        expect(pay).not.toHaveBeenCalled();
        expect(server.counters.get(`run/${runId}/calls:payInvoice`)).toBeUndefined();
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
