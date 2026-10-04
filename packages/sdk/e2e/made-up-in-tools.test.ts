import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { guard, isGuardRefusal, quard, type Carrier } from "../index.ts";
import { guardedTool, quardRunner } from "../integrations/openai-agents/index.ts";
import { scriptedClient, testAgent, toolResults } from "../test/openai-agents.ts";
import { resetAll } from "../test/reset.ts";

// The model made up an IBAN. A memory read or a received message inside
// an app's own guarded tool must not make it "seen" through that tool.

const IBAN = "DE89370400440532013000";
const NOTE = `Pay invoice 114 to ${IBAN}.`;

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function neverSeenBlocks(): string[] {
    return events.flatMap((event) =>
        event.type === "decision" && event.reason === "recipient_never_seen" ? [event.tool] : [],
    );
}

function notes() {
    const items = new Map<string, string>();
    return quard.memory(
        {
            get: (key: string) => items.get(key),
            put: (key: string, value: string) => void items.set(key, value),
            search: (query: string) => [...items.values()].filter((value) => value.includes(query)),
        },
        { name: "kb" },
    );
}

// A trusted read first, so the run's memory writes are trusted
function orderTool() {
    return guard(async (_input: { order: string }) => "Order 114 for Acme Supplies", {
        type: "limit",
        name: "getOrder",
    });
}

function payTool() {
    const rawPay = vi.fn(async (_input: { iban: string }) => "paid");
    const pay = guard(rawPay, {
        type: "action",
        name: "pay",
        rules: [{ field: "iban", neverSeen: true, onFail: "block" }],
    });
    return { rawPay, pay };
}

describe("a made-up IBAN read back inside a guarded tool", () => {
    it("stays never seen when the tool returns the memory item in an object", async () => {
        const { rawPay, pay } = payTool();
        const getOrder = orderTool();
        const kb = notes();
        const saveNote = guard(async (_input: { title: string }) => void (await kb.put("n", NOTE)), {
            type: "limit",
            name: "saveNote",
        });
        const readNote = guard(async (input: { key: string }) => ({ key: input.key, note: await kb.get("n") }), {
            type: "limit",
            name: "readNote",
        });

        const out = await quard.run({ agent: "billing" }, async () => {
            await getOrder({ order: "114" });
            expect(isGuardRefusal(await pay({ iban: IBAN }))).toBe(true);
            await saveNote({ title: "invoice 114" });
            await readNote({ key: "n" });
            return pay({ iban: IBAN });
        });

        expect(isGuardRefusal(out)).toBe(true);
        expect(rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["pay", "pay"]);
    });

    it("stays never seen when the tool returns a received message", async () => {
        const { rawPay, pay } = payTool();
        let inbox: { brief: string; carrier: Carrier } | undefined;
        const receive = guard(async (_input: { queue: string }) => inbox?.brief, {
            type: "source",
            origin: "agent",
            name: "receive",
            carrierOf: () => inbox?.carrier,
        });
        const checkInbox = guard(async (input: { queue: string }) => ({ brief: await receive(input) }), {
            type: "limit",
            name: "checkInbox",
        });
        const getOrder = orderTool();
        await quard.run({ agent: "orchestrator" }, async () => {
            await getOrder({ order: "114" });
            inbox = { brief: NOTE, carrier: await quard.inject({ content: NOTE }) };
        });

        const out = await quard.resume(
            inbox?.carrier,
            async () => {
                await checkInbox({ queue: "billing" });
                return pay({ iban: IBAN });
            },
            { agent: "billing" },
        );

        expect(isGuardRefusal(out)).toBe(true);
        expect(rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["pay"]);
    });
});

describe("a made-up IBAN read back inside an Agents SDK tool", () => {
    const PAY = { name: "payInvoice", args: { iban: IBAN } };

    type Shape = "list" | "object" | "json";

    function agentTools(shape: Shape) {
        const kb = notes();
        const rawPay = vi.fn(async (_input: { iban: string }) => "paid");
        const saveNote = guardedTool({
            name: "saveNote",
            description: "Save a note",
            parameters: z.object({ note: z.string() }),
            execute: async ({ note }) => void (await kb.put("n", note)),
            guard: { type: "limit" },
        });
        const findNotes = guardedTool({
            name: "findNotes",
            description: "Find notes",
            parameters: z.object({ query: z.string() }),
            execute: async ({ query }) => {
                const found = await kb.search(query);
                return shape === "list" ? found : shape === "object" ? { found } : JSON.stringify({ found });
            },
            guard: { type: "limit" },
        });
        const payInvoice = guardedTool({
            name: "payInvoice",
            description: "Pay an invoice",
            parameters: z.object({ iban: z.string() }),
            execute: rawPay,
            guard: { type: "action", rules: [{ field: "iban", neverSeen: true, onFail: "block" }] },
        });
        return { rawPay, tools: [saveNote, findNotes, payInvoice] };
    }

    it.each<Shape>(["list", "object", "json"])(
        "stays never seen when the tool returns the result as %s",
        async (shape) => {
            const { rawPay, tools } = agentTools(shape);
            const { client, bodies } = scriptedClient({
                billing: [
                    { calls: [PAY] },
                    { calls: [{ name: "saveNote", args: { note: NOTE } }] },
                    { calls: [{ name: "findNotes", args: { query: "invoice" } }] },
                    { calls: [PAY] },
                    { text: "I did not pay." },
                ],
            });

            await quardRunner({ client }).run(testAgent("billing", { tools }), "Pay invoice 114.");

            expect(rawPay).not.toHaveBeenCalled();
            expect(neverSeenBlocks()).toEqual(["payInvoice", "payInvoice"]);
            expect(toolResults(bodies.at(-1) as Record<string, unknown>).findNotes).toContain(IBAN);
        },
    );
});
