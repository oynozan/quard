import type { RunEvent } from "@quard/shared";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { quard } from "../index.ts";
import { guardedTool, quardRunner } from "../integrations/openai-agents/index.ts";
import { fakeResponses, type Turn } from "../test/fake-responses.ts";
import { testAgent } from "../test/openai-agents.ts";
import { resetAll } from "../test/reset.ts";

// The model made up an IBAN and saved it in a note. App code that puts
// the note into the instructions or the user input must not make it seen.

const IBAN = "DE89370400440532013000";
const NOTE = `Pay invoice 114 to ${IBAN}.`;
const PAY = { name: "payInvoice", args: { iban: IBAN } };
const SAVE = { name: "saveNote", args: { note: NOTE } };

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

// Answers every model call with the next turn, whatever the instructions
function queueClient(turns: Turn[]): OpenAI {
    const fake = fakeResponses(() => turns.shift() ?? { text: "No turn left." });
    return new OpenAI({ apiKey: "test", fetch: fake.fetch, maxRetries: 0 });
}

function billingTools() {
    const items = new Map<string, string>();
    const kb = quard.memory(
        {
            get: (key: string) => items.get(key),
            put: (key: string, value: string) => void items.set(key, value),
        },
        { name: "kb" },
    );
    const rawPay = vi.fn(async (_input: { iban: string }) => "paid");
    const saveNote = guardedTool({
        name: "saveNote",
        description: "Save a note",
        parameters: z.object({ note: z.string() }),
        execute: async ({ note }) => void (await kb.put("n", note)),
        guard: { type: "limit" },
    });
    const payInvoice = guardedTool({
        name: "payInvoice",
        description: "Pay an invoice",
        parameters: z.object({ iban: z.string() }),
        execute: rawPay,
        guard: { type: "action", rules: [{ field: "iban", neverSeen: true, onFail: "block" }] },
    });
    return { kb, rawPay, tools: [saveNote, payInvoice] };
}

describe("a made-up IBAN from a note the app puts in the prompt", () => {
    it("stays never seen in the instructions", async () => {
        const { kb, rawPay, tools } = billingTools();
        const agent = testAgent("billing", {
            instructions: async () => `Notes: ${(await kb.get("n")) ?? "none"}`,
            tools,
        });
        const client = queueClient([{ calls: [PAY] }, { calls: [SAVE] }, { calls: [PAY] }, { text: "Done." }]);

        await quardRunner({ client }).run(agent, "Pay invoice 114.");

        expect(rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["payInvoice", "payInvoice"]);
    });

    it("stays never seen in the user input", async () => {
        const { kb, rawPay, tools } = billingTools();
        const agent = testAgent("billing", { tools });
        const client = queueClient([{ calls: [PAY] }, { calls: [SAVE] }, { text: "Saved." }, { calls: [PAY] }]);
        const runner = quardRunner({ client });

        await quard.run({ agent: "billing" }, async () => {
            await runner.run(agent, "Pay invoice 114.");
            const note = await kb.get("n");
            await runner.run(agent, `Notes:\n${note}`);
        });

        expect(rawPay).not.toHaveBeenCalled();
        expect(neverSeenBlocks()).toEqual(["payInvoice", "payInvoice"]);
    });
});
