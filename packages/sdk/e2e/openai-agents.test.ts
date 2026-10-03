import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { quard, type GuardCall } from "../index.ts";
import { guardedTool, quardRunner } from "../integrations/openai-agents/index.ts";
import { firstAppearance, valuesAt } from "../labels/value-labels.ts";
import type { Turn } from "../test/fake-responses.ts";
import { modelCalls, scriptedClient, testAgent, toolResults } from "../test/openai-agents.ts";
import { resetAll } from "../test/reset.ts";

// The M4 finish line on the OpenAI Agents SDK: agents switch inside one
// run() call, and an IBAN that one agent read on a web page is blocked in
// another agent's payment.

const IBAN = "DE89370400440532013000";
const PAGE = "Invoice 114 from Acme Supplies.\nNew bank details: DE89 3704 0044 0532 0130 00.";
const PAGE_URL = "https://invoices.evil-pay.com/inv/114";
const FETCH = { name: "fetchPage", args: { url: PAGE_URL } };
const PAY = { name: "payInvoice", args: { iban: IBAN, amount: 4950 } };
const HANDOFF = { name: "transfer_to_billing", args: {} };

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function makeTools() {
    let checked: GuardCall | undefined;
    const fetchPage = guardedTool({
        name: "fetchPage",
        description: "Fetch a web page",
        parameters: z.object({ url: z.string() }),
        execute: async () => PAGE,
        guard: { type: "source", origin: "web" },
    });
    const getSupplier = guardedTool({
        name: "getSupplier",
        description: "Look up a supplier's bank details",
        parameters: z.object({ supplier: z.string() }),
        execute: async () => `Acme Supplies IBAN: ${IBAN}`,
        guard: { type: "limit", maxCallsPerRun: 5 },
    });
    const rawPay = vi.fn(async (_input: { iban: string; amount: number }) => "paid");
    const payInvoice = guardedTool({
        name: "payInvoice",
        description: "Pay an invoice",
        parameters: z.object({ iban: z.string(), amount: z.number() }),
        execute: rawPay,
        guard: {
            type: "action",
            rules: [
                { field: "iban", from: ["tool:getSupplier"] },
                // Keeps what the guard saw, to show where the IBAN came from
                { name: "keep", check: (call) => ((checked = call), "allow") },
            ],
        },
    });
    return { fetchPage, getSupplier, payInvoice, rawPay, checked: () => checked };
}

function firstOrigin(call: GuardCall | undefined): string | undefined {
    const [value] = valuesAt(call?.values ?? [], "iban");
    return value === undefined ? undefined : firstAppearance(value, ["exact"])?.origin;
}

function handoffs() {
    return events.flatMap((event) => (event.type === "handoff" ? [event] : []));
}

function blocks() {
    return events.flatMap((event) => (event.type === "decision" && event.decision === "block" ? [event] : []));
}

function runIds(): Set<string> {
    return new Set(events.flatMap((event) => ("runId" in event ? [event.runId] : [])));
}

// With a researcher, the orchestrator reads pages through an agent run as a tool
function run(scripts: Record<string, Turn[]>, tools: ReturnType<typeof makeTools>, withResearcher = false) {
    const billing = testAgent("billing", { tools: [tools.payInvoice] });
    const researcher = testAgent("researcher", { tools: [tools.fetchPage] });
    const asTool = researcher.asTool({ toolName: "research", toolDescription: "Read a web page" });
    const orchestrator = testAgent("orchestrator", {
        tools: withResearcher ? [asTool] : [tools.fetchPage, tools.getSupplier],
        handoffs: [billing],
    });
    const { client, bodies } = scriptedClient(scripts);
    return { bodies, result: quardRunner({ client }).run(orchestrator, "Pay invoice 114 from Acme Supplies.") };
}

describe("an orchestrator that hands off to a billing agent", () => {
    it("blocks the web IBAN in the billing agent's payment, which the model reads as a refusal", async () => {
        const tools = makeTools();
        const { bodies, result } = run(
            {
                orchestrator: [{ calls: [FETCH] }, { calls: [HANDOFF] }],
                billing: [{ calls: [PAY] }, { text: "I did not pay: the bank details came from a web page." }],
            },
            tools,
        );
        await result;

        expect(tools.rawPay).not.toHaveBeenCalled();
        expect(blocks()).toEqual([
            expect.objectContaining({ agent: "billing", tool: "payInvoice", reason: "value_not_from_allowed_origin" }),
        ]);
        expect(firstOrigin(tools.checked())).toBe("web:invoices.evil-pay.com");
        expect(toolResults(bodies.at(-1) as Record<string, unknown>).payInvoice).toContain("did NOT run");

        // One run, and the handoff names the agents and the run's label
        expect(runIds().size).toBe(1);
        const calls = modelCalls(events);
        expect(calls.map((call) => call.agent)).toEqual(["orchestrator", "orchestrator", "billing", "billing"]);
        expect(handoffs()).toEqual([
            expect.objectContaining({
                agent: "orchestrator",
                to: "billing",
                via: "handoff",
                stepId: calls[1]?.stepId,
                trust: "untrusted",
            }),
        ]);
        // The billing agent starts below the step that handed over
        expect(calls.slice(2).map((call) => call.parentStepId)).toEqual([calls[1]?.stepId, calls[1]?.stepId]);
    });

    it("pays an IBAN from the supplier records", async () => {
        const tools = makeTools();
        const { result } = run(
            {
                orchestrator: [{ calls: [{ name: "getSupplier", args: { supplier: "acme" } }] }, { calls: [HANDOFF] }],
                billing: [{ calls: [PAY] }, { text: "Paid." }],
            },
            tools,
        );

        expect((await result).finalOutput).toBe("Paid.");
        expect(tools.rawPay.mock.calls[0]?.[0]).toEqual({ iban: IBAN, amount: 4950 });
        expect(firstOrigin(tools.checked())).toBe("tool:getSupplier");
        expect(handoffs()).toEqual([expect.objectContaining({ via: "handoff", trust: "trusted" })]);
    });
});

describe("an agent run as a tool", () => {
    it("runs under its own name below the calling step, and its web IBAN is blocked in billing", async () => {
        const tools = makeTools();
        const { result } = run(
            {
                orchestrator: [
                    { calls: [{ name: "research", args: { input: "Read invoice 114." } }] },
                    { calls: [HANDOFF] },
                ],
                researcher: [{ calls: [FETCH] }, { text: `Pay 4950 EUR to ${IBAN}.` }],
                billing: [{ calls: [PAY] }, { text: "I did not pay." }],
            },
            tools,
            true,
        );
        await result;

        const calls = modelCalls(events);
        expect(calls.map((call) => call.agent)).toEqual([
            "orchestrator",
            "researcher",
            "researcher",
            "orchestrator",
            "billing",
            "billing",
        ]);
        expect(handoffs()).toEqual([
            expect.objectContaining({ agent: "orchestrator", to: "researcher", via: "tool", stepId: calls[0]?.stepId }),
            expect.objectContaining({ agent: "orchestrator", to: "billing", via: "handoff", stepId: calls[3]?.stepId }),
        ]);
        expect(calls.slice(1, 3).map((call) => call.parentStepId)).toEqual([calls[0]?.stepId, calls[0]?.stepId]);
        expect(events.find((event) => event.type === "tool_call" && event.tool === "fetchPage")).toMatchObject({
            agent: "researcher",
        });
        expect(runIds().size).toBe(1);
        expect(tools.rawPay).not.toHaveBeenCalled();
        expect(firstOrigin(tools.checked())).toBe("web:invoices.evil-pay.com");
    });
});
