import { guard, quard } from "../../../packages/sdk/index.ts";

// An app process whose payInvoice call waits in the dashboard until the test ends it
quard.configure({ key: process.env.QUARD_TEST_KEY, controlUrl: process.env.QUARD_TEST_CONTROL_URL });

const payInvoice = guard(async (input: object) => `paid ${JSON.stringify(input)}`, {
    type: "approval",
    name: "payInvoice",
});

const invoice: object = JSON.parse(process.env.QUARD_TEST_INVOICE ?? "{}");
console.log(String(await quard.run({ agent: "billing" }, () => payInvoice(invoice))));
