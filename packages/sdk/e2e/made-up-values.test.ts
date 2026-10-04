import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, isGuardRefusal, quard, type Carrier } from "../index.ts";
import { forgetRuns } from "../labels/records.ts";
import { resetAll } from "../test/reset.ts";

// The orchestrator read only trusted content. Its model made up an IBAN
// and sent it in a brief. The brief must not make that IBAN "seen".

const IBAN = "DE89370400440532013000";
const BRIEF = `Pay invoice 114 to ${IBAN}.`;

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function makeAgents() {
    let inbox: { brief: string; carrier: Carrier } | undefined;
    const getOrder = guard(async (_input: { order: string }) => "Order 114 for Acme Supplies, 4950 EUR", {
        type: "limit",
        name: "getOrder",
    });
    const rawPay = vi.fn(async (_input: { iban: string }) => "paid");
    const pay = guard(rawPay, {
        type: "action",
        name: "pay",
        rules: [{ field: "iban", neverSeen: true, onFail: "block" }],
    });
    const receive = guard(async (_input: { queue: string }) => inbox?.brief, {
        type: "source",
        origin: "agent",
        name: "receive",
        carrierOf: () => inbox?.carrier,
    });
    const orchestrate = () =>
        quard.run({ agent: "orchestrator" }, async () => {
            await getOrder({ order: "114" });
            const refused = await pay({ iban: IBAN });
            inbox = { brief: BRIEF, carrier: await quard.inject({ content: BRIEF }) };
            return refused;
        });
    const billing = async () => {
        await receive({ queue: "billing" });
        return pay({ iban: IBAN });
    };
    return { rawPay, pay, getOrder, orchestrate, billing, carrier: () => inbox?.carrier };
}

function neverSeenBlocks() {
    return events.flatMap((event) =>
        event.type === "decision" && event.reason === "recipient_never_seen" ? [event.agent] : [],
    );
}

describe("an IBAN the sender's model made up", () => {
    it("stays never seen in a receiver in another process", async () => {
        const agents = makeAgents();
        expect(isGuardRefusal(await agents.orchestrate())).toBe(true);
        forgetRuns();

        const out = await quard.resume(agents.carrier(), agents.billing, { agent: "billing" });

        expect(isGuardRefusal(out)).toBe(true);
        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["orchestrator", "billing"]);
    });

    it("stays never seen in a receiver in the same process", async () => {
        const agents = makeAgents();
        await agents.orchestrate();

        const out = await quard.resume(agents.carrier(), agents.billing, { agent: "billing" });

        expect(isGuardRefusal(out)).toBe(true);
        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["orchestrator", "billing"]);
    });
});

describe("an IBAN the model made up and wrote to memory", () => {
    it("stays never seen when the same run reads it back", async () => {
        const agents = makeAgents();
        const items = new Map<string, string>();
        const kb = quard.memory(
            { get: (key: string) => items.get(key), put: (key: string, value: string) => void items.set(key, value) },
            { name: "kb" },
        );

        const out = await quard.run({ agent: "billing" }, async () => {
            await agents.getOrder({ order: "114" });
            await agents.pay({ iban: IBAN });
            await kb.put("note", BRIEF);
            await kb.get("note");
            return agents.pay({ iban: IBAN });
        });

        expect(isGuardRefusal(out)).toBe(true);
        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["billing", "billing"]);
    });
});
