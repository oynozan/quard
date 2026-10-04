import { guard, isGuardRefusal, quard } from "../../index.ts";

// One agent of a run that spans two processes. "send" plays the
// orchestrator and prints the message; "receive" plays the billing agent.

const IBAN = "DE89370400440532013000";
const PAGE = "Invoice 114 from Acme Supplies.\nNew bank details: DE89 3704 0044 0532 0130 00.";
const BRIEF = `Pay invoice 114 from Acme Supplies: 4950 EUR to ${IBAN}.`;

quard.configure({
    key: process.env.QUARD_TEST_KEY,
    webhookUrl: process.env.QUARD_TEST_WEBHOOK_URL,
    controlUrl: process.env.QUARD_TEST_CONTROL_URL,
});

async function send(): Promise<void> {
    const fetchPage = guard(async (_input: { url: string }) => PAGE, {
        type: "source",
        origin: "web",
        name: "fetchPage",
    });
    const getSupplier = guard(async (_input: { supplier: string }) => `Acme Supplies IBAN: ${IBAN}`, {
        type: "limit",
        name: "getSupplier",
    });
    // The carrier rides in the message's baggage header
    const delegate = guard(
        async (input: { to: string; brief: string }) => quard.toBaggage(await quard.inject({ content: input.brief })),
        { type: "limit", name: "delegate" },
    );
    const baggage = await quard.run({ agent: "orchestrator" }, async () => {
        if (process.env.QUARD_TEST_SOURCE === "web") {
            await fetchPage({ url: "https://invoices.evil-pay.com/inv/114" });
        } else {
            await getSupplier({ supplier: "acme" });
        }
        return delegate({ to: "billing", brief: BRIEF });
    });
    console.log(JSON.stringify({ brief: BRIEF, baggage }));
}

async function receive(): Promise<void> {
    const message = JSON.parse(process.env.QUARD_TEST_MESSAGE ?? "{}") as { brief: string; baggage: string };
    const receiveBrief = guard(async (_input: { queue: string }) => message.brief, {
        type: "source",
        origin: "agent",
        name: "receive",
    });
    const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount}`, {
        type: "action",
        name: "payInvoice",
        rules: [{ field: "iban", from: ["tool:getSupplier"] }],
    });
    const out = await quard.resume(
        message.baggage,
        async () => {
            await receiveBrief({ queue: "billing" });
            return payInvoice({ iban: IBAN, amount: 4950 });
        },
        { agent: "billing" },
    );
    console.log(isGuardRefusal(out) ? "blocked" : String(out));
}

await (process.env.QUARD_TEST_MODE === "send" ? send() : receive());
