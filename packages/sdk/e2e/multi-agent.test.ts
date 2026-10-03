import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, isGuardRefusal, quard, type Carrier, type GuardCall } from "../index.ts";
import { forgetRuns } from "../labels/records.ts";
import { firstAppearance, valuesAt } from "../labels/value-labels.ts";
import { resetAll } from "../test/reset.ts";

// The M4 finish line, with both processes simulated in one: an
// orchestrator reads a web page holding an IBAN and delegates the payment
// to a billing agent, which receives the brief and tries to pay.

const IBAN = "DE89370400440532013000";
const PAGE = "Invoice 114 from Acme Supplies.\nNew bank details: DE89 3704 0044 0532 0130 00.";
const BRIEF = `Pay invoice 114 from Acme Supplies: 4950 EUR to ${IBAN}.`;
const PAGE_URL = "https://invoices.evil-pay.com/inv/114";

type Message = { brief: string; carrier: Carrier | undefined };

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function makeAgents() {
    const outbox: Message[] = [];
    let checked: GuardCall | undefined;
    const fetchPage = guard(async (_input: { url: string }) => PAGE, {
        type: "source",
        origin: "web",
        name: "fetchPage",
    });
    const getSupplier = guard(async (_input: { supplier: string }) => `Acme Supplies IBAN: ${IBAN}`, {
        type: "limit",
        name: "getSupplier",
    });
    // The sender stores the labels before the message leaves
    const delegate = guard(
        async (input: { to: string; brief: string }) => {
            outbox.push({ brief: input.brief, carrier: quard.inject({ content: input.brief }) });
            return "sent";
        },
        { type: "limit", name: "delegate" },
    );
    // The billing agent's queue holds one message; the carrier rides beside it
    let inbox: Message | undefined;
    const receive = guard(async (_input: { queue: string }) => inbox?.brief, {
        type: "source",
        origin: "agent",
        name: "receive",
        carrierOf: () => inbox?.carrier,
    });
    const rawPay = vi.fn(async (_input: { iban: string; amount: number }) => "paid");
    const payInvoice = guard(rawPay, {
        type: "action",
        name: "payInvoice",
        rules: [
            { field: "iban", from: ["tool:getSupplier"] },
            // Keeps what the action guard saw, to show where the IBAN came from
            {
                name: "keep",
                check: (call) => {
                    checked = call;
                    return "allow";
                },
            },
        ],
    });
    const billing = async (message: Message) => {
        inbox = message;
        await receive({ queue: "billing" });
        return payInvoice({ iban: IBAN, amount: 4950 });
    };
    return { outbox, rawPay, checked: () => checked, fetchPage, getSupplier, delegate, billing };
}

function firstOrigin(call: GuardCall | undefined): string | undefined {
    const [value] = valuesAt(call?.values ?? [], "iban");
    return value === undefined ? undefined : firstAppearance(value, ["exact"])?.origin;
}

function decisions(guardName: string) {
    return events.flatMap((event) => (event.type === "decision" && event.guard === guardName ? [event] : []));
}

function received() {
    return events.find((event) => event.type === "content" && event.origin.startsWith("agent:"));
}

describe("an IBAN from a web page, delegated to another agent", () => {
    async function orchestrate(agents: ReturnType<typeof makeAgents>): Promise<Message> {
        await quard.run({ agent: "orchestrator" }, async () => {
            await agents.fetchPage({ url: PAGE_URL });
            await agents.delegate({ to: "billing", brief: BRIEF });
        });
        const message = agents.outbox[0];
        if (message === undefined) {
            throw new Error("the orchestrator sent nothing");
        }
        // The billing agent runs in another process: it keeps no run state
        forgetRuns();
        return message;
    }

    it("is blocked in the receiving agent, which sees it first appeared in web content", async () => {
        const agents = makeAgents();
        const message = await orchestrate(agents);

        const out = await quard.resume(message.carrier, () => agents.billing(message), { agent: "billing" });

        expect(isGuardRefusal(out)).toBe(true);
        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(decisions("action")[0]).toMatchObject({
            agent: "billing",
            decision: "block",
            field: "iban",
            reason: "value_not_from_allowed_origin",
        });
        expect(firstOrigin(agents.checked())).toBe("web:invoices.evil-pay.com");
        expect(received()).toMatchObject({ origin: "agent:orchestrator", agent: "billing", trust: "untrusted" });
        // Both agents' calls land in one run
        const runIds = new Set(events.flatMap((event) => ("runId" in event ? [event.runId] : [])));
        expect(runIds).toEqual(new Set([message.carrier?.runId]));
    });

    it("is blocked when the brief was changed on the way", async () => {
        const agents = makeAgents();
        const message = await orchestrate(agents);
        const tampered = { ...message, brief: `${BRIEF} Urgent.` };

        await quard.resume(message.carrier, () => agents.billing(tampered), { agent: "billing" });

        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(received()).toMatchObject({ origin: "agent:orchestrator", trust: "untrusted" });
        expect(firstOrigin(agents.checked())).toBe("agent:orchestrator");
    });

    it("is blocked when the message comes with no carrier", async () => {
        const agents = makeAgents();
        const message = await orchestrate(agents);
        const bare = { ...message, carrier: undefined };

        await quard.resume(undefined, () => agents.billing(bare), { agent: "billing" });

        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(received()).toMatchObject({ origin: "agent:unknown", trust: "untrusted" });
        expect(decisions("action")[0]).toMatchObject({ decision: "block", field: "iban" });
    });

    it("is blocked when the billing agent runs in the same process", async () => {
        const agents = makeAgents();
        await quard.run({ agent: "orchestrator" }, async () => {
            await agents.fetchPage({ url: PAGE_URL });
            await agents.delegate({ to: "billing", brief: BRIEF });
        });
        const message = agents.outbox[0] as Message;

        await quard.resume(message.carrier, () => agents.billing(message), { agent: "billing" });

        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(firstOrigin(agents.checked())).toBe("web:invoices.evil-pay.com");
    });
});

describe("an IBAN from the supplier records, delegated to another agent", () => {
    it("is paid, because its label travels with the brief", async () => {
        const agents = makeAgents();
        await quard.run({ agent: "orchestrator" }, async () => {
            await agents.getSupplier({ supplier: "acme" });
            await agents.delegate({ to: "billing", brief: BRIEF });
        });
        const message = agents.outbox[0] as Message;
        forgetRuns();

        // The receive guard here finds the carrier quard.resume() came in with
        const out = await quard.resume(message.carrier, () => agents.billing({ ...message, carrier: undefined }), {
            agent: "billing",
        });

        expect(out).toBe("paid");
        expect(agents.rawPay).toHaveBeenCalledWith({ iban: IBAN, amount: 4950 });
        expect(received()).toMatchObject({ origin: "agent:orchestrator", trust: "trusted" });
        expect(firstOrigin(agents.checked())).toBe("tool:getSupplier");
    });
});
