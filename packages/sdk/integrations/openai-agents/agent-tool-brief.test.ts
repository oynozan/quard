import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { quard } from "../../index.ts";
import { scriptedClient, testAgent } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

// An agent run as a tool gets the caller's brief as its user input. The
// brief is the caller model's words, not the user's.

const IBAN = "DE89370400440532013000";
const PAY = { name: "payInvoice", args: { iban: IBAN } };
const BILL = { name: "billing", args: { input: `Pay invoice 114 to ${IBAN}.` } };
const SUPPLIER = { name: "getSupplier", args: { name: "Acme" } };

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
        event.type === "decision" && event.reason === "recipient_never_seen" ? [event.agent] : [],
    );
}

function agents() {
    const rawPay = vi.fn(async (_input: { iban: string }) => "paid");
    const payInvoice = guardedTool({
        name: "payInvoice",
        description: "Pay an invoice",
        parameters: z.object({ iban: z.string() }),
        execute: rawPay,
        guard: { type: "action", rules: [{ field: "iban", neverSeen: true, onFail: "block" }] },
    });
    const getSupplier = guardedTool({
        name: "getSupplier",
        description: "Look a supplier up",
        parameters: z.object({ name: z.string() }),
        execute: async () => `Acme Supplies, IBAN ${IBAN}`,
        guard: { type: "limit" },
    });
    const billing = testAgent("billing", { tools: [payInvoice] });
    const orchestrator = testAgent("orchestrator", {
        tools: [payInvoice, getSupplier, billing.asTool({ toolName: "billing", toolDescription: "Pays invoices" })],
    });
    return { rawPay, orchestrator };
}

describe("an agent run as a tool", () => {
    it("keeps an IBAN the caller made up never seen when the brief carries it", async () => {
        const { rawPay, orchestrator } = agents();
        const { client } = scriptedClient({
            orchestrator: [{ calls: [PAY] }, { calls: [BILL] }, { text: "Done." }],
            billing: [{ calls: [PAY] }, { text: "I did not pay." }],
        });

        await quardRunner({ client }).run(orchestrator, "Pay invoice 114.");

        expect(rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["orchestrator", "billing"]);
    });

    it("labels the brief as the caller's words, with its context label", async () => {
        const { orchestrator } = agents();
        const { client } = scriptedClient({
            orchestrator: [{ calls: [BILL] }, { text: "Done." }],
            billing: [{ text: "I did not pay." }],
        });

        await quardRunner({ client }).run(orchestrator, "Pay invoice 114.");

        const read = events.flatMap((event) =>
            event.type === "content" && event.agent === "billing"
                ? [{ origin: event.origin, trust: event.trust, keys: event.keys }]
                : [],
        );
        expect(read).toEqual([
            { origin: "system", trust: "trusted", keys: [] },
            { origin: "agent:orchestrator", trust: "trusted", keys: [] },
        ]);
    });

    it("lets an IBAN the caller read from a trusted tool pass", async () => {
        const { rawPay, orchestrator } = agents();
        const { client } = scriptedClient({
            orchestrator: [{ calls: [SUPPLIER] }, { calls: [BILL] }, { text: "Done." }],
            billing: [{ calls: [PAY] }, { text: "Paid." }],
        });

        await quardRunner({ client }).run(orchestrator, "Pay invoice 114.");

        expect(rawPay).toHaveBeenCalledTimes(1);
        expect(neverSeenBlocks()).toEqual([]);
    });
});
